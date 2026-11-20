"use server";

import { redirect } from "next/navigation";
import { checkPassword, clearAttempts, registerBusiness, tooManyAttempts } from "@/server/accounts";
import { endSession, startSession } from "@/server/session";
import { failed, text, toFormState, type FormState } from "./result";

export async function signUp(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    const user = await registerBusiness({
      businessName: text(form, "businessName"),
      town: text(form, "town"),
      ownerName: text(form, "ownerName"),
      email: text(form, "email"),
      password: text(form, "password"),
    });
    await startSession(user.id);
  } catch (e) {
    return failed(toFormState(e), form);
  }
  redirect("/dashboard");
}

export async function signIn(_prev: FormState, form: FormData): Promise<FormState> {
  const email = text(form, "email").trim().toLowerCase();
  if (tooManyAttempts(email)) return failed({ error: "Too many attempts. Wait 15 minutes and try again." }, form);

  const user = await checkPassword(email, text(form, "password"));
  if (!user) return failed({ error: "Wrong email or password." }, form);

  clearAttempts(email);
  await startSession(user.id);
  redirect("/dashboard");
}

export async function signOut() {
  await endSession();
  redirect("/login");
}
