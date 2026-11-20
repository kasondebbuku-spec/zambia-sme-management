import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { addSupplier } from "@/app/actions/purchasing";
import { SimpleForm } from "@/components/SimpleForm";
import { listSuppliers } from "@/server/purchases";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Suppliers" };

export default async function SuppliersPage() {
  const { user, ctx } = await requireUser();
  if (user.role === "CASHIER") redirect("/dashboard");
  const suppliers = await listSuppliers(ctx);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Suppliers</h1>
      {suppliers.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-6 text-center text-muted">No suppliers yet. Add the wholesalers you buy from.</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {suppliers.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div>
                <div className="font-medium">{s.name}</div>
                <div className="text-sm text-muted">{[s.phone, s.notes].filter(Boolean).join(" · ") || "No contact details"}</div>
              </div>
              <span className="text-sm text-muted">
                {s._count.purchases} {s._count.purchases === 1 ? "order" : "orders"}
              </span>
            </li>
          ))}
        </ul>
      )}
      <section className="rounded-xl border border-line bg-surface p-6">
        <h2 className="mb-4 text-lg font-semibold">Add a supplier</h2>
        <SimpleForm
          action={addSupplier}
          submit="Add supplier"
          fields={[
            { name: "name", label: "Name", required: true, placeholder: "Kalulushi Wholesalers" },
            { name: "phone", label: "Phone", inputMode: "tel" },
            { name: "notes", label: "Notes", placeholder: "Delivers on Tuesdays" },
          ]}
        />
      </section>
    </div>
  );
}
