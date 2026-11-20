import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PurchaseOrderForm } from "@/components/PurchaseOrderForm";
import { listProducts } from "@/server/products";
import { listSuppliers } from "@/server/purchases";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "New purchase order" };

export default async function NewPurchasePage() {
  const { user, ctx } = await requireUser();
  if (user.role === "CASHIER") redirect("/dashboard");
  const [suppliers, products] = await Promise.all([listSuppliers(ctx), listProducts(ctx)]);

  return (
    <div className="space-y-6">
      <Link href="/purchases" className="text-sm text-muted hover:text-ink">
        ← Purchase orders
      </Link>
      <div>
        <h1 className="text-2xl font-semibold">New purchase order</h1>
        <p className="mt-1 text-sm text-muted">Everything running low is already on the order. Adjust quantities and prices, or add more.</p>
      </div>
      {suppliers.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-6 text-center text-muted">
          Add a supplier first on the{" "}
          <Link href="/suppliers" className="text-brand hover:underline">
            Suppliers
          </Link>{" "}
          page.
        </p>
      ) : (
        <div className="rounded-xl border border-line bg-surface p-6">
          <PurchaseOrderForm
            suppliers={suppliers.map(({ id, name }) => ({ id, name }))}
            products={products.map(({ id, name, sku, unit, costNgwee, stockQty, reorderLevel }) => ({ id, name, sku, unit, costNgwee, stockQty, reorderLevel }))}
          />
        </div>
      )}
    </div>
  );
}
