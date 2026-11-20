"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/actions/result";
import { Field, FormMessage, SubmitButton } from "./form";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="rounded-xl border border-line bg-surface px-4 py-2 text-sm font-medium hover:bg-canvas">
      Print receipt
    </button>
  );
}

export function CancelSaleForm({ action }: { action: (prev: FormState, form: FormData) => Promise<FormState> }) {
  const [state, formAction] = useActionState(action, undefined);
  if (state?.ok) return <FormMessage state={state} />;
  return (
    <details className="card p-4 print:hidden">
      <summary className="cursor-pointer text-sm font-medium text-danger">Cancel this sale</summary>
      <form action={formAction} className="mt-3 space-y-3">
        <p className="text-sm text-muted">The sale is kept but marked cancelled, and every item goes back into stock.</p>
        <FormMessage state={state} />
        <Field label="Why?" name="reason" required minLength={3} placeholder="Customer changed their mind" defaultValue={state?.values?.reason} error={state?.fieldErrors?.reason} />
        <SubmitButton>Cancel sale</SubmitButton>
      </form>
    </details>
  );
}
