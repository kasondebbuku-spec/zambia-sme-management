"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { DomainError } from "@/server/errors";
import { cancelPurchase, createPurchase, createSupplier, receivePurchase } from "@/server/purchases";
import { requireUser } from "@/server/session";
import { failed, text, toFormState, type FormState } from "./result";

export type ActionResult = { ok: true; id: string } | { ok: false; error: string };

function asResult(e: unknown): ActionResult {
  if (e instanceof ZodError) return { ok: false, error: e.issues[0]?.message ?? "Check the details" };
  if (e instanceof DomainError) return { ok: false, error: e.message };
  throw e;
}

export async function addSupplier(_prev: FormState, form: FormData): Promise<FormState> {
  const { ctx } = await requireUser();
  try {
    await createSupplier(ctx, { name: text(form, "name"), phone: text(form, "phone"), notes: text(form, "notes") });
  } catch (e) {
    return failed(toFormState(e), form);
  }
  revalidatePath("/suppliers");
  return { ok: "Supplier added." };
}

export async function placeOrder(input: { supplierId: string; note?: string; items: { productId: string; quantity: number; unitCostNgwee: number }[] }): Promise<ActionResult> {
  const { ctx } = await requireUser();
  try {
    const po = await createPurchase(ctx, input);
    revalidatePath("/purchases");
    return { ok: true, id: po.id };
  } catch (e) {
    return asResult(e);
  }
}

export async function receiveOrder(purchaseId: string, lines: { productId: string; quantity: number; unitCostNgwee: number }[]): Promise<ActionResult> {
  const { ctx } = await requireUser();
  try {
    await receivePurchase(ctx, purchaseId, lines);
    revalidatePath(`/purchases/${purchaseId}`);
    revalidatePath("/purchases");
    revalidatePath("/products");
    return { ok: true, id: purchaseId };
  } catch (e) {
    return asResult(e);
  }
}

export async function cancelOrder(purchaseId: string): Promise<ActionResult> {
  const { ctx } = await requireUser();
  try {
    await cancelPurchase(ctx, purchaseId);
    revalidatePath(`/purchases/${purchaseId}`);
    return { ok: true, id: purchaseId };
  } catch (e) {
    return asResult(e);
  }
}
