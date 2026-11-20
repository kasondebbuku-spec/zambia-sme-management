import { ZodError } from "zod";
import { DomainError } from "@/server/errors";

/**
 * What a form gets back from a server action. `values` echoes what was typed, because
 * React 19 clears a form after it submits: without it, one mistake wipes the whole form.
 */
export type FormState = { error?: string; fieldErrors?: Record<string, string>; ok?: string; values?: Record<string, string> } | undefined;

/** Everything typed into the form except passwords and React's own hidden fields. */
export function typed(form: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string" && !key.startsWith("$") && !/password/i.test(key)) values[key] = value;
  }
  return values;
}

/** An error result that keeps what the user typed. */
export const failed = (state: FormState, form: FormData): FormState => ({ ...state, values: typed(form) });

/** Turns expected errors into messages for the form; anything unexpected is rethrown. */
export function toFormState(e: unknown): FormState {
  if (e instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of e.issues) fieldErrors[String(issue.path[0] ?? "form")] ??= issue.message;
    return { error: "Please check the highlighted fields.", fieldErrors };
  }
  if (e instanceof DomainError) return { error: e.message };
  throw e;
}

export const text = (f: FormData, key: string) => String(f.get(key) ?? "");

/** A whole number from a form field, or NaN (which validation then rejects). */
export const int = (f: FormData, key: string, fallback?: number) => {
  const raw = text(f, key).trim();
  if (raw === "" && fallback !== undefined) return fallback;
  return /^-?\d+$/.test(raw) ? Number(raw) : NaN;
};
