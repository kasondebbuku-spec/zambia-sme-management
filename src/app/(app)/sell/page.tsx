import type { Metadata } from "next";
import { SellScreen } from "@/components/SellScreen";
import { listCustomers } from "@/server/customers";
import { listProducts } from "@/server/products";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Sell" };

export default async function SellPage() {
  const { ctx } = await requireUser();
  const [products, customers] = await Promise.all([listProducts(ctx), listCustomers(ctx)]);
  // Every customer can be named on a sale; only those with a limit can buy on account.
  const tillCustomers = customers
    .map((c) => ({ id: c.id, name: c.name, phone: c.phone, hasCredit: c.creditLimitNgwee > 0, availableNgwee: Math.max(0, c.creditLimitNgwee - c.balanceNgwee) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  // In stock first, so the till shows what can actually be sold.
  const forTill = products
    .map(({ id, sku, name, unit, priceNgwee, stockQty }) => ({ id, sku, name, unit, priceNgwee, stockQty }))
    .sort((a, b) => Number(b.stockQty > 0) - Number(a.stockQty > 0) || a.name.localeCompare(b.name));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Sell</h1>
      {forTill.length === 0 ? <p className="text-muted">Add products before selling.</p> : <SellScreen products={forTill} customers={tillCustomers} />}
    </div>
  );
}
