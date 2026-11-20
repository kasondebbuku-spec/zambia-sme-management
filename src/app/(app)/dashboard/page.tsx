import type { Metadata } from "next";
import Link from "next/link";
import { formatKwacha } from "@/lib/money";
import { inventorySummary } from "@/server/products";
import { lusakaDay, salesBetween } from "@/server/sales";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const { user, ctx } = await requireUser();
  const { from, to } = lusakaDay();
  const [s, today] = await Promise.all([inventorySummary(ctx), salesBetween(ctx, from, to)]);
  const canManage = user.role !== "CASHIER";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Hello, {user.name.split(" ")[0]}</h1>
        <p className="mt-1 text-muted">Here&apos;s your shop today.</p>
      </div>

      <dl className="grid gap-3 sm:grid-cols-5">
        <Stat label="Sales today" value={`${formatKwacha(today.totalNgwee)}`} hint={`${today.count} sales`} />
        <Stat label="Products" value={String(s.productCount)} />
        <Stat label="Stock value (cost)" value={formatKwacha(s.stockValueAtCostNgwee)} hint="What you've paid for what's on the shelf" />
        <Stat label="Stock value (selling)" value={formatKwacha(s.stockValueAtPriceNgwee)} hint="If everything sold at today's prices" />
        <Stat label="Out of stock" value={String(s.outOfStock)} tone={s.outOfStock ? "bad" : undefined} />
      </dl>

      <section aria-labelledby="low-heading" className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 id="low-heading" className="text-lg font-semibold">
            Running low
          </h2>
          {s.lowStock.length > 0 && (
            <Link href="/products?low=1" className="text-sm text-brand hover:underline">
              See all
            </Link>
          )}
        </div>
        {s.productCount === 0 ? (
          <div className="rounded-xl border border-dashed border-line p-6 text-center">
            <p className="text-muted">No products yet.</p>
            {canManage && (
              <Link href="/products/new" className="mt-3 inline-block rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
                Add your first product
              </Link>
            )}
          </div>
        ) : s.lowStock.length === 0 ? (
          <p className="rounded-xl border border-line bg-surface p-4 text-good">Everything is above its reorder level.</p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {s.lowStock.slice(0, 8).map((p) => (
              <li key={p.id}>
                <Link href={`/products/${p.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-canvas">
                  <span>
                    <span className="font-medium">{p.name}</span> <span className="text-sm text-muted">{p.sku}</span>
                  </span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${p.stockQty === 0 ? "bg-danger-soft text-danger" : "bg-warn-soft text-warn"}`}>
                    {p.stockQty === 0 ? "Out of stock" : `${p.stockQty} left · reorder at ${p.reorderLevel}`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "bad" }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4" title={hint}>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className={`mt-1 text-xl font-semibold tabular-nums ${tone === "bad" ? "text-danger" : ""}`}>{value}</dd>
    </div>
  );
}
