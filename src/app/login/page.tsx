"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn } from "@/app/actions/auth";
import { AuthCard } from "@/components/AuthCard";
import { Field, FormMessage, SubmitButton } from "@/components/form";

export default function LoginPage() {
  const [state, action] = useActionState(signIn, undefined);
  return (
    <AuthCard
      title="Sign in to Kantemba"
      subtitle="Stock, sales and profit for your shop"
      footer={
        <>
          New here?{" "}
          <Link href="/signup" className="font-medium text-brand hover:underline">
            Register your business
          </Link>
        </>
      }
    >
      <form action={action} className="space-y-4">
        <FormMessage state={state} />
        <Field label="Email" name="email" defaultValue={state?.values?.email} type="email" autoComplete="username" required />
        <Field label="Password" name="password" type="password" autoComplete="current-password" required />
        <SubmitButton pending="Signing in…">Sign in</SubmitButton>
      </form>
    </AuthCard>
  );
}
