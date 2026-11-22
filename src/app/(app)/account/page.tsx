import type { Metadata } from "next";
import Link from "next/link";
import { signOut } from "@/app/actions/auth";
import { changeMyPassword } from "@/app/actions/staff";
import { ChangePasswordForm } from "@/components/StaffForms";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "My account" };

const ROLE = { OWNER: "Owner", MANAGER: "Manager", CASHIER: "Cashier" } as const;

export default async function AccountPage() {
  const { user } = await requireUser();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">My account</h1>

      <section className="card p-5">
        <dl className="grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-sm text-muted">Name</dt>
            <dd className="font-medium">{user.name}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Signs in with</dt>
            <dd className="truncate font-medium">{user.email}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Role</dt>
            <dd className="font-medium">
              {ROLE[user.role]} at {user.business.name}
            </dd>
          </div>
        </dl>
        {user.role === "OWNER" && (
          <Link href="/staff" className="mt-4 inline-block text-sm font-medium text-brand hover:underline">
            Manage staff logins →
          </Link>
        )}
      </section>

      <section className="card p-6">
        <h2 className="text-lg font-semibold">Change password</h2>
        <p className="mb-4 mt-1 text-sm text-muted">If someone gave you a starting password, change it to one only you know.</p>
        <ChangePasswordForm action={changeMyPassword} />
      </section>

      <form action={signOut}>
        <button className="rounded-xl border border-line bg-surface px-4 py-2 text-sm font-medium text-danger hover:bg-danger-soft">Sign out</button>
      </form>
    </div>
  );
}
