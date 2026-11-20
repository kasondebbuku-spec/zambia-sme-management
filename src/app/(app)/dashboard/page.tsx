import type { Metadata } from "next";
import Link from "next/link";
import { AlertIcon, BoxIcon, CartIcon, PeopleIcon, PlusIcon, TruckIcon, WalletIcon } from "@/components/icons";
import { formatKwacha } from "@/lib/money";
import { listCustomers } from "@/server/customers";
import { inventorySummary } from "@/server/products";
import { lusakaDay, salesBetween } from "@/server/sales";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Home" };

function greeting(now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lusaka", hour: "numeric", hour12: false }).format(now));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

const today = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lusaka", weekday: "long", day: "numeric", month: "long" });

export default async function DashboardPage() {
  const { user, ctx } = await requireUser();
  const { from, to } = lusakaDay();
  const [s, day, customers] = await Promise.all([inventorySummary(ctx), salesBetween(ctx, from, to), listCustomers(ctx)]);
  const canManage = user.role !== "CASHIER";
  const owed = customers.reduce((n, c) => n + c.balanceNgwee, 0);
  const owing = customers.filter((c) => c.balanceNgwee > 0).length;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted">{today.format(new Date())}</p>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {greeting()}, {user.name.split(" ")[0]}
        </h1>
      </div>

      {/* Today's takings */}
      <section className="relative overflow-hidden rounded-[1.375rem] bg-forest text-white shadow-[0_18px_40px_-20px_rgb(31_81_50/0.8)]">
        <div className="chitenge h-2.5 opacity-90" aria-hidden />
        <div className="flex flex-wrap items-end justify-between gap-4 p-5 sm:p-6">
          <div>
            <p className="text-sm text-white/75">Today&apos;s takings</p>
            <p className="mt-1 text-4xl font-bold tabular-nums tracking-tight">{formatKwacha(day.totalNgwee)}</p>
            <p className="mt-1 text-sm text-white/75">
              {day.count === 0 ? "No sales yet today" : `${day.count} ${day.count === 1 ? "sale" : "sales"}`}
              {day.count > 0 && ` · cash ${formatKwacha(day.cashNgwee)}`}
              {canManage && day.count > 0 && ` · profit ${formatKwacha(day.profitNgwee)}`}
            </p>
          </div>
          <Link href="/sell" className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 font-semibold text-forest hover:bg-forest-soft">
            <CartIcon /> New sale
          </Link>
        </div>
        <div className="pointer-events-none absolute -right-10 -top-6 size-40 rounded-full bg-white/5" aria-hidden />
      </section>

      {/* Quick actions */}
      <nav aria-label="Quick actions" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {canManage && <QuickAction href="/products/new" icon={<PlusIcon />} label="Add product" tone="brand" />}
        {canManage && <QuickAction href="/purchases/new" icon={<TruckIcon />} label="Order stock" tone="ochre" />}
        <QuickAction href="/customers" icon={<WalletIcon />} label="Take a payment" tone="forest" />
        <QuickAction href="/products?low=1" icon={<AlertIcon />} label="Running low" tone="danger" />
      </nav>

      {/* Figures */}
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={<BoxIcon />} tone="brand" label="Stock value" value={formatKwacha(s.stockValueAtCostNgwee)} sub={`${s.productCount} products`} />
        <Stat icon={<CartIcon />} tone="forest" label="If all sold" value={formatKwacha(s.stockValueAtPriceNgwee)} sub="at today's prices" />
        <Stat icon={<PeopleIcon />} tone="ochre" label="Owed to you" value={formatKwacha(owed)} sub={owing === 0 ? "nobody owes you" : `${owing} ${owing === 1 ? "customer" : "customers"}`} />
        <Stat icon={<AlertIcon />} tone="danger" label="Out of stock" value={String(s.outOfStock)} sub={`${s.lowStock.length} running low`} />
      </dl>

      {/* Running low */}
      <section aria-labelledby="low-heading" className="card overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 id="low-heading" className="flex items-center gap-2 font-semibold">
            <span className="flex size-8 items-center justify-center rounded-lg bg-warn-soft text-warn">
              <AlertIcon className="size-4" />
            </span>
            Running low
            {s.lowStock.length > 0 && <span className="rounded-full bg-sand px-2 py-0.5 text-xs font-semibold text-ink/70">{s.lowStock.length}</span>}
          </h2>
          {s.lowStock.length > 0 && canManage && (
            <Link href="/purchases/new" className="text-sm font-medium text-brand hover:underline">
              Order now →
            </Link>
          )}
        </div>

        {s.productCount === 0 ? (
          <div className="p-6 text-center">
            <p className="text-muted">No products yet.</p>
            {canManage && (
              <Link href="/products/new" className="mt-3 inline-block rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark">
                Add your first product
              </Link>
            )}
          </div>
        ) : s.lowStock.length === 0 ? (
          <p className="px-5 py-6 text-good">Everything is above its reorder level. 👍</p>
        ) : (
          <ul className="divide-y divide-line">
            {s.lowStock.slice(0, 6).map((p) => {
              const out = p.stockQty === 0;
              const pct = p.reorderLevel > 0 ? Math.min(100, Math.round((p.stockQty / p.reorderLevel) * 100)) : 0;
              return (
                <li key={p.id}>
                  <Link href={`/products/${p.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-canvas">
                    <span className={`size-2.5 shrink-0 rounded-full ${out ? "bg-danger" : "bg-ochre"}`} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{p.name}</span>
                      <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-sand" aria-hidden>
                        <span className={`block h-full rounded-full ${out ? "bg-danger" : "bg-ochre"}`} style={{ width: `${Math.max(pct, 4)}%` }} />
                      </span>
                    </span>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${out ? "bg-danger-soft text-danger" : "bg-warn-soft text-warn"}`}>
                      {out ? "Out of stock" : `${p.stockQty} left`}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

const TONE = {
  brand: "bg-brand-soft text-brand",
  forest: "bg-forest-soft text-forest",
  ochre: "bg-ochre-soft text-warn",
  danger: "bg-danger-soft text-danger",
} as const;

function QuickAction({ href, icon, label, tone }: { href: string; icon: React.ReactNode; label: string; tone: keyof typeof TONE }) {
  return (
    <Link href={href} className="card flex items-center gap-3 p-3 transition hover:-translate-y-0.5 hover:border-brand/40">
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${TONE[tone]}`}>{icon}</span>
      <span className="text-sm font-semibold leading-tight">{label}</span>
    </Link>
  );
}

function Stat({ icon, tone, label, value, sub }: { icon: React.ReactNode; tone: keyof typeof TONE; label: string; value: string; sub: string }) {
  return (
    <div className="card p-4">
      <span className={`flex size-9 items-center justify-center rounded-xl ${TONE[tone]}`}>{icon}</span>
      <dt className="mt-3 text-sm text-muted">{label}</dt>
      <dd className="mt-0.5 text-xl font-bold tabular-nums tracking-tight">{value}</dd>
      <dd className="text-xs text-muted">{sub}</dd>
    </div>
  );
}
