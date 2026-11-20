"use client";

import { useFormStatus } from "react-dom";
import type { FormState } from "@/app/actions/result";

export function Field({
  label,
  name,
  error,
  hint,
  ...input
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; name: string; error?: string; hint?: string }) {
  const id = input.id ?? `f-${name}`;
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        {...input}
        className={`w-full rounded-md border bg-surface px-3 py-2 text-base ${error ? "border-danger" : "border-line"} ${input.className ?? ""}`}
      />
      {error ? (
        <p id={`${id}-error`} className="text-sm text-danger">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="text-xs text-muted">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

export function SubmitButton({ children, pending, variant = "primary" }: { children: React.ReactNode; pending?: string; variant?: "primary" | "secondary" }) {
  const { pending: busy } = useFormStatus();
  const styles = variant === "primary" ? "bg-brand text-white hover:bg-brand-dark" : "border border-line bg-surface hover:bg-canvas";
  return (
    <button type="submit" disabled={busy} className={`rounded-md px-4 py-2 text-sm font-medium disabled:opacity-60 ${styles}`}>
      {busy ? (pending ?? "Saving…") : children}
    </button>
  );
}

export function FormMessage({ state }: { state: FormState }) {
  if (state?.error)
    return (
      <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
        {state.error}
      </p>
    );
  if (state?.ok)
    return (
      <p role="status" className="rounded-md bg-good-soft px-3 py-2 text-sm text-good">
        {state.ok}
      </p>
    );
  return null;
}
