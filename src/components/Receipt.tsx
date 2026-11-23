import { formatKwacha } from "@/lib/money";
import type { SaleWithItems } from "@/server/sales";

const when = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lusaka", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function Receipt({ sale }: { sale: SaleWithItems }) {
  return (
    <article className="mx-auto max-w-sm card p-6 font-mono text-sm print:max-w-none print:border-0 print:p-0" aria-label={`Receipt ${sale.receiptNo}`}>
      <header className="text-center">
        <div className="text-base font-bold">{sale.business.name}</div>
        {(sale.business.town || sale.business.phone) && <div className="text-xs">{[sale.business.town, sale.business.phone].filter(Boolean).join(" · ")}</div>}
        <div className="mt-2 text-xs">
          Receipt #{sale.receiptNo} · {when.format(sale.createdAt)}
        </div>
        {sale.cashier && <div className="text-xs">Served by {sale.cashier.name}</div>}
      </header>

      {sale.status === "VOIDED" && (
        <p className="mt-3 border-2 border-danger py-1 text-center font-bold uppercase tracking-widest text-danger">Cancelled</p>
      )}

      <table className="mt-4 w-full">
        <thead className="sr-only">
          <tr>
            <th>Item</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {sale.items.map((i) => (
            <tr key={i.id} className="align-top">
              <td className="py-1 pr-2">
                {i.name}
                <div className="text-xs text-muted">
                  {i.quantity} × {formatKwacha(i.unitPriceNgwee)}
                </div>
              </td>
              <td className="py-1 text-right tabular-nums">{formatKwacha(i.lineTotalNgwee)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="mt-3 space-y-1 border-t border-dashed border-ink pt-3">
        <Row label="TOTAL" value={formatKwacha(sale.totalNgwee)} strong />
        {sale.changeUsedNgwee > 0 && (
          <>
            <Row label="Kept change used" value={`−${formatKwacha(sale.changeUsedNgwee)}`} />
            <Row label="To pay" value={formatKwacha(sale.totalNgwee - sale.changeUsedNgwee)} />
          </>
        )}
        {sale.method === "CASH" ? (
          <>
            <Row label="Cash" value={formatKwacha(sale.tenderedNgwee ?? 0)} />
            <Row label={sale.changeKeptNgwee > 0 ? "Change given" : "Change"} value={formatKwacha(sale.changeNgwee ?? 0)} />
            {sale.changeKeptNgwee > 0 && <Row label="Change kept for you" value={formatKwacha(sale.changeKeptNgwee)} strong />}
          </>
        ) : sale.method === "ON_ACCOUNT" ? (
          <>
            <Row label="On account" value={sale.customer?.name ?? ""} />
            {sale.status === "COMPLETED" && sale.customer && <Row label="Now owes" value={formatKwacha(sale.customer.balanceNgwee)} />}
          </>
        ) : (
          <>
            <Row label="Mobile money" value={formatKwacha(sale.totalNgwee - sale.changeUsedNgwee)} />
            <Row label="Ref" value={sale.paymentRef ?? ""} />
          </>
        )}
        {sale.method !== "ON_ACCOUNT" && sale.customer && <Row label="Customer" value={sale.customer.name} />}
        {sale.status === "COMPLETED" && sale.customer && (sale.changeKeptNgwee > 0 || sale.changeUsedNgwee > 0) && (
          <Row label="Change we keep for you now" value={formatKwacha(sale.customer.changeHeldNgwee)} />
        )}
      </dl>

      {sale.status === "VOIDED" && sale.voidReason && (
        <p className="mt-3 text-xs">
          Cancelled by {sale.voidedBy?.name ?? "a manager"}: {sale.voidReason}
        </p>
      )}
      <p className="mt-4 text-center text-xs">Thank you for shopping with us</p>
    </article>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${strong ? "text-base font-bold" : ""}`}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
