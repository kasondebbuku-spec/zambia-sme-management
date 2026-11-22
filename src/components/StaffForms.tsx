"use client";

import { useActionState, useState } from "react";
import type { FormState } from "@/app/actions/result";
import { Field, FormMessage, SubmitButton } from "./form";

type Action = (prev: FormState, form: FormData) => Promise<FormState>;
type Role = "MANAGER" | "CASHIER";

const ROLE_HELP: Record<Role, string> = {
  CASHIER: "Sells, takes customer payments and sees stock. Can't see profit, cancel sales or change prices.",
  MANAGER: "Everything a cashier does, plus products, prices, orders, credit limits and cancelling sales.",
};

function RoleChoice({ value, onChange }: { value: Role; onChange: (r: Role) => void }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Role</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {(["CASHIER", "MANAGER"] as const).map((r) => (
          <label key={r} className={`flex cursor-pointer gap-3 rounded-xl border p-3 text-sm ${value === r ? "border-brand bg-brand-soft" : "border-line bg-surface"}`}>
            <input type="radio" name="role" value={r} checked={value === r} onChange={() => onChange(r)} className="mt-1" />
            <span>
              <span className="block font-semibold">{r === "CASHIER" ? "Cashier" : "Manager"}</span>
              <span className="text-xs text-muted">{ROLE_HELP[r]}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function AddStaffForm({ action }: { action: Action }) {
  const [state, formAction] = useActionState(action, undefined);
  const [role, setRole] = useState<Role>((state?.values?.role as Role) ?? "CASHIER");
  return (
    <form action={formAction} className="space-y-4">
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" name="name" required placeholder="Chanda Mulenga" defaultValue={state?.values?.name} error={state?.fieldErrors?.name} />
        <Field label="Email" name="email" type="email" required autoComplete="off" defaultValue={state?.values?.email} error={state?.fieldErrors?.email} hint="They sign in with this." />
      </div>
      <RoleChoice value={role} onChange={setRole} />
      <Field
        label="Starting password"
        name="password"
        type="text"
        required
        autoComplete="new-password"
        spellCheck={false}
        error={state?.fieldErrors?.password}
        hint="At least 10 characters. Tell them in person, and ask them to change it under My account."
      />
      <SubmitButton>Add staff member</SubmitButton>
    </form>
  );
}

export function RoleForm({ action, current }: { action: Action; current: Role }) {
  const [state, formAction] = useActionState(action, undefined);
  const [role, setRole] = useState<Role>(current);
  return (
    <form action={formAction} className="space-y-3">
      <FormMessage state={state} />
      <RoleChoice value={role} onChange={setRole} />
      {role !== current && <SubmitButton variant="secondary">Save role</SubmitButton>}
    </form>
  );
}

export function AccessForm({ action, active, name }: { action: (prev: FormState) => Promise<FormState>; active: boolean; name: string }) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form
      action={formAction}
      className="space-y-2"
      onSubmit={(e) => {
        if (active && !confirm(`Switch off ${name}'s login? They'll be signed out straight away.`)) e.preventDefault();
      }}
    >
      <FormMessage state={state} />
      <p className="text-sm text-muted">
        {active ? "When someone leaves, switch their login off. Their past sales stay on record." : "This login is switched off. Switch it back on to let them sign in again."}
      </p>
      <button
        type="submit"
        className={`rounded-xl px-4 py-2 text-sm font-semibold ${active ? "border border-danger/40 bg-surface text-danger hover:bg-danger-soft" : "bg-forest text-white hover:opacity-90"}`}
      >
        {active ? "Switch off login" : "Switch login back on"}
      </button>
    </form>
  );
}

export function ResetPasswordForm({ action, userId }: { action: Action; userId: string }) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className="space-y-3">
      <FormMessage state={state} />
      <Field id={`reset-${userId}`} label="New password" name="password" type="text" required autoComplete="new-password" spellCheck={false} hint="At least 10 characters. They'll be signed out on every phone." />
      <SubmitButton variant="secondary">Set new password</SubmitButton>
    </form>
  );
}

export function ChangePasswordForm({ action }: { action: Action }) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className="space-y-4">
      <FormMessage state={state} />
      <Field label="Current password" name="currentPassword" type="password" required autoComplete="current-password" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="New password" name="password" type="password" required autoComplete="new-password" hint="At least 10 characters." />
        <Field label="New password again" name="confirmPassword" type="password" required autoComplete="new-password" error={state?.fieldErrors?.confirmPassword} />
      </div>
      <SubmitButton>Change password</SubmitButton>
    </form>
  );
}
