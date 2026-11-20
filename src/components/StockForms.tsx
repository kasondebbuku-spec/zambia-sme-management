"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/actions/result";
import { Field, FormMessage, SubmitButton } from "./form";

type Action = (prev: FormState, form: FormData) => Promise<FormState>;

export function MovementForm({ action, unit }: { action: Action; unit: string }) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className="space-y-3">
      <h3 className="font-medium">Record stock in or out</h3>
      <FormMessage state={state} />
      <fieldset className="flex flex-wrap gap-3 text-sm">
        <legend className="sr-only">What happened</legend>
        {[
          ["restock", "Received from supplier"],
          ["return", "Returned by customer"],
          ["damage", "Damaged or expired"],
        ].map(([value, label]) => (
          <label key={value} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2">
            <input type="radio" name="kind" value={value} defaultChecked={(state?.values?.kind ?? "restock") === value} /> {label}
          </label>
        ))}
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={`How many (${unit})`} name="quantity" defaultValue={state?.values?.quantity} inputMode="numeric" required error={state?.fieldErrors?.quantity} />
        <Field label="Note" name="note" defaultValue={state?.values?.note} placeholder="Invoice number, reason…" />
      </div>
      <SubmitButton>Record</SubmitButton>
    </form>
  );
}

export function CountForm({ action, current }: { action: Action; current: number }) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className="space-y-3">
      <h3 className="font-medium">Physical count</h3>
      <p className="text-sm text-muted">
        Counted the shelf? Enter what&apos;s really there. The system says {current}; any difference is recorded as an adjustment.
      </p>
      <FormMessage state={state} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Counted" name="counted" defaultValue={state?.values?.counted} inputMode="numeric" required />
        <Field label="Note" name="note" defaultValue={state?.values?.note} placeholder="Monthly stock take" />
      </div>
      <SubmitButton variant="secondary">Save count</SubmitButton>
    </form>
  );
}
