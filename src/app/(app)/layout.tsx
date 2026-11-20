import Link from "next/link";
import { signOut } from "@/app/actions/auth";
import { BottomNav, SideNav } from "@/components/AppNav";
import { LogoutIcon, TruckIcon } from "@/components/icons";
import { requireUser } from "@/server/session";

const ROLE = { OWNER: "Owner", MANAGER: "Manager", CASHIER: "Cashier" } as const;

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

export default async function SignedInLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser();
  const isManager = user.role !== "CASHIER";

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_1fr]">
      {/* Sidebar: tablets and laptops */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-surface lg:flex print:hidden">
        <div className="chitenge h-3" aria-hidden />
        <div className="flex items-center gap-3 px-5 py-5">
          <Logo />
          <div className="min-w-0">
            <div className="truncate font-semibold leading-tight">{user.business.name}</div>
            <div className="text-xs text-muted">{user.business.town ?? "Kantemba"}</div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-3">
          <SideNav isManager={isManager} />
        </div>
        <div className="m-3 flex items-center gap-3 rounded-xl bg-canvas p-3">
          <Avatar name={user.name} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{user.name}</div>
            <div className="text-xs text-muted">{ROLE[user.role]}</div>
          </div>
          <SignOutButton />
        </div>
      </aside>

      <div className="min-w-0">
        {/* Header: phones */}
        <header className="sticky top-0 z-20 bg-surface/95 backdrop-blur lg:hidden print:hidden">
          <div className="chitenge h-2" aria-hidden />
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
            <Link href="/dashboard" className="flex min-w-0 items-center gap-2.5">
              <Logo small />
              <span className="truncate font-semibold">{user.business.name}</span>
            </Link>
            <div className="flex items-center gap-1">
              {isManager && (
                <Link href="/purchases" className="rounded-full p-2 text-muted hover:bg-sand hover:text-ink" aria-label="Purchase orders">
                  <TruckIcon />
                </Link>
              )}
              <Avatar name={user.name} small />
              <SignOutButton />
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-4 pb-28 pt-6 lg:px-8 lg:pb-12 lg:pt-10 print:p-0">{children}</main>
      </div>

      <BottomNav />
    </div>
  );
}

function Logo({ small }: { small?: boolean }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-xl bg-brand font-bold text-white shadow-[inset_0_-3px_0_rgb(0_0_0/0.15)] ${small ? "size-8 text-sm" : "size-10 text-lg"}`}
      aria-hidden
    >
      K
    </span>
  );
}

function Avatar({ name, small }: { name: string; small?: boolean }) {
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full bg-forest font-semibold text-white ${small ? "size-8 text-xs" : "size-9 text-sm"}`} title={name} aria-hidden>
      {initials(name)}
    </span>
  );
}

function SignOutButton() {
  return (
    <form action={signOut}>
      <button className="rounded-full p-2 text-muted hover:bg-sand hover:text-danger" aria-label="Sign out" title="Sign out">
        <LogoutIcon />
      </button>
    </form>
  );
}
