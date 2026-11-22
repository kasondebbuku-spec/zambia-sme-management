"use server";

import { revalidatePath } from "next/cache";
import { requireUser, startSession } from "@/server/session";
import { addStaff, changeOwnPassword, resetStaffPassword, setStaffActive, setStaffRole } from "@/server/staff";
import { failed, text, toFormState, type FormState } from "./result";

// The service validates the role; anything other than MANAGER or CASHIER is refused there.
const role = (form: FormData) => text(form, "role") as "MANAGER" | "CASHIER";

export async function addStaffMember(_prev: FormState, form: FormData): Promise<FormState> {
  const { ctx } = await requireUser();
  let name: string;
  try {
    name = (await addStaff(ctx, { name: text(form, "name"), email: text(form, "email"), role: role(form), password: text(form, "password") })).name;
  } catch (e) {
    return failed(toFormState(e), form);
  }
  revalidatePath("/staff");
  return { ok: `${name} can now sign in with that email and password. Ask them to change the password under My account.` };
}

export async function changeStaffRole(userId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const { ctx } = await requireUser();
  try {
    await setStaffRole(ctx, userId, role(form));
  } catch (e) {
    return toFormState(e);
  }
  revalidatePath("/staff");
  return { ok: "Role changed." };
}

export async function switchStaffAccess(userId: string, isActive: boolean): Promise<FormState> {
  const { ctx } = await requireUser();
  try {
    await setStaffActive(ctx, userId, isActive);
  } catch (e) {
    return toFormState(e);
  }
  revalidatePath("/staff");
  return { ok: isActive ? "They can sign in again." : "Switched off. They've been signed out." };
}

export async function resetPassword(userId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const { ctx } = await requireUser();
  try {
    await resetStaffPassword(ctx, userId, text(form, "password"));
  } catch (e) {
    return failed(toFormState(e), form);
  }
  return { ok: "New password set. They've been signed out and must use the new one." };
}

export async function changeMyPassword(_prev: FormState, form: FormData): Promise<FormState> {
  const { ctx } = await requireUser();
  if (text(form, "password") !== text(form, "confirmPassword")) return { error: "The two new passwords don't match.", fieldErrors: { confirmPassword: "Type the same password again" } };
  try {
    await changeOwnPassword(ctx, text(form, "currentPassword"), text(form, "password"));
  } catch (e) {
    return toFormState(e);
  }
  // Other phones are now signed out; keep this one signed in with a fresh session.
  await startSession(ctx.userId);
  return { ok: "Password changed. Any other phone signed in as you has been signed out." };
}
