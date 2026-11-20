import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { addProduct } from "@/app/actions/products";
import { ProductForm } from "@/components/ProductForm";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Add product" };

export default async function NewProductPage() {
  const { user } = await requireUser();
  if (user.role === "CASHIER") redirect("/products");
  return (
    <div className="space-y-6">
      <Link href="/products" className="text-sm text-muted hover:text-ink">
        ← Products
      </Link>
      <h1 className="text-2xl font-semibold">Add a product</h1>
      <div className="rounded-xl border border-line bg-surface p-6">
        <ProductForm action={addProduct} isNew />
      </div>
    </div>
  );
}
