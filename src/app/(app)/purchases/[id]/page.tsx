import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ReceiveForm } from "@/components/ReceiveForm";
import { PURCHASE_STATUS } from "@/lib/labels";
import { formatKwacha } from "@/lib/money";
import { DomainError } from "@/server/errors";
import { getPurchase } from "@/server/purchases";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Purchase order" };

const when = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lusaka", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function PurchasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, ctx } = await requireUser();
  if (user.role === "CASHIER") redirect("/dashboard");
  const po = await getPurchase(ctx, id).catch((e) => {
    if (e instanceof DomainError && e.code === "not_found") notFound();
    throw e;
  });
  const status = PURCHASE_STATUS[po.status];

  return (
    <div className="space-y-6">
      <Link href="/purchases" className="text-sm text-muted hover:text-ink">
        ← Purchase orders
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
            PO-{po.number} · {po.supplier.name}
          </h1>
          <p className="mt-1 text-sm text-muted">
            Ordered {when.format(po.createdAt)}
            {po.createdBy && ` by ${po.createdBy.name}`}
            {po.receivedAt && ` · received ${when.format(po.receivedAt)}${po.receivedBy ? ` by ${po.receivedBy.name}` : ""}`}
            {po.note && ` · ${po.note}`}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-sm font-medium ${status.style}`}>{status.label}</span>
      </div>

      {po.status === "ORDERED" ? (
        <section className="rounded-xl border border-line bg-surface p-6">
          <h2 className="mb-4 text-lg font-semibold">Check the delivery</h2>
          <ReceiveForm
            purchaseId={po.id}
            items={po.items.map((i) => ({
              productId: i.productId,
              name: i.product.name,
              unit: i.product.unit,
              orderedQty: i.orderedQty,
              orderedCostNgwee: i.orderedCostNgwee,
              stockQty: i.product.stockQty,
              costNgwee: i.product.costNgwee,
            }))}
          />
        </section>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-canvas text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">
                  Product
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  Ordered
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  Received
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  Line
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {po.items.map((i) => (
                <tr key={i.id}>
                  <td className="px-4 py-2">
                    <Link href={`/products/${i.productId}`} className="hover:underline">
                      {i.product.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {i.orderedQty} @ {formatKwacha(i.orderedCostNgwee)}
                  </td>
                  <td className={`px-4 py-2 text-right tabular-nums ${i.receivedQty !== null && i.receivedQty < i.orderedQty ? "text-warn" : ""}`}>
                    {i.receivedQty === null ? "—" : `${i.receivedQty} @ ${formatKwacha(i.receivedCostNgwee ?? 0)}`}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{i.receivedQty === null ? "—" : formatKwacha(i.receivedQty * (i.receivedCostNgwee ?? 0))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-line">
              <tr>
                <td colSpan={3} className="px-4 py-2 text-right font-medium">
                  {po.status === "RECEIVED" ? "Delivery total" : "Order total"}
                </td>
                <td className="px-4 py-2 text-right font-semibold tabular-nums">{formatKwacha(po.totalNgwee)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
