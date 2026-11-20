import type { Metadata } from "next";
import Link from "next/link";
import { formatKwacha } from "@/lib/money";
import { isLowStock, listProducts } from "@/server/products";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Products" };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ q?: string; low?: string }> }) {
  const { user, ctx } = await requireUser();
  const { q = "", low } = await searchParams;
  const lowOnly = low === "1";
  const products = await listProducts(ctx, { search: q, lowStockOnly: lowOnly });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Products</h1>
        {user.role !== "CASHIER" && (
          <Link href="/products/new" className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
            Add product
          </Link>
        )}
      </div>

      <form className="flex flex-wrap items-center gap-3" role="search">
        <label htmlFor="q" className="sr-only">
          Search products
        </label>
        <input id="q" name="q" defaultValue={q} placeholder="Search by name, code or category" className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-2" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="low" value="1" defaultChecked={lowOnly} /> Running low only
        </label>
        <button className="rounded-md border border-line bg-surface px-4 py-2 text-sm hover:bg-canvas">Search</button>
      </form>

      {products.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-6 text-center text-muted">
          {q || lowOnly ? "No products match." : "No products yet."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-canvas text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">
                  Product
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Category
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  Price
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  In stock
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {products.map((p) => (
                <tr key={p.id} className="hover:bg-canvas">
                  <td className="px-4 py-2">
                    <Link href={`/products/${p.id}`} className="font-medium hover:underline">
                      {p.name}
                    </Link>
                    <div className="text-xs text-muted">{p.sku}</div>
                  </td>
                  <td className="px-4 py-2 text-muted">{p.category}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatKwacha(p.priceNgwee)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    <span className={p.stockQty === 0 ? "font-medium text-danger" : isLowStock(p) ? "font-medium text-warn" : ""}>
                      {p.stockQty} {p.unit}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
