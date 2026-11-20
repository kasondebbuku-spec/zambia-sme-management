import type { Metadata } from "next";
import Link from "next/link";
import { formatKwacha } from "@/lib/money";
import { lusakaDay, salesBetween } from "@/server/sales";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Today's sales" };

const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lusaka", hour: "2-digit", minute: "2-digit" });

export default async function SalesPage() {
  const { user, ctx } = await requireUser();
  const { from, to } = lusakaDay();
  const day = await salesBetween(ctx, from, to);
  const seesProfit = user.role !== "CASHIER";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Today&apos;s sales</h1>
        <Link href="/sell" className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
          New sale
        </Link>
      </div>

      <dl className={`grid gap-3 ${seesProfit ? "sm:grid-cols-5" : "sm:grid-cols-4"}`}>
        <Stat label="Sales" value={String(day.count)} />
        <Stat label="Takings" value={formatKwacha(day.totalNgwee)} />
        <Stat label="Cash" value={formatKwacha(day.cashNgwee)} hint="Should match the cash drawer" />
        <Stat label="Mobile money" value={formatKwacha(day.mobileMoneyNgwee)} />
        {seesProfit && <Stat label="Profit" value={formatKwacha(day.profitNgwee)} hint="Takings minus what the goods cost" />}
      </dl>

      {day.sales.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-6 text-center text-muted">No sales yet today.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-canvas text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">
                  Receipt
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Time
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Cashier
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Paid by
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {day.sales.map((s) => (
                <tr key={s.id} className={s.status === "VOIDED" ? "text-muted" : ""}>
                  <td className="px-4 py-2">
                    <Link href={`/sales/${s.id}`} className="font-medium hover:underline">
                      #{s.receiptNo}
                    </Link>
                    {s.status === "VOIDED" && <span className="ml-2 rounded-full bg-danger-soft px-2 py-0.5 text-xs text-danger">Cancelled</span>}
                  </td>
                  <td className="px-4 py-2 tabular-nums">{time.format(s.createdAt)}</td>
                  <td className="px-4 py-2">{s.cashier?.name ?? "—"}</td>
                  <td className="px-4 py-2">{s.method === "CASH" ? "Cash" : "Mobile money"}</td>
                  <td className={`px-4 py-2 text-right tabular-nums ${s.status === "VOIDED" ? "line-through" : "font-medium"}`}>{formatKwacha(s.totalNgwee)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {day.voided > 0 && <p className="text-sm text-muted">Cancelled sales are listed but not counted in the totals.</p>}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4" title={hint}>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
