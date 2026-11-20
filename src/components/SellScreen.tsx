"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { completeSale } from "@/app/actions/sales";
import { formatKwacha, parseKwacha } from "@/lib/money";

export type TillProduct = { id: string; sku: string; name: string; unit: string; priceNgwee: number; stockQty: number };

// The basket keeps only ids and quantities. Product details (price, stock) are always read
// from the latest list, so a refresh after another till's sale updates the basket too.
type BasketLine = { productId: string; quantity: number };

// crypto.randomUUID only exists on HTTPS pages and localhost. A till opened over the shop's
// Wi-Fi (http://192.168.x.x) doesn't have it, but getRandomValues works everywhere.
function newClientRef() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function SellScreen({ products }: { products: TillProduct[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [basket, setBasket] = useState<BasketLine[]>([]);
  const [method, setMethod] = useState<"CASH" | "MOBILE_MONEY">("CASH");
  const [tendered, setTendered] = useState("");
  const [reference, setReference] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // One ID per basket: if "Complete sale" is pressed twice, the server records one sale.
  const [clientRef] = useState(newClientRef);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? products.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)) : products;
    return list.slice(0, 30);
  }, [products, search]);

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  // A product that disappeared (deactivated) drops out of the basket.
  const lines = basket.flatMap((b) => {
    const product = byId.get(b.productId);
    return product ? [{ product, quantity: b.quantity }] : [];
  });

  const total = lines.reduce((n, l) => n + l.product.priceNgwee * l.quantity, 0);
  const tenderedNgwee = tendered.trim() === "" ? null : parseKwacha(tendered);
  const change = tenderedNgwee !== null ? tenderedNgwee - total : null;
  const overStock = lines.filter((l) => l.quantity > l.product.stockQty);

  const ready =
    lines.length > 0 &&
    overStock.length === 0 &&
    (method === "CASH" ? tenderedNgwee !== null && tenderedNgwee >= total : /^[A-Za-z0-9.-]{6,40}$/.test(reference.trim()));

  function add(p: TillProduct) {
    setError(null);
    setBasket((b) => {
      const existing = b.find((l) => l.productId === p.id);
      return existing ? b.map((l) => (l.productId === p.id ? { ...l, quantity: l.quantity + 1 } : l)) : [...b, { productId: p.id, quantity: 1 }];
    });
  }

  const setQty = (id: string, q: number) => setBasket((b) => (q <= 0 ? b.filter((l) => l.productId !== id) : b.map((l) => (l.productId === id ? { ...l, quantity: q } : l))));

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await completeSale({
        clientRef,
        items: lines.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
        payment: method === "CASH" ? { method, tenderedNgwee: tenderedNgwee ?? 0 } : { method, reference },
        customerPhone: phone,
      });
      if (res.ok) router.push(`/sales/${res.saleId}?new=1`);
      else {
        setError(res.error);
        router.refresh(); // reload stock levels: another till may have just sold something
      }
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
      <section aria-labelledby="products-heading" className="space-y-3">
        <h2 id="products-heading" className="sr-only">
          Products
        </h2>
        <label htmlFor="till-search" className="sr-only">
          Find a product
        </label>
        <input
          id="till-search"
          type="search"
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            // A barcode scanner types the code and presses Enter: add the exact match.
            if (e.key === "Enter") {
              const exact = products.find((p) => p.sku.toLowerCase() === search.trim().toLowerCase()) ?? (matches.length === 1 ? matches[0] : undefined);
              if (exact && exact.stockQty > 0) {
                add(exact);
                setSearch("");
              }
            }
          }}
          placeholder="Search name or code, or scan a barcode"
          className="w-full rounded-md border border-line bg-surface px-3 py-3 text-base"
        />
        <ul className="grid gap-2 sm:grid-cols-2">
          {matches.map((p) => {
            const inBasket = basket.find((l) => l.productId === p.id)?.quantity ?? 0;
            const out = p.stockQty - inBasket <= 0;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => add(p)}
                  disabled={out}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-line bg-surface px-3 py-3 text-left hover:border-brand disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{p.name}</span>
                    <span className="text-xs text-muted">
                      {p.sku} · {p.stockQty === 0 ? "out of stock" : out ? "all in basket" : `${p.stockQty - inBasket} left`}
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">{formatKwacha(p.priceNgwee)}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {matches.length === 0 && <p className="text-muted">No products match &ldquo;{search}&rdquo;.</p>}
      </section>

      <section aria-labelledby="basket-heading" className="h-fit space-y-4 rounded-xl border border-line bg-surface p-4 lg:sticky lg:top-4">
        <h2 id="basket-heading" className="text-lg font-semibold">
          Basket
        </h2>

        {lines.length === 0 ? (
          <p className="text-sm text-muted">Tap a product to add it.</p>
        ) : (
          <ul className="divide-y divide-line">
            {lines.map((l) => (
              <li key={l.product.id} className="flex items-center gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{l.product.name}</div>
                  <div className="text-xs text-muted">
                    {formatKwacha(l.product.priceNgwee)} each
                    {l.quantity > l.product.stockQty && <span className="text-danger"> · only {l.product.stockQty} in stock</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => setQty(l.product.id, l.quantity - 1)} className="size-8 rounded-md border border-line" aria-label={`One less ${l.product.name}`}>
                    −
                  </button>
                  <span className="w-8 text-center tabular-nums" aria-label="Quantity">
                    {l.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => setQty(l.product.id, l.quantity + 1)}
                    disabled={l.quantity >= l.product.stockQty}
                    className="size-8 rounded-md border border-line disabled:opacity-40"
                    aria-label={`One more ${l.product.name}`}
                  >
                    +
                  </button>
                </div>
                <div className="w-20 text-right text-sm font-medium tabular-nums">{formatKwacha(l.product.priceNgwee * l.quantity)}</div>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-baseline justify-between border-t border-line pt-3">
          <span className="font-medium">Total</span>
          <span className="text-2xl font-semibold tabular-nums" aria-live="polite">
            {formatKwacha(total)}
          </span>
        </div>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Payment</legend>
          <div className="grid grid-cols-2 gap-2" role="radiogroup">
            {(["CASH", "MOBILE_MONEY"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={method === m}
                onClick={() => setMethod(m)}
                className={`rounded-md border px-3 py-2 text-sm font-medium ${method === m ? "border-brand bg-brand-soft text-brand-dark" : "border-line"}`}
              >
                {m === "CASH" ? "Cash" : "Mobile money"}
              </button>
            ))}
          </div>

          {method === "CASH" ? (
            <div className="space-y-1">
              <div className="flex items-end gap-2">
                <label className="min-w-0 flex-1 space-y-1 text-sm">
                  <span className="block font-medium">Cash given (K)</span>
                  <input
                    inputMode="decimal"
                    value={tendered}
                    onChange={(e) => setTendered(e.target.value)}
                    aria-invalid={tendered !== "" && tenderedNgwee === null ? true : undefined}
                    className="w-full rounded-md border border-line px-3 py-2 text-base"
                  />
                </label>
                <button type="button" onClick={() => setTendered((total / 100).toFixed(2))} disabled={total === 0} className="rounded-md border border-line px-3 py-2 text-sm disabled:opacity-40">
                  Exact
                </button>
              </div>
              {tendered !== "" && tenderedNgwee === null && <p className="text-sm text-danger">Enter an amount like 100 or 85.50</p>}
              {change !== null && change >= 0 && total > 0 && (
                <p className="text-sm">
                  Change: <strong className="tabular-nums">{formatKwacha(change)}</strong>
                </p>
              )}
              {change !== null && change < 0 && <p className="text-sm text-danger">{formatKwacha(-change)} short</p>}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted">Ask the customer to send the money, then type the transaction ID from the confirmation SMS.</p>
              <label className="block space-y-1 text-sm">
                <span className="block font-medium">Transaction ID</span>
                <input value={reference} onChange={(e) => setReference(e.target.value)} autoCapitalize="characters" className="w-full rounded-md border border-line px-3 py-2 text-base" />
              </label>
              <label className="block space-y-1 text-sm">
                <span className="block font-medium">Customer&apos;s number (optional)</span>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="097…" className="w-full rounded-md border border-line px-3 py-2 text-base" />
              </label>
            </div>
          )}
        </fieldset>

        {error && (
          <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={!ready || pending}
          className="w-full rounded-md bg-brand px-4 py-3 font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {pending ? "Recording…" : `Complete sale${total ? ` · ${formatKwacha(total)}` : ""}`}
        </button>
      </section>
    </div>
  );
}
