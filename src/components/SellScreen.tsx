"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { addCustomerAtTill } from "@/app/actions/customers";
import { completeSale } from "@/app/actions/sales";
import { formatKwacha, parseKwacha } from "@/lib/money";

export type TillProduct = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  priceNgwee: number;
  stockQty: number;
};
export type TillCustomer = {
  id: string;
  name: string;
  phone: string | null;
  hasCredit: boolean;
  availableNgwee: number;
  changeHeldNgwee: number; // change the shop is keeping for them
};

// The basket keeps only ids and quantities. Product details (price, stock) are always read
// from the latest list, so a refresh after another till's sale updates the basket too.
type BasketLine = { productId: string; quantity: number };

// crypto.randomUUID only exists on HTTPS pages and localhost. A till opened over the shop's
// Wi-Fi (http://192.168.x.x) doesn't have it, but getRandomValues works everywhere.
function newClientRef() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function SellScreen({
  products,
  customers,
}: {
  products: TillProduct[];
  customers: TillCustomer[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [basket, setBasket] = useState<BasketLine[]>([]);
  const [method, setMethod] = useState<"CASH" | "MOBILE_MONEY" | "ON_ACCOUNT">(
    "CASH",
  );
  const [customerId, setCustomerId] = useState("");
  // Customers added at this till during this sale, until the page reloads with them.
  const [added, setAdded] = useState<TillCustomer[]>([]);
  const [tendered, setTendered] = useState("");
  const [reference, setReference] = useState("");
  const [phone, setPhone] = useState("");
  // Kept change: use what the shop holds for this customer, or keep this sale's change for them.
  const [useKept, setUseKept] = useState(false);
  const [keepOn, setKeepOn] = useState(false);
  const [keepAmount, setKeepAmount] = useState(""); // blank means all the change
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // One ID per basket: if "Complete sale" is pressed twice, the server records one sale.
  const [clientRef] = useState(newClientRef);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? products.filter(
          (p) =>
            p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q),
        )
      : products;
    return list.slice(0, 30);
  }, [products, search]);

  const byId = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  );
  // A product that disappeared (deactivated) drops out of the basket.
  const lines = basket.flatMap((b) => {
    const product = byId.get(b.productId);
    return product ? [{ product, quantity: b.quantity }] : [];
  });

  const total = lines.reduce(
    (n, l) => n + l.product.priceNgwee * l.quantity,
    0,
  );
  const everyone = useMemo(
    () => [
      ...customers,
      ...added.filter((a) => !customers.some((c) => c.id === a.id)),
    ],
    [customers, added],
  );
  const customer = everyone.find((c) => c.id === customerId);
  const overStock = lines.filter((l) => l.quantity > l.product.stockQty);

  // Change kept for this customer earlier comes off what they pay now.
  const used = useKept && customer ? Math.min(customer.changeHeldNgwee, total) : 0;
  const due = total - used;
  // With nothing left to pay, the cash box can stay empty.
  const tenderedNgwee = tendered.trim() === "" ? (due === 0 && total > 0 ? 0 : null) : parseKwacha(tendered);
  const change = tenderedNgwee !== null ? tenderedNgwee - due : null;
  const keptRaw = keepAmount.trim() === "" ? change : parseKwacha(keepAmount);
  const kept = method === "CASH" && keepOn && change !== null && change > 0 ? keptRaw : 0;
  const keepOk = kept === 0 || (kept !== null && change !== null && kept <= change && customer !== undefined);

  const ready =
    lines.length > 0 &&
    overStock.length === 0 &&
    (method === "CASH"
      ? tenderedNgwee !== null && tenderedNgwee >= due && keepOk
      : method === "MOBILE_MONEY"
        ? /^[A-Za-z0-9.-]{6,40}$/.test(reference.trim())
        : customer !== undefined &&
          customer.hasCredit &&
          customer.availableNgwee >= due);

  function add(p: TillProduct) {
    setError(null);
    setBasket((b) => {
      const existing = b.find((l) => l.productId === p.id);
      return existing
        ? b.map((l) =>
            l.productId === p.id ? { ...l, quantity: l.quantity + 1 } : l,
          )
        : [...b, { productId: p.id, quantity: 1 }];
    });
  }

  const setQty = (id: string, q: number) =>
    setBasket((b) =>
      q <= 0
        ? b.filter((l) => l.productId !== id)
        : b.map((l) => (l.productId === id ? { ...l, quantity: q } : l)),
    );

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await completeSale({
        clientRef,
        items: lines.map((l) => ({
          productId: l.product.id,
          quantity: l.quantity,
        })),
        payment:
          method === "CASH"
            ? { method, tenderedNgwee: tenderedNgwee ?? 0, keepChangeNgwee: kept ?? 0 }
            : method === "MOBILE_MONEY"
              ? { method, reference }
              : { method, customerId },
        customerId,
        customerPhone: customer?.phone ? "" : phone,
        useChangeNgwee: used,
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
              const exact =
                products.find(
                  (p) => p.sku.toLowerCase() === search.trim().toLowerCase(),
                ) ?? (matches.length === 1 ? matches[0] : undefined);
              if (exact && exact.stockQty > 0) {
                add(exact);
                setSearch("");
              }
            }
          }}
          placeholder="Search name or code, or scan a barcode"
          className="w-full rounded-xl border border-line bg-surface px-3 py-3 text-base"
        />
        <ul className="grid gap-2 sm:grid-cols-2">
          {matches.map((p) => {
            const inBasket =
              basket.find((l) => l.productId === p.id)?.quantity ?? 0;
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
                      {p.sku} ·{" "}
                      {p.stockQty === 0
                        ? "out of stock"
                        : out
                          ? "all in basket"
                          : `${p.stockQty - inBasket} left`}
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">
                    {formatKwacha(p.priceNgwee)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {matches.length === 0 && (
          <p className="text-muted">
            No products match &ldquo;{search}&rdquo;.
          </p>
        )}
      </section>

      {/* On phones the basket sits below the product list, so a bar above the tab bar shows
          what's in it and jumps there. */}
      {lines.length > 0 && (
        <button
          type="button"
          onClick={() =>
            document
              .getElementById("basket")
              ?.scrollIntoView({ behavior: "smooth", block: "start" })
          }
          className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 flex items-center justify-between rounded-2xl bg-forest px-4 py-3 text-white shadow-[0_14px_30px_-12px_rgb(31_81_50/0.9)] lg:hidden"
        >
          <span className="text-sm">
            {lines.reduce((n, l) => n + l.quantity, 0)}{" "}
            {lines.reduce((n, l) => n + l.quantity, 0) === 1 ? "item" : "items"}{" "}
            · <strong className="tabular-nums">{formatKwacha(total)}</strong>
          </span>
          <span className="text-sm font-semibold">View basket ↓</span>
        </button>
      )}

      <section
        id="basket"
        aria-labelledby="basket-heading"
        className="h-fit scroll-mt-20 space-y-4 card p-4 lg:sticky lg:top-4"
      >
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
                  <div className="truncate text-sm font-medium">
                    {l.product.name}
                  </div>
                  <div className="text-xs text-muted">
                    {formatKwacha(l.product.priceNgwee)} each
                    {l.quantity > l.product.stockQty && (
                      <span className="text-danger">
                        {" "}
                        · only {l.product.stockQty} in stock
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setQty(l.product.id, l.quantity - 1)}
                    className="size-8 rounded-xl border border-line"
                    aria-label={`One less ${l.product.name}`}
                  >
                    −
                  </button>
                  <span
                    className="w-8 text-center tabular-nums"
                    aria-label="Quantity"
                  >
                    {l.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => setQty(l.product.id, l.quantity + 1)}
                    disabled={l.quantity >= l.product.stockQty}
                    className="size-8 rounded-xl border border-line disabled:opacity-40"
                    aria-label={`One more ${l.product.name}`}
                  >
                    +
                  </button>
                </div>
                <div className="w-20 text-right text-sm font-medium tabular-nums">
                  {formatKwacha(l.product.priceNgwee * l.quantity)}
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-baseline justify-between border-t border-line pt-3">
          <span className="font-medium">Total</span>
          <span
            className="text-2xl font-bold tracking-tight tabular-nums"
            aria-live="polite"
          >
            {formatKwacha(total)}
          </span>
        </div>

        <CustomerPicker
          customers={everyone}
          selected={customer}
          required={method === "ON_ACCOUNT"}
          onSelect={(c) => {
            if (c && !everyone.some((x) => x.id === c.id))
              setAdded((a) => [...a, c]);
            setCustomerId(c?.id ?? "");
            setUseKept(false);
            setError(null);
          }}
        />

        {customer && customer.changeHeldNgwee > 0 && (
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-ochre/50 bg-ochre-soft px-3 py-2.5 text-sm">
            <input type="checkbox" checked={useKept} onChange={(e) => setUseKept(e.target.checked)} className="mt-0.5 size-4 accent-forest" />
            <span>
              <span className="block font-semibold">
                You&apos;re keeping {formatKwacha(customer.changeHeldNgwee)} change for {customer.name}
              </span>
              <span className="text-xs text-muted">
                {useKept && total > 0
                  ? `${formatKwacha(used)} comes off this sale${customer.changeHeldNgwee > used ? `, ${formatKwacha(customer.changeHeldNgwee - used)} stays kept` : ""}.`
                  : "Tick to use it on this sale."}
              </span>
            </span>
          </label>
        )}
        {used > 0 && (
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium">Left to pay</span>
            <span className="text-lg font-bold tabular-nums">{formatKwacha(due)}</span>
          </div>
        )}

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Payment</legend>
          <div className="grid grid-cols-3 gap-2" role="radiogroup">
            {(["CASH", "MOBILE_MONEY", "ON_ACCOUNT"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={method === m}
                onClick={() => setMethod(m)}
                className={`rounded-xl border px-3 py-2 text-sm font-medium ${method === m ? "border-brand bg-brand-soft text-brand-dark" : "border-line"}`}
              >
                {m === "CASH"
                  ? "Cash"
                  : m === "MOBILE_MONEY"
                    ? "Mobile money"
                    : "On account"}
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
                    aria-invalid={
                      tendered !== "" && tenderedNgwee === null
                        ? true
                        : undefined
                    }
                    className="w-full rounded-xl border border-line px-3 py-2 text-base"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setTendered((due / 100).toFixed(2))}
                  disabled={due === 0}
                  className="rounded-xl border border-line px-3 py-2 text-sm disabled:opacity-40"
                >
                  Exact
                </button>
              </div>
              {tendered !== "" && tenderedNgwee === null && (
                <p className="text-sm text-danger">
                  Enter an amount like 100 or 85.50
                </p>
              )}
              {change !== null && change >= 0 && total > 0 && (
                <p className="text-sm">
                  Change:{" "}
                  <strong className="tabular-nums">
                    {formatKwacha(change)}
                  </strong>
                  {kept !== null && kept > 0 && kept <= change && (
                    <span className="text-muted">
                      {" "}
                      · give {formatKwacha(change - kept)} now, keep {formatKwacha(kept)}
                    </span>
                  )}
                </p>
              )}
              {change !== null && change > 0 && (
                <div className="space-y-2 rounded-xl border border-line bg-canvas p-3 text-sm">
                  <label className="flex cursor-pointer items-center gap-2 font-medium">
                    <input type="checkbox" checked={keepOn} onChange={(e) => setKeepOn(e.target.checked)} className="size-4 accent-forest" />
                    No change? Keep it for the customer
                  </label>
                  {keepOn &&
                    (!customer ? (
                      <p className="text-danger">Choose or add the customer above, so the change is kept in their name.</p>
                    ) : (
                      <label className="flex items-center gap-2">
                        <span className="shrink-0">Keep (K)</span>
                        <input
                          inputMode="decimal"
                          value={keepAmount}
                          onChange={(e) => setKeepAmount(e.target.value)}
                          placeholder={(change / 100).toFixed(2)}
                          aria-label="Change to keep for the customer"
                          aria-invalid={!keepOk ? true : undefined}
                          className="w-28 rounded-xl border border-line bg-surface px-3 py-1.5 text-base tabular-nums"
                        />
                        <span className="text-xs text-muted">{keepOk ? `for ${customer.name}` : `at most ${formatKwacha(change)}`}</span>
                      </label>
                    ))}
                </div>
              )}
              {change !== null && change < 0 && (
                <p className="text-sm text-danger">
                  {formatKwacha(-change)} short
                </p>
              )}
            </div>
          ) : method === "ON_ACCOUNT" ? (
            <div className="space-y-2 text-sm">
              {!customer ? (
                <p className="text-muted">
                  Choose the customer above. Only customers with a credit limit
                  can buy on account.
                </p>
              ) : !customer.hasCredit ? (
                <p className="text-danger">
                  {customer.name} doesn&apos;t have credit with you. An owner or
                  manager can give them a limit under Customers.
                </p>
              ) : due > customer.availableNgwee ? (
                <p className="text-danger">
                  Over {customer.name}&apos;s credit by{" "}
                  {formatKwacha(due - customer.availableNgwee)}. Take cash or
                  mobile money instead.
                </p>
              ) : (
                due > 0 && <p>{formatKwacha(due)} is added to what {customer.name} owes.</p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted">
                Ask the customer to send the money, then type the transaction ID
                from the confirmation SMS.
              </p>
              <label className="block space-y-1 text-sm">
                <span className="block font-medium">Transaction ID</span>
                <input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  autoCapitalize="characters"
                  className="w-full rounded-xl border border-line px-3 py-2 text-base"
                />
              </label>
              {!customer?.phone && (
                <label className="block space-y-1 text-sm">
                  <span className="block font-medium">
                    Number it came from (optional)
                  </span>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    inputMode="tel"
                    placeholder="097…"
                    className="w-full rounded-xl border border-line px-3 py-2 text-base"
                  />
                </label>
              )}
            </div>
          )}
        </fieldset>

        {error && (
          <p
            role="alert"
            className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger"
          >
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={!ready || pending}
          className="w-full rounded-xl bg-brand px-4 py-3 font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {pending
            ? "Recording…"
            : `Complete sale${total ? ` · ${formatKwacha(due)}` : ""}`}
        </button>
      </section>
    </div>
  );
}

/** Who is buying: optional for cash and mobile money, needed on account. Cashiers can add a new customer here. */
function CustomerPicker({
  customers,
  selected,
  required,
  onSelect,
}: {
  customers: TillCustomer[];
  selected: TillCustomer | undefined;
  required: boolean;
  onSelect: (c: TillCustomer | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const q = query.trim().toLowerCase();
  // "097 123 4567" or "+260971234567" should both find 0971234567.
  const digits = q.replace(/[\s-]/g, "").replace(/^\+?260/, "0");
  const found = q
    ? customers
        .filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            (/^\d{3,}$/.test(digits) && (c.phone ?? "").includes(digits)),
        )
        .slice(0, 5)
    : [];

  function startAdding() {
    const looksLikePhone = /^[+\d][\d\s-]*$/.test(query.trim());
    setName(looksLikePhone ? "" : query.trim());
    setPhone(looksLikePhone ? query.trim() : "");
    setNote(null);
    setAdding(true);
  }

  function save() {
    setNote(null);
    startTransition(async () => {
      const res = await addCustomerAtTill({ name, phone });
      if (!res.ok) {
        setNote(res.error);
        return;
      }
      const known = customers.find((c) => c.id === res.customer.id);
      onSelect(known ?? { ...res.customer, hasCredit: false });
      if (res.existed)
        setNote(
          `That number is already ${res.customer.name}'s, so they're chosen.`,
        );
      setAdding(false);
      setQuery("");
    });
  }

  const box =
    "w-full rounded-xl border border-line bg-surface px-3 py-2 text-base";
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span id="customer-label" className="text-sm font-medium">
          Customer{" "}
          {!required && (
            <span className="font-normal text-muted">(optional)</span>
          )}
        </span>
        {!selected && !adding && (
          <button
            type="button"
            onClick={startAdding}
            className="text-sm font-medium text-brand hover:underline"
          >
            + New customer
          </button>
        )}
      </div>

      {selected ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-forest/30 bg-forest-soft px-3 py-2">
          <div className="min-w-0 text-sm">
            <div className="truncate font-semibold text-forest">
              {selected.name}
            </div>
            <div className="text-xs text-muted">
              {selected.phone ?? "No phone"} ·{" "}
              {selected.hasCredit
                ? `${formatKwacha(selected.availableNgwee)} credit left`
                : "cash only"}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              onSelect(null);
              setNote(null);
            }}
            className="shrink-0 rounded-lg px-2 py-1 text-sm text-muted hover:bg-surface hover:text-ink"
          >
            Change
          </button>
        </div>
      ) : adding ? (
        <div className="space-y-2 rounded-xl border border-line bg-canvas p-3">
          <label className="block space-y-1 text-sm">
            <span className="block font-medium">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className={box}
              placeholder="Mrs Banda"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="block font-medium">Mobile number (optional)</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              className={box}
              placeholder="097…"
            />
          </label>
          <p className="text-xs text-muted">
            New customers start cash only. An owner or manager can give them
            credit later.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={pending || name.trim().length < 2}
              className="rounded-xl bg-forest px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {pending ? "Adding…" : "Add and choose"}
            </button>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="rounded-xl border border-line bg-surface px-4 py-2 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <input
            type="search"
            aria-labelledby="customer-label"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or phone"
            className={box}
          />
          {found.length > 0 && (
            <ul className="overflow-hidden rounded-xl border border-line bg-surface">
              {found.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(c);
                      setQuery("");
                      setNote(null);
                    }}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-canvas"
                  >
                    <span className="truncate font-medium">{c.name}</span>
                    <span className="shrink-0 text-xs text-muted">
                      {c.phone ?? ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {q && found.length === 0 && (
            <p className="text-sm text-muted">
              No customer matches.{" "}
              <button
                type="button"
                onClick={startAdding}
                className="font-medium text-brand hover:underline"
              >
                Add &ldquo;{query.trim()}&rdquo;
              </button>
            </p>
          )}
        </div>
      )}
      {note && (
        <p role="status" className="text-sm text-muted">
          {note}
        </p>
      )}
    </div>
  );
}
