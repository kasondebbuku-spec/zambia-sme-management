"use client";

import { useActionState, useState } from "react";
import type { FormState } from "@/app/actions/result";
import { Field, FormMessage, SubmitButton } from "./form";

type Action = (prev: FormState, form: FormData) => Promise<FormState>;

export function PaymentForm({ action, owes }: { action: Action; owes: string }) {
  const [state, formAction] = useActionState(action, undefined);
  const [method, setMethod] = useState(state?.values?.method ?? "CASH");
  return (
    <form action={formAction} className="space-y-3">
      <h2 className="text-lg font-semibold">Take a payment</h2>
      <FormMessage state={state} />
      <fieldset className="flex gap-3 text-sm">
        <legend className="sr-only">Paid by</legend>
        {[
          ["CASH", "Cash"],
          ["MOBILE_MONEY", "Mobile money"],
        ].map(([value, label]) => (
          <label key={value} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2">
            <input type="radio" name="method" value={value} checked={method === value} onChange={() => setMethod(value!)} /> {label}
          </label>
        ))}
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Amount (K)" name="amount" inputMode="decimal" required placeholder={owes} defaultValue={state?.values?.amount} error={state?.fieldErrors?.amountNgwee} />
        {method === "MOBILE_MONEY" && <Field label="Transaction ID" name="reference" required defaultValue={state?.values?.reference} />}
      </div>
      <SubmitButton>Record payment</SubmitButton>
    </form>
  );
}

export function LimitForm({ action, current }: { action: Action; current: string }) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className="space-y-3">
      <h2 className="text-lg font-semibold">Credit limit</h2>
      <p className="text-sm text-muted">The most this customer may owe at once. Set 0 for cash only. Lowering it below what they owe stops new credit until they pay.</p>
      <FormMessage state={state} />
      <Field label="Limit (K)" name="creditLimit" inputMode="decimal" defaultValue={state?.values?.creditLimit ?? current} required />
      <SubmitButton variant="secondary">Save limit</SubmitButton>
    </form>
  );
}

/** The customer collects their kept change in cash. */
export function PayOutChangeForm({ action, held }: { action: Action; held: string }) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className="space-y-2">
      <FormMessage state={state} />
      <Field label="Give them now (K)" name="amount" inputMode="decimal" required defaultValue={state?.values?.amount ?? held} error={state?.fieldErrors?.amountNgwee} />
      <SubmitButton variant="secondary">Hand over change</SubmitButton>
    </form>
  );
}
