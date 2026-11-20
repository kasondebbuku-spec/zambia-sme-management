"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { parseKwacha } from "@/lib/money";
import {
  createCustomer,
  quickAddCustomer,
  recordPayment,
  setCreditLimit,
} from "@/server/customers";
import { DomainError } from "@/server/errors";
import { requireUser } from "@/server/session";
import { failed, text, toFormState, type FormState } from "./result";

const kwachaField = (form: FormData, key: string, label: string) => {
  const raw = text(form, key).trim();
  const v = raw === "" ? 0 : parseKwacha(raw);
  return v === null
    ? { error: `Enter the ${label} in kwacha, like 500`, value: NaN }
    : { value: v };
};

export async function addCustomer(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const { ctx } = await requireUser();
  const limit = kwachaField(form, "creditLimit", "credit limit");
  if (limit.error)
    return failed(
      {
        error: "Please check the highlighted fields.",
        fieldErrors: { creditLimitNgwee: limit.error },
      },
      form,
    );
  let id: string;
  try {
    id = (
      await createCustomer(ctx, {
        name: text(form, "name"),
        phone: text(form, "phone"),
        creditLimitNgwee: limit.value,
      })
    ).id;
  } catch (e) {
    return failed(toFormState(e), form);
  }
  revalidatePath("/customers");
  redirect(`/customers/${id}`);
}

export async function takePayment(
  customerId: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const { ctx } = await requireUser();
  const amount = parseKwacha(text(form, "amount"));
  if (amount === null)
    return failed(
      {
        error: "Enter the amount in kwacha, like 150 or 75.50",
        fieldErrors: { amountNgwee: "Enter an amount like 150" },
      },
      form,
    );
  const method =
    text(form, "method") === "MOBILE_MONEY" ? "MOBILE_MONEY" : "CASH";
  try {
    await recordPayment(ctx, customerId, {
      amountNgwee: amount,
      method,
      reference: text(form, "reference"),
    });
  } catch (e) {
    return failed(toFormState(e), form);
  }
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
  return { ok: "Payment recorded." };
}

export async function changeLimit(
  customerId: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const { ctx } = await requireUser();
  const limit = kwachaField(form, "creditLimit", "credit limit");
  if (limit.error) return failed({ error: limit.error }, form);
  try {
    await setCreditLimit(ctx, customerId, limit.value);
  } catch (e) {
    return failed(toFormState(e), form);
  }
  revalidatePath(`/customers/${customerId}`);
  return { ok: "Credit limit updated." };
}

export type QuickAddResult =
  | {
      ok: true;
      existed: boolean;
      customer: {
        id: string;
        name: string;
        phone: string | null;
        availableNgwee: number;
      };
    }
  | { ok: false; error: string };

/** Adds a customer from the till without leaving the sale. */
export async function addCustomerAtTill(input: {
  name: string;
  phone: string;
}): Promise<QuickAddResult> {
  const { ctx } = await requireUser();
  try {
    const { customer: c, existed } = await quickAddCustomer(ctx, input);
    revalidatePath("/customers");
    return {
      ok: true,
      existed,
      customer: {
        id: c.id,
        name: c.name,
        phone: c.phone,
        availableNgwee: Math.max(0, c.creditLimitNgwee - c.balanceNgwee),
      },
    };
  } catch (e) {
    if (e instanceof ZodError)
      return {
        ok: false,
        error: e.issues[0]?.message ?? "Check the customer details",
      };
    if (e instanceof DomainError) return { ok: false, error: e.message };
    throw e;
  }
}
