import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cancelSale } from "@/app/actions/sales";
import { Receipt } from "@/components/Receipt";
import { CancelSaleForm, PrintButton } from "@/components/SaleActions";
import { DomainError } from "@/server/errors";
import { getSale } from "@/server/sales";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Receipt" };

export default async function SalePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ new?: string }> }) {
  const [{ id }, { new: isNew }] = await Promise.all([params, searchParams]);
  const { user, ctx } = await requireUser();
  const sale = await getSale(ctx, id).catch((e) => {
    if (e instanceof DomainError && e.code === "not_found") notFound();
    throw e;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/sales" className="text-sm text-muted hover:text-ink">
          ← Today&apos;s sales
        </Link>
        <div className="flex gap-2">
          <PrintButton />
          <Link href="/sell" className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
            New sale
          </Link>
        </div>
      </div>

      {isNew && sale.status === "COMPLETED" && (
        <p role="status" className="mx-auto max-w-sm rounded-md bg-good-soft px-3 py-2 text-center text-sm text-good print:hidden">
          Sale recorded.{sale.method === "CASH" && sale.changeNgwee ? " Give the customer their change." : ""}
        </p>
      )}

      <Receipt sale={sale} />

      {sale.status === "COMPLETED" && user.role !== "CASHIER" && (
        <div className="mx-auto max-w-sm">
          <CancelSaleForm action={cancelSale.bind(null, sale.id)} />
        </div>
      )}
    </div>
  );
}
