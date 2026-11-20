"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cancelOrder, receiveOrder } from "@/app/actions/purchasing";
import { formatKwacha, parseKwacha } from "@/lib/money";

type Item = { productId: string; name: string; unit: string; orderedQty: number; orderedCostNgwee: number; stockQty: number; costNgwee: number };

/** Check the delivery against the order: change quantities that came short and prices that changed. */
export function ReceiveForm({ purchaseId, items }: { purchaseId: string; items: Item[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(items.map((i) => ({ productId: i.productId, quantity: String(i.orderedQty), cost: (i.orderedCostNgwee / 100).toFixed(2) })));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const parsed = rows.map((r) => ({ ...r, qty: /^\d+$/.test(r.quantity) ? Number(r.quantity) : NaN, costNgwee: parseKwacha(r.cost) }));
  const valid = parsed.every((r) => r.qty >= 0 && r.costNgwee !== null);
  const total = parsed.reduce((n, r) => n + (r.qty >= 0 && r.costNgwee !== null ? r.qty * r.costNgwee : 0), 0);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (res.ok) router.refresh();
      else setError(res.error ?? "Something went wrong");
    });
  }

  const cell = "w-24 rounded-xl border border-line px-2 py-1.5 text-right tabular-nums";
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-canvas text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">
                Product
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Ordered
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Arrived
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Cost each (K)
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {items.map((item, i) => {
              const r = parsed[i]!;
              const short = r.qty < item.orderedQty;
              return (
                <tr key={item.productId}>
                  <td className="px-3 py-2">
                    {item.name}
                    <div className="text-xs text-muted">
                      {item.stockQty} in stock now · current cost {formatKwacha(item.costNgwee)}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {item.orderedQty} @ {formatKwacha(item.orderedCostNgwee)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      aria-label={`How many ${item.name} arrived`}
                      inputMode="numeric"
                      value={rows[i]!.quantity}
                      onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))}
                      className={`${cell} ${short ? "border-warn" : ""}`}
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      aria-label={`Cost of ${item.name}`}
                      inputMode="decimal"
                      value={rows[i]!.cost}
                      onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, cost: e.target.value } : x)))}
                      className={cell}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-muted">
        Delivery total <strong className="tabular-nums text-ink">{formatKwacha(total)}</strong>. Stock goes up by what arrived, and each product&apos;s cost becomes the average of
        old and new stock.
      </p>
      {error && (
        <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!valid || pending}
          onClick={() => run(() => receiveOrder(purchaseId, parsed.map((r) => ({ productId: r.productId, quantity: r.qty, unitCostNgwee: r.costNgwee! }))))}
          className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {pending ? "Saving…" : "Record delivery"}
        </button>
        <button type="button" disabled={pending} onClick={() => run(() => cancelOrder(purchaseId))} className="rounded-xl border border-line bg-surface px-4 py-2 text-sm text-danger hover:bg-danger-soft">
          Cancel order
        </button>
      </div>
    </div>
  );
}
