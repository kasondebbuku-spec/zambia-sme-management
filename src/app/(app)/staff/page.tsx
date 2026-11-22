import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { addStaffMember, changeStaffRole, resetPassword, switchStaffAccess } from "@/app/actions/staff";
import { AccessForm, AddStaffForm, ResetPasswordForm, RoleForm } from "@/components/StaffForms";
import { listStaff } from "@/server/staff";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Staff" };

const ROLE = { OWNER: "Owner", MANAGER: "Manager", CASHIER: "Cashier" } as const;
const since = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lusaka", day: "numeric", month: "short", year: "numeric" });

export default async function StaffPage() {
  const { user, ctx } = await requireUser();
  if (user.role !== "OWNER") notFound();
  const staff = await listStaff(ctx);
  const others = staff.filter((s) => s.id !== user.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Staff</h1>
        <p className="mt-1 text-sm text-muted">Give each person their own login, so every sale shows who served and cashiers only see what they need.</p>
      </div>

      <ul className="space-y-3">
        {staff.map((s) => {
          const me = s.id === user.id;
          return (
            <li key={s.id} className={`card overflow-hidden ${s.isActive ? "" : "opacity-75"}`}>
              <details className="group">
                <summary className={`flex cursor-pointer list-none items-center gap-3 px-4 py-3 ${me || s.role === "OWNER" ? "cursor-default" : "hover:bg-canvas"}`}>
                  <span className={`flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white ${s.isActive ? "bg-forest" : "bg-muted"}`} aria-hidden>
                    {s.name
                      .split(/\s+/)
                      .map((w) => w[0])
                      .slice(0, 2)
                      .join("")
                      .toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {s.name}
                      {me && <span className="font-normal text-muted"> (you)</span>}
                    </span>
                    <span className="block truncate text-sm text-muted">{s.email}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.role === "OWNER" ? "bg-ochre-soft text-warn" : s.role === "MANAGER" ? "bg-brand-soft text-brand" : "bg-sand text-ink/70"}`}>
                      {ROLE[s.role]}
                    </span>
                    {!s.isActive && <span className="text-xs font-medium text-danger">Switched off</span>}
                  </span>
                  {!me && s.role !== "OWNER" && (
                    <span className="text-muted transition group-open:rotate-90" aria-hidden>
                      ›
                    </span>
                  )}
                </summary>
                {!me && s.role !== "OWNER" && (
                  <div className="grid gap-6 border-t border-line bg-canvas/50 p-4 lg:grid-cols-3">
                    <section className="space-y-2">
                      <h2 className="font-semibold">Role</h2>
                      <RoleForm action={changeStaffRole.bind(null, s.id)} current={s.role as "MANAGER" | "CASHIER"} />
                    </section>
                    <section className="space-y-2">
                      <h2 className="font-semibold">Forgot their password?</h2>
                      <ResetPasswordForm action={resetPassword.bind(null, s.id)} userId={s.id} />
                    </section>
                    <section className="space-y-2">
                      <h2 className="font-semibold">Access</h2>
                      <AccessForm action={switchStaffAccess.bind(null, s.id, !s.isActive)} active={s.isActive} name={s.name} />
                      <p className="text-xs text-muted">Added {since.format(s.createdAt)}</p>
                    </section>
                  </div>
                )}
              </details>
            </li>
          );
        })}
      </ul>
      {others.length === 0 && <p className="text-sm text-muted">Only you so far. Add your cashiers below so they don&apos;t need your password.</p>}

      <section className="card p-6">
        <h2 className="mb-4 text-lg font-semibold">Add a staff member</h2>
        <AddStaffForm action={addStaffMember} />
      </section>
    </div>
  );
}
