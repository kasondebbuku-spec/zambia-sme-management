"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/actions/result";
import { Field, FormMessage, SubmitButton } from "./form";

type FieldSpec = {
  name: string;
  label: string;
  required?: boolean;
  placeholder?: string;
  hint?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  errorKey?: string; // when the server reports the error under another name
  defaultValue?: string;
};

/** A form made of plain text fields: keeps what was typed after an error, shows field errors. */
export function SimpleForm({ action, fields, submit, columns = 2 }: { action: (prev: FormState, form: FormData) => Promise<FormState>; fields: FieldSpec[]; submit: string; columns?: 1 | 2 | 3 }) {
  const [state, formAction] = useActionState(action, undefined);
  const grid = { 1: "", 2: "sm:grid-cols-2", 3: "sm:grid-cols-3" }[columns];
  return (
    <form action={formAction} className="space-y-4">
      <FormMessage state={state} />
      <div className={`grid gap-4 ${grid}`}>
        {fields.map((f) => (
          <Field
            key={f.name}
            label={f.label}
            name={f.name}
            required={f.required}
            placeholder={f.placeholder}
            hint={f.hint}
            inputMode={f.inputMode}
            defaultValue={state?.values?.[f.name] ?? f.defaultValue}
            error={state?.fieldErrors?.[f.errorKey ?? f.name]}
          />
        ))}
      </div>
      <SubmitButton>{submit}</SubmitButton>
    </form>
  );
}
