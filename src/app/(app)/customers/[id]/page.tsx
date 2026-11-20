import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { changeLimit, takePayment } from "@/app/actions/customers";
import { LimitForm, PaymentForm } from "@/components/CustomerForms";
import { formatKwacha } from "@/lib/money";
import { statement } from "@/server/customers";
import { DomainError } from "@/server/errors";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Customer" };

const when = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lusaka", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, ctx } = await requireUser();
  const { customer: c, lines, matches } = await statement(ctx, id).catch((e) => {
    if (e instanceof DomainError && e.code === "not_found") notFound();
    throw e;
  });
  const available = Math.max(0, c.creditLimitNgwee - c.balanceNgwee);

  return (
    <div className="space-y-6">
      <Link href="/customers" className="text-sm text-muted hover:text-ink">
        ← Customers
      </Link>
      <div>
        <h1 className="text-2xl font-semibold">{c.name}</h1>
        <p className="mt-1 text-sm text-muted">{c.phone ?? "No phone number"}</p>
      </div>

      <dl className="grid gap-3 sm:grid-cols-3">
        <Info label="Owes you" value={formatKwacha(c.balanceNgwee)} tone={c.balanceNgwee > 0 ? "warn" : undefined} />
        <Info label="Credit limit" value={c.creditLimitNgwee === 0 ? "Cash only" : formatKwacha(c.creditLimitNgwee)} />
        <Info label="Can still buy on account" value={formatKwacha(available)} />
      </dl>

      {!matches && (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
          The statement doesn&apos;t add up to the balance. Please report this.
        </p>
      )}

      <section aria-labelledby="statement-heading" className="space-y-3">
        <h2 id="statement-heading" className="text-lg font-semibold">
          Statement
        </h2>
        {lines.length === 0 ? (
          <p className="text-muted">No credit sales or payments yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line bg-surface">
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
                    Amount
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    Owes after
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td className="whitespace-nowrap px-4 py-2 text-muted">{when.format(l.at)}</td>
                    <td className="px-4 py-2">
                      {l.link ? (
                        <Link href={l.link} className="hover:underline">
                          {l.description}
                        </Link>
                      ) : (
                        l.description
                      )}
                    </td>
                    <td className={`px-4 py-2 text-right tabular-nums ${l.amountNgwee < 0 ? "text-good" : ""}`}>
                      {l.amountNgwee < 0 ? `−${formatKwacha(-l.amountNgwee)}` : `+${formatKwacha(l.amountNgwee)}`}
                    </td>
                    <td className="px-4 py-2 text-right font-medium tabular-nums">{formatKwacha(l.balanceNgwee)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {c.balanceNgwee > 0 && (
          <section className="rounded-xl border border-line bg-surface p-6">
            <PaymentForm action={takePayment.bind(null, c.id)} owes={(c.balanceNgwee / 100).toFixed(2)} />
          </section>
        )}
        {user.role !== "CASHIER" && (
          <section className="rounded-xl border border-line bg-surface p-6">
            <LimitForm action={changeLimit.bind(null, c.id)} current={(c.creditLimitNgwee / 100).toFixed(2)} />
          </section>
        )}
      </div>
    </div>
  );
}

function Info({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className={`mt-1 text-xl font-semibold tabular-nums ${tone === "warn" ? "text-warn" : ""}`}>{value}</dd>
    </div>
  );
}
