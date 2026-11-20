"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BoxIcon, CartIcon, HomeIcon, PeopleIcon, ReceiptIcon, TruckIcon } from "./icons";

type Item = { href: string; label: string; icon: (p: { className?: string }) => React.ReactElement; managersOnly?: boolean };

const ITEMS: Item[] = [
  { href: "/dashboard", label: "Home", icon: HomeIcon },
  { href: "/sales", label: "Sales", icon: ReceiptIcon },
  { href: "/sell", label: "Sell", icon: CartIcon },
  { href: "/products", label: "Stock", icon: BoxIcon },
  { href: "/customers", label: "Customers", icon: PeopleIcon },
  { href: "/purchases", label: "Orders", icon: TruckIcon, managersOnly: true },
];

const isActive = (path: string, href: string) => path === href || path.startsWith(`${href}/`) || (href === "/purchases" && path.startsWith("/suppliers"));

/** Sidebar on wide screens. */
export function SideNav({ isManager }: { isManager: boolean }) {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="space-y-1">
      {ITEMS.filter((i) => isManager || !i.managersOnly).map((i) => {
        const active = isActive(path, i.href);
        const Icon = i.icon;
        if (i.href === "/sell") {
          return (
            <Link
              key={i.href}
              href={i.href}
              aria-current={active ? "page" : undefined}
              className="my-3 flex items-center gap-3 rounded-xl bg-brand px-4 py-3 font-semibold text-white shadow-[0_8px_20px_-8px_rgb(180_68_28/0.7)] hover:bg-brand-dark"
            >
              <Icon /> New sale
            </Link>
          );
        }
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition ${active ? "bg-forest text-white" : "text-ink/80 hover:bg-sand"}`}
          >
            <Icon /> {i.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Bottom tab bar on phones, with Sell raised in the middle. */
export function BottomNav() {
  const path = usePathname();
  // Five tabs fit a phone comfortably. Managers reach Orders from the header and the dashboard.
  const items = ITEMS.filter((i) => !i.managersOnly);
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden print:hidden">
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {items.map((i) => {
          const active = isActive(path, i.href);
          const Icon = i.icon;
          if (i.href === "/sell") {
            return (
              <li key={i.href} className="flex justify-center">
                <Link
                  href={i.href}
                  aria-current={active ? "page" : undefined}
                  className="-mt-5 flex size-14 flex-col items-center justify-center rounded-full bg-brand text-white shadow-[0_10px_24px_-8px_rgb(180_68_28/0.8)] ring-4 ring-canvas"
                >
                  <Icon className="size-6" />
                  <span className="text-[10px] font-semibold">Sell</span>
                </Link>
              </li>
            );
          }
          return (
            <li key={i.href}>
              <Link href={i.href} aria-current={active ? "page" : undefined} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${active ? "text-brand" : "text-muted"}`}>
                <Icon className="size-6" />
                {i.label}
                <span className={`mt-0.5 h-1 w-1 rounded-full ${active ? "bg-brand" : "bg-transparent"}`} aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
