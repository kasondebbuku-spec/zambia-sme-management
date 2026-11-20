import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { editProduct, stockCount, stockMovement } from "@/app/actions/products";
import { ProductForm } from "@/components/ProductForm";
import { CountForm, MovementForm } from "@/components/StockForms";
import { formatKwacha, margin } from "@/lib/money";
import { DomainError } from "@/server/errors";
import { getProduct, isLowStock } from "@/server/products";
import { requireUser } from "@/server/session";
import { movementHistory } from "@/server/stock";

export const metadata: Metadata = { title: "Product" };

const TYPE_LABEL = {
  OPENING: "Opening stock",
  RESTOCK: "Received",
  SALE: "Sold",
  RETURN: "Returned",
  DAMAGE: "Damaged",
  ADJUSTMENT: "Count correction",
} as const;

const toKwachaInput = (ngwee: number) => (ngwee / 100).toFixed(2);

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, ctx } = await requireUser();
  const product = await getProduct(ctx, id).catch((e) => {
    if (e instanceof DomainError && e.code === "not_found") notFound();
    throw e;
  });
  const history = await movementHistory(ctx, id);
  const canManage = user.role !== "CASHIER";
  const m = margin(product.costNgwee, product.priceNgwee);
  const when = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lusaka", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Link href="/products" className="text-sm text-muted hover:text-ink">
          ← Products
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{product.name}</h1>
            <p className="text-sm text-muted">
              {product.sku} · {product.category}
            </p>
          </div>
          <div className="text-right">
            <div className={`text-3xl font-semibold tabular-nums ${product.stockQty === 0 ? "text-danger" : isLowStock(product) ? "text-warn" : ""}`}>
              {product.stockQty} <span className="text-base font-normal text-muted">{product.unit}</span>
            </div>
            <div className="text-xs text-muted">in stock · reorder at {product.reorderLevel}</div>
          </div>
        </div>
      </div>

      <dl className="grid gap-3 sm:grid-cols-4">
        <Info label="Selling price" value={formatKwacha(product.priceNgwee)} />
        <Info label="Cost price" value={formatKwacha(product.costNgwee)} />
        <Info label="Profit per unit" value={formatKwacha(product.priceNgwee - product.costNgwee)} />
        <Info label="Margin" value={m === null ? "—" : `${Math.round(m * 100)}%`} />
      </dl>

      {canManage && (
        <section className="grid gap-6 card p-6 lg:grid-cols-2">
          <MovementForm action={stockMovement.bind(null, product.id)} unit={product.unit} />
          <CountForm action={stockCount.bind(null, product.id)} current={product.stockQty} />
        </section>
      )}

      <section aria-labelledby="history-heading" className="space-y-3">
        <h2 id="history-heading" className="text-lg font-semibold">
          Stock history
        </h2>
        {history.length === 0 ? (
          <p className="text-muted">No stock recorded yet.</p>
        ) : (
          <div className="overflow-x-auto card">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-canvas text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">
                    When
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    What
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    Change
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    Balance
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    By
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {history.map((h) => (
                  <tr key={h.id}>
                    <td className="whitespace-nowrap px-4 py-2 text-muted">{when.format(h.createdAt)}</td>
                    <td className="px-4 py-2">
                      {TYPE_LABEL[h.type]}
                      {h.note && <div className="text-xs text-muted">{h.note}</div>}
                    </td>
                    <td className={`px-4 py-2 text-right font-medium tabular-nums ${h.quantity > 0 ? "text-good" : "text-danger"}`}>
                      {h.quantity > 0 ? `+${h.quantity}` : h.quantity}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{h.balanceAfter}</td>
                    <td className="px-4 py-2 text-muted">{h.user?.name ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {canManage && (
        <details className="card p-6">
          <summary className="cursor-pointer font-medium">Edit product details</summary>
          <div className="mt-4">
            <ProductForm
              action={editProduct.bind(null, product.id)}
              initial={{
                sku: product.sku,
                name: product.name,
                category: product.category,
                unit: product.unit,
                cost: toKwachaInput(product.costNgwee),
                price: toKwachaInput(product.priceNgwee),
                reorderLevel: String(product.reorderLevel),
              }}
            />
          </div>
        </details>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
