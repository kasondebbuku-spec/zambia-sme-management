import type { Metadata } from "next";
import { SignUpForm } from "@/components/SignUpForm";
import { signUpNeedsCode } from "@/server/accounts";

export const metadata: Metadata = { title: "Register your business" };

// Read SIGNUP_CODE on every visit, not once at build time, so changing it on the host
// takes effect after a restart without rebuilding.
export const dynamic = "force-dynamic";

export default function SignUpPage() {
  return <SignUpForm needsCode={signUpNeedsCode()} />;
}
