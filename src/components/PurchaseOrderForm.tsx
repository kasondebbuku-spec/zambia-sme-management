"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { placeOrder } from "@/app/actions/purchasing";
import { formatKwacha, parseKwacha } from "@/lib/money";

type P = { id: string; name: string; sku: string; unit: string; costNgwee: number; stockQty: number; reorderLevel: number };
type Line = { productId: string; quantity: string; cost: string };

export function PurchaseOrderForm({ suppliers, products }: { suppliers: { id: string; name: string }[]; products: P[] }) {
  const router = useRouter();
  const byId = new Map(products.map((p) => [p.id, p]));
  // Start with everything that's running low, ordered back up to double the reorder level.
  const [lines, setLines] = useState<Line[]>(() =>
    products
      .filter((p) => p.stockQty <= p.reorderLevel)
      .map((p) => ({ productId: p.id, quantity: String(Math.max(1, p.reorderLevel * 2 - p.stockQty)), cost: (p.costNgwee / 100).toFixed(2) })),
  );
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [adding, setAdding] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const parsed = lines.map((l) => ({ ...l, qty: /^\d+$/.test(l.quantity) ? Number(l.quantity) : NaN, costNgwee: parseKwacha(l.cost) }));
  const valid = supplierId && parsed.length > 0 && parsed.every((l) => l.qty > 0 && l.costNgwee !== null);
  const total = parsed.reduce((n, l) => n + (l.qty > 0 && l.costNgwee !== null ? l.qty * l.costNgwee : 0), 0);

  const update = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  function add(id: string) {
    const p = byId.get(id);
    if (!p || lines.some((l) => l.productId === id)) return;
    setLines((ls) => [...ls, { productId: id, quantity: "1", cost: (p.costNgwee / 100).toFixed(2) }]);
    setAdding("");
  }

  function submit() {
    setError(null);
    start(async () => {
      const res = await placeOrder({ supplierId, note, items: parsed.map((l) => ({ productId: l.productId, quantity: l.qty, unitCostNgwee: l.costNgwee! })) });
      if (res.ok) router.push(`/purchases/${res.id}`);
      else setError(res.error);
    });
  }

  if (suppliers.length === 0) return <p className="text-muted">Add a supplier first.</p>;
  const cell = "rounded-md border border-line px-2 py-1.5 text-right tabular-nums w-24";

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="block font-medium">Supplier</span>
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="w-full rounded-md border border-line bg-surface px-3 py-2">
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="block font-medium">Note</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Deliver by Friday" className="w-full rounded-md border border-line px-3 py-2" />
        </label>
      </div>

      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-canvas text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">
                Product
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Quantity
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Cost each (K)
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Line
              </th>
              <th scope="col">
                <span className="sr-only">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {parsed.map((l, i) => {
              const p = byId.get(l.productId)!;
              return (
                <tr key={l.productId}>
                  <td className="px-3 py-2">
                    {p.name}
                    <div className="text-xs text-muted">
                      {p.stockQty} in stock · reorder at {p.reorderLevel}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input aria-label={`Quantity of ${p.name}`} inputMode="numeric" value={l.quantity} onChange={(e) => update(i, { quantity: e.target.value })} aria-invalid={!(l.qty > 0) || undefined} className={cell} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input aria-label={`Cost of ${p.name}`} inputMode="decimal" value={l.cost} onChange={(e) => update(i, { cost: e.target.value })} aria-invalid={l.costNgwee === null || undefined} className={cell} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{l.qty > 0 && l.costNgwee !== null ? formatKwacha(l.qty * l.costNgwee) : "—"}</td>
                  <td className="px-2">
                    <button type="button" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} className="rounded px-2 text-muted hover:text-danger" aria-label={`Remove ${p.name}`}>
                      ×
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {lines.length === 0 && <p className="p-4 text-sm text-muted">Nothing on the order yet.</p>}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <label className="space-y-1 text-sm">
          <span className="block font-medium">Add a product</span>
          <select value={adding} onChange={(e) => add(e.target.value)} className="rounded-md border border-line bg-surface px-3 py-2">
            <option value="">Choose…</option>
            {products
              .filter((p) => !lines.some((l) => l.productId === p.id))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.stockQty} in stock)
                </option>
              ))}
          </select>
        </label>
        <div className="text-right">
          <div className="text-sm text-muted">Order total</div>
          <div className="text-2xl font-semibold tabular-nums">{formatKwacha(total)}</div>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      <button type="button" onClick={submit} disabled={!valid || pending} className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50">
        {pending ? "Saving…" : "Place order"}
      </button>
    </div>
  );
}
