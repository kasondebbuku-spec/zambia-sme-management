"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signUp } from "@/app/actions/auth";
import { AuthCard } from "@/components/AuthCard";
import { Field, FormMessage, SubmitButton } from "@/components/form";

export default function SignUpPage() {
  const [state, action] = useActionState(signUp, undefined);
  const err = state?.fieldErrors ?? {};
  const v = state?.values ?? {};
  return (
    <AuthCard
      title="Register your business"
      subtitle="You'll be the owner and can add staff later"
      footer={
        <>
          Already registered?{" "}
          <Link href="/login" className="font-medium text-brand hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form action={action} className="space-y-4">
        <FormMessage state={state} />
        <Field label="Business name" name="businessName" defaultValue={v.businessName} placeholder="Mwila General Dealers" required error={err.businessName} />
        <Field label="Town" name="town" defaultValue={v.town} placeholder="Lusaka" error={err.town} />
        <Field label="Your name" name="ownerName" defaultValue={v.ownerName} autoComplete="name" required error={err.ownerName} />
        <Field label="Email" name="email" defaultValue={v.email} type="email" autoComplete="email" required error={err.email} />
        <Field label="Password" name="password" type="password" autoComplete="new-password" required minLength={10} hint="At least 10 characters" error={err.password} />
        <SubmitButton pending="Creating…">Create account</SubmitButton>
      </form>
    </AuthCard>
  );
}
