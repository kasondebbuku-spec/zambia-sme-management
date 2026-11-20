import type { Metadata } from "next";
import Link from "next/link";
import { addCustomer } from "@/app/actions/customers";
import { SimpleForm } from "@/components/SimpleForm";
import { formatKwacha } from "@/lib/money";
import { listCustomers } from "@/server/customers";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { user, ctx } = await requireUser();
  const { q = "" } = await searchParams;
  const customers = await listCustomers(ctx, q);
  const totalOwed = customers.reduce((n, c) => n + c.balanceNgwee, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold">Customers</h1>
        {totalOwed > 0 && (
          <p className="text-sm text-muted">
            Owed to you: <strong className="tabular-nums text-ink">{formatKwacha(totalOwed)}</strong>
          </p>
        )}
      </div>

      <form role="search" className="flex gap-3">
        <label htmlFor="q" className="sr-only">
          Search customers
        </label>
        <input id="q" name="q" defaultValue={q} placeholder="Search by name or phone" className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-2" />
        <button className="rounded-md border border-line bg-surface px-4 py-2 text-sm hover:bg-canvas">Search</button>
      </form>

      {customers.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-6 text-center text-muted">{q ? "No customers match." : "No customers yet. Add regulars who buy on credit."}</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {customers.map((c) => {
            const full = c.creditLimitNgwee > 0 && c.balanceNgwee >= c.creditLimitNgwee;
            return (
              <li key={c.id}>
                <Link href={`/customers/${c.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-canvas">
                  <div>
                    <div className="font-medium">{c.name}</div>
                    <div className="text-sm text-muted">
                      {c.phone ?? "No phone"} · {c.creditLimitNgwee === 0 ? "cash only" : `limit ${formatKwacha(c.creditLimitNgwee)}`}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`font-semibold tabular-nums ${c.balanceNgwee > 0 ? "" : "text-muted"}`}>{c.balanceNgwee > 0 ? `owes ${formatKwacha(c.balanceNgwee)}` : "owes nothing"}</div>
                    {full && <div className="text-xs font-medium text-danger">at credit limit</div>}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {user.role !== "CASHIER" && (
        <section className="rounded-xl border border-line bg-surface p-6">
          <h2 className="mb-4 text-lg font-semibold">Add a customer</h2>
          <SimpleForm
            action={addCustomer}
            submit="Add customer"
            columns={3}
            fields={[
              { name: "name", label: "Name", required: true, placeholder: "Mr Phiri" },
              { name: "phone", label: "Mobile number", inputMode: "tel", placeholder: "097…" },
              { name: "creditLimit", label: "Credit limit (K)", inputMode: "decimal", defaultValue: "0", hint: "0 means cash only", errorKey: "creditLimitNgwee" },
            ]}
          />
        </section>
      )}
    </div>
  );
}
