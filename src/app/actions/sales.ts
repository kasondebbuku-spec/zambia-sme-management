"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { DomainError } from "@/server/errors";
import { checkout, voidSale, type CheckoutInput } from "@/server/sales";
import { requireUser } from "@/server/session";
import { text, toFormState, type FormState } from "./result";

export type CheckoutResult = { ok: true; saleId: string } | { ok: false; error: string };

/** Called by the till with the basket. Prices come from the database, not from here. */
export async function completeSale(input: CheckoutInput): Promise<CheckoutResult> {
  const { ctx } = await requireUser();
  try {
    const sale = await checkout(ctx, input);
    revalidatePath("/sales");
    revalidatePath("/dashboard");
    return { ok: true, saleId: sale.id };
  } catch (e) {
    if (e instanceof ZodError) return { ok: false, error: e.issues[0]?.message ?? "Check the sale details" };
    if (e instanceof DomainError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function cancelSale(saleId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const { ctx } = await requireUser();
  try {
    await voidSale(ctx, saleId, text(form, "reason"));
  } catch (e) {
    return toFormState(e);
  }
  revalidatePath(`/sales/${saleId}`);
  revalidatePath("/sales");
  return { ok: "Sale cancelled. The items are back in stock." };
}
