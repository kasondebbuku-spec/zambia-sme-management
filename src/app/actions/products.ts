"use server";

import type { MovementType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseKwacha } from "@/lib/money";
import { createProduct, updateProduct } from "@/server/products";
import { requireUser } from "@/server/session";
import { recordCount, recordMovement } from "@/server/stock";
import { failed, int, text, toFormState, type FormState } from "./result";

function productFields(form: FormData) {
  return {
    sku: text(form, "sku"),
    name: text(form, "name"),
    category: text(form, "category") || "General",
    unit: text(form, "unit") || "each",
    costNgwee: parseKwacha(text(form, "cost")) ?? NaN,
    priceNgwee: parseKwacha(text(form, "price")) ?? NaN,
    reorderLevel: int(form, "reorderLevel", 0),
  };
}

// Kwacha fields that don't parse become NaN; give them a clearer message than "Expected number".
function moneyErrors(form: FormData) {
  const fieldErrors: Record<string, string> = {};
  if (parseKwacha(text(form, "cost")) === null) fieldErrors.costNgwee = "Enter the cost in kwacha, like 12.50";
  if (parseKwacha(text(form, "price")) === null) fieldErrors.priceNgwee = "Enter the price in kwacha, like 15.00";
  return Object.keys(fieldErrors).length ? { error: "Please check the highlighted fields.", fieldErrors } : null;
}

export async function addProduct(_prev: FormState, form: FormData): Promise<FormState> {
  const { ctx } = await requireUser();
  const bad = moneyErrors(form);
  if (bad) return failed(bad, form);
  let id: string;
  try {
    id = (await createProduct(ctx, { ...productFields(form), openingStock: int(form, "openingStock", 0) })).id;
  } catch (e) {
    return failed(toFormState(e), form);
  }
  revalidatePath("/products");
  redirect(`/products/${id}`);
}

export async function editProduct(id: string, _prev: FormState, form: FormData): Promise<FormState> {
  const { ctx } = await requireUser();
  const bad = moneyErrors(form);
  if (bad) return failed(bad, form);
  try {
    await updateProduct(ctx, id, productFields(form));
  } catch (e) {
    return failed(toFormState(e), form);
  }
  revalidatePath(`/products/${id}`);
  return { ok: "Saved." };
}

const MOVEMENT_SIGN: Record<string, { type: MovementType; sign: 1 | -1; label: string }> = {
  restock: { type: "RESTOCK", sign: 1, label: "received" },
  return: { type: "RETURN", sign: 1, label: "returned" },
  damage: { type: "DAMAGE", sign: -1, label: "written off" },
};

/** Restock, customer return or damage. The form sends a positive quantity; the kind decides the sign. */
export async function stockMovement(productId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const { ctx } = await requireUser();
  const kind = MOVEMENT_SIGN[text(form, "kind")];
  const qty = int(form, "quantity");
  if (!kind) return failed({ error: "Choose what happened." }, form);
  if (!Number.isInteger(qty) || qty <= 0) return failed({ error: "Enter how many, as a whole number above zero.", fieldErrors: { quantity: "Whole number above zero" } }, form);

  try {
    await recordMovement(ctx, { productId, type: kind.type, quantity: kind.sign * qty, note: text(form, "note") });
  } catch (e) {
    return failed(toFormState(e), form);
  }
  revalidatePath(`/products/${productId}`);
  return { ok: `${qty} ${kind.label}.` };
}

export async function stockCount(productId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const { ctx } = await requireUser();
  const counted = int(form, "counted");
  try {
    const movement = await recordCount(ctx, productId, counted, text(form, "note") || undefined);
    revalidatePath(`/products/${productId}`);
    return { ok: movement ? `Stock corrected by ${movement.quantity > 0 ? "+" : ""}${movement.quantity}.` : "The count matches. Nothing to change." };
  } catch (e) {
    return failed(toFormState(e), form);
  }
}
