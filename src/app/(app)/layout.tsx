import Link from "next/link";
import { signOut } from "@/app/actions/auth";
import { requireUser } from "@/server/session";

const ROLE = { OWNER: "Owner", MANAGER: "Manager", CASHIER: "Cashier" } as const;

export default async function SignedInLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser();
  return (
    <>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
              <span className="flex size-8 items-center justify-center rounded-lg bg-brand text-sm font-bold text-white" aria-hidden>
                K
              </span>
              <span className="max-w-[12rem] truncate">{user.business.name}</span>
            </Link>
            <nav className="flex gap-1 text-sm" aria-label="Main">
              <Link href="/dashboard" className="rounded-md px-2 py-1 hover:bg-canvas">
                Dashboard
              </Link>
              <Link href="/products" className="rounded-md px-2 py-1 hover:bg-canvas">
                Products
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right leading-tight">
              <div className="text-sm font-medium">{user.name}</div>
              <div className="text-xs text-muted">{ROLE[user.role]}</div>
            </div>
            <form action={signOut}>
              <button className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-canvas">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </>
  );
}
