import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { changeLimit, takePayment } from "@/app/actions/customers";
import { LimitForm, PaymentForm } from "@/components/CustomerForms";
import { formatKwacha } from "@/lib/money";
import { PAYMENT_LABEL } from "@/lib/labels";
import { customerHistory, statement } from "@/server/customers";
import { DomainError } from "@/server/errors";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Customer" };

const day = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Lusaka",
  day: "numeric",
  month: "short",
});
const when = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Lusaka",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function CustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user, ctx } = await requireUser();
  const {
    customer: c,
    lines,
    matches,
  } = await statement(ctx, id).catch((e) => {
    if (e instanceof DomainError && e.code === "not_found") notFound();
    throw e;
  });
  const history = await customerHistory(ctx, id);
  const available = Math.max(0, c.creditLimitNgwee - c.balanceNgwee);
  const hasCredit =
    c.creditLimitNgwee > 0 || c.balanceNgwee > 0 || lines.length > 0;

  return (
    <div className="space-y-6">
      <Link href="/customers" className="text-sm text-muted hover:text-ink">
        ← Customers
      </Link>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{c.name}</h1>
        <p className="mt-1 text-sm text-muted">
          {c.phone ?? "No phone number"}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Info
          label="Spent with you"
          value={formatKwacha(history.spentNgwee)}
          sub={`${history.visits} ${history.visits === 1 ? "visit" : "visits"}`}
        />
        <Info
          label="Last visit"
          value={history.lastVisit ? day.format(history.lastVisit) : "Not yet"}
        />
        <Info
          label="Owes you"
          value={formatKwacha(c.balanceNgwee)}
          tone={c.balanceNgwee > 0 ? "warn" : undefined}
        />
        <Info
          label="Credit"
          value={
            c.creditLimitNgwee === 0 ? "Cash only" : formatKwacha(available)
          }
          sub={
            c.creditLimitNgwee === 0
              ? undefined
              : `left of ${formatKwacha(c.creditLimitNgwee)}`
          }
        />
      </dl>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="favourites-heading" className="card p-5">
          <h2 id="favourites-heading" className="font-semibold">
            Usually buys
          </h2>
          {history.favourites.length === 0 ? (
            <p className="mt-2 text-sm text-muted">
              Nothing yet. Choose {c.name} at the till when they buy, and their
              favourites show here.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {history.favourites.map((f) => (
                <li
                  key={f.productId}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="min-w-0 truncate">{f.name}</span>
                  <span className="shrink-0 tabular-nums text-muted">
                    {f.quantity} {f.unit}
                    {f.quantity === 1 ? "" : "s"} ·{" "}
                    <span className="text-ink">
                      {formatKwacha(f.spentNgwee)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section
          aria-labelledby="recent-heading"
          className="card overflow-hidden"
        >
          <h2 id="recent-heading" className="px-5 pt-5 font-semibold">
            Recent purchases
          </h2>
          {history.recent.length === 0 ? (
            <p className="px-5 pb-5 pt-2 text-sm text-muted">
              No purchases yet.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {history.recent.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/sales/${s.id}`}
                    className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm hover:bg-canvas"
                  >
                    <span>
                      <span className="font-medium">#{s.receiptNo}</span>{" "}
                      <span className="text-muted">
                        · {when.format(s.createdAt)} · {PAYMENT_LABEL[s.method]}
                      </span>
                    </span>
                    <span
                      className={`tabular-nums ${s.status === "VOIDED" ? "text-muted line-through" : "font-medium"}`}
                    >
                      {formatKwacha(s.totalNgwee)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {!matches && (
        <p
          role="alert"
          className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger"
        >
          The statement doesn&apos;t add up to the balance. Please report this.
        </p>
      )}

      {hasCredit && (
        <section aria-labelledby="statement-heading" className="space-y-3">
          <h2 id="statement-heading" className="text-lg font-semibold">
            Credit statement
          </h2>
          {lines.length === 0 ? (
            <p className="text-muted">No credit sales or payments yet.</p>
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
                    <th
                      scope="col"
                      className="px-4 py-2 text-right font-medium"
                    >
                      Amount
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-2 text-right font-medium"
                    >
                      Owes after
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {lines.map((l, i) => (
                    <tr key={i}>
                      <td className="whitespace-nowrap px-4 py-2 text-muted">
                        {when.format(l.at)}
                      </td>
                      <td className="px-4 py-2">
                        {l.link ? (
                          <Link href={l.link} className="hover:underline">
                            {l.description}
                          </Link>
                        ) : (
                          l.description
                        )}
                      </td>
                      <td
                        className={`px-4 py-2 text-right tabular-nums ${l.amountNgwee < 0 ? "text-good" : ""}`}
                      >
                        {l.amountNgwee < 0
                          ? `−${formatKwacha(-l.amountNgwee)}`
                          : `+${formatKwacha(l.amountNgwee)}`}
                      </td>
                      <td className="px-4 py-2 text-right font-medium tabular-nums">
                        {formatKwacha(l.balanceNgwee)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {c.balanceNgwee > 0 && (
          <section className="card p-6">
            <PaymentForm
              action={takePayment.bind(null, c.id)}
              owes={(c.balanceNgwee / 100).toFixed(2)}
            />
          </section>
        )}
        {user.role !== "CASHIER" && (
          <section className="card p-6">
            <LimitForm
              action={changeLimit.bind(null, c.id)}
              current={(c.creditLimitNgwee / 100).toFixed(2)}
            />
          </section>
        )}
      </div>
    </div>
  );
}

function Info({
  label,
  value,
  tone,
  sub,
}: {
  label: string;
  value: string;
  tone?: "warn";
  sub?: string;
}) {
  return (
    <div className="card p-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd
        className={`mt-1 text-xl font-semibold tabular-nums ${tone === "warn" ? "text-warn" : ""}`}
      >
        {value}
      </dd>
      {sub && <dd className="text-xs text-muted">{sub}</dd>}
    </div>
  );
}
