import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PURCHASE_STATUS } from "@/lib/labels";
import { formatKwacha } from "@/lib/money";
import { listPurchases } from "@/server/purchases";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Purchase orders" };

const day = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lusaka", day: "numeric", month: "short" });

export default async function PurchasesPage() {
  const { user, ctx } = await requireUser();
  if (user.role === "CASHIER") redirect("/dashboard");
  const purchases = await listPurchases(ctx);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Purchase orders</h1>
        <div className="flex gap-2">
          <Link href="/suppliers" className="rounded-xl border border-line bg-surface px-4 py-2 text-sm hover:bg-canvas">
            Suppliers
          </Link>
          <Link href="/purchases/new" className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
            New order
          </Link>
        </div>
      </div>

      {purchases.length === 0 ? (
        <p className="rounded-2xl border-2 border-dashed border-line p-6 text-center text-muted">No orders yet. When stock runs low, order more from a supplier here.</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden card">
          {purchases.map((p) => (
            <li key={p.id}>
              <Link href={`/purchases/${p.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-canvas">
                <div>
                  <div className="font-medium">
                    PO-{p.number} · {p.supplier.name}
                  </div>
                  <div className="text-sm text-muted">
                    {day.format(p.createdAt)} · {p._count.items} {p._count.items === 1 ? "product" : "products"} · {formatKwacha(p.totalNgwee)}
                  </div>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PURCHASE_STATUS[p.status].style}`}>{PURCHASE_STATUS[p.status].label}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
