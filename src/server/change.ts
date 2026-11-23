import type { ChangeKind } from "@prisma/client";
import { formatKwacha } from "@/lib/money";
import { db, type Tx } from "./db";
import { DomainError, requireRole, type Ctx } from "./errors";

// Many shops run out of coins and small notes. Instead of losing the sale or rounding, the
// shop keeps the customer's change and they use it next time, or collect it later. Kantemba
// holds that per customer, like a small wallet, with every movement recorded.

/**
 * Adds to (+) or takes from (−) what the shop holds for a customer, in one conditional UPDATE
 * so two tills can't spend the same change twice. Returns the new balance.
 */
export async function moveChange(tx: Tx, ctx: Ctx, customerId: string, deltaNgwee: number, kind: ChangeKind, saleId?: string) {
  const rows = await tx.$queryRaw<{ changeHeldNgwee: number }[]>`
    UPDATE "Customer" SET "changeHeldNgwee" = "changeHeldNgwee" + ${deltaNgwee}
    WHERE id = ${customerId} AND "businessId" = ${ctx.businessId} AND "changeHeldNgwee" + ${deltaNgwee} >= 0
    RETURNING "changeHeldNgwee"`;
  if (rows.length === 0) {
    const c = await tx.customer.findFirst({ where: { id: customerId, businessId: ctx.businessId }, select: { name: true, changeHeldNgwee: true } });
    if (!c) throw new DomainError("Customer not found", "not_found");
    throw new DomainError(
      c.changeHeldNgwee === 0 ? `You aren't keeping any change for ${c.name}.` : `You're only keeping ${formatKwacha(c.changeHeldNgwee)} change for ${c.name}.`,
      "conflict",
    );
  }
  const balanceAfter = rows[0]!.changeHeldNgwee;
  await tx.changeEntry.create({ data: { customerId, saleId: saleId ?? null, kind, amountNgwee: deltaNgwee, balanceAfter, byId: ctx.userId } });
  return balanceAfter;
}

/** The customer collects some or all of their kept change in cash. Any role can hand it over. */
export async function payOutChange(ctx: Ctx, customerId: string, amountNgwee: number) {
  requireRole(ctx, "OWNER", "MANAGER", "CASHIER");
  if (!Number.isInteger(amountNgwee) || amountNgwee <= 0) throw new DomainError("Enter an amount above zero", "invalid");
  return db.$transaction((tx) => moveChange(tx, ctx, customerId, -amountNgwee, "PAID_OUT"));
}

export type ChangeLine = { at: Date; kind: ChangeKind; amountNgwee: number; balanceAfter: number; receiptNo: number | null; saleId: string | null; by: string | null };

/** A customer's kept change, newest first. */
export async function changeHistory(ctx: Ctx, customerId: string, take = 20): Promise<ChangeLine[]> {
  const entries = await db.changeEntry.findMany({
    where: { customerId, customer: { businessId: ctx.businessId } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
    include: { sale: { select: { receiptNo: true } }, by: { select: { name: true } } },
  });
  return entries.map((e) => ({ at: e.createdAt, kind: e.kind, amountNgwee: e.amountNgwee, balanceAfter: e.balanceAfter, receiptNo: e.sale?.receiptNo ?? null, saleId: e.saleId, by: e.by?.name ?? null }));
}

/** Change handed out of the drawer in [from, to), for the day's cash count. */
export async function changePaidOutBetween(ctx: Ctx, from: Date, to: Date) {
  const r = await db.changeEntry.aggregate({ where: { kind: "PAID_OUT", customer: { businessId: ctx.businessId }, createdAt: { gte: from, lt: to } }, _sum: { amountNgwee: true } });
  return -(r._sum.amountNgwee ?? 0);
}
