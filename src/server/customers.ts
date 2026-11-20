import { Prisma } from "@prisma/client";
import { z } from "zod";
import { formatKwacha } from "@/lib/money";
import { db, type Tx } from "./db";
import { DomainError, requireRole, type Ctx } from "./errors";

// Regular customers can buy "on account" and pay later, which many small shops already do in
// an exercise book. Each customer has a credit limit; what they owe can never go above it.

const zambianPhone = z
  .string()
  .trim()
  .transform((s) => s.replace(/[\s-]/g, ""))
  .refine((s) => s === "" || /^(?:\+?260|0)?[79]\d{8}$/.test(s), "Enter a Zambian mobile number")
  .transform((s) => (s === "" ? null : "0" + s.slice(-9))); // stored as 0971234567

export const customerInput = z.object({
  name: z.string().trim().min(2, "Enter the customer's name").max(120),
  phone: zambianPhone.optional().transform((s) => s ?? null),
  creditLimitNgwee: z.number().int().min(0, "The limit can't be negative").max(100_000_000),
});

export async function createCustomer(ctx: Ctx, input: z.input<typeof customerInput>) {
  requireRole(ctx, "OWNER", "MANAGER");
  const data = customerInput.parse(input);
  try {
    return await db.customer.create({ data: { ...data, businessId: ctx.businessId } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new DomainError("Another customer already has that phone number", "conflict");
    throw e;
  }
}

/** Lowering a limit below what's owed is allowed: it simply stops further credit. */
export async function setCreditLimit(ctx: Ctx, customerId: string, creditLimitNgwee: number) {
  requireRole(ctx, "OWNER", "MANAGER");
  const limit = z.number().int().min(0).max(100_000_000).parse(creditLimitNgwee);
  const res = await db.customer.updateMany({ where: { id: customerId, businessId: ctx.businessId }, data: { creditLimitNgwee: limit } });
  if (res.count === 0) throw new DomainError("Customer not found", "not_found");
}

export class CreditLimitError extends DomainError {
  constructor(name: string, owes: number, limit: number, wanted: number) {
    const available = Math.max(0, limit - owes);
    super(
      limit === 0
        ? `${name} doesn't have credit with you. Take cash or mobile money.`
        : `That's over ${name}'s credit limit. They owe ${formatKwacha(owes)} of ${formatKwacha(limit)}, so ${formatKwacha(available)} is available but this sale is ${formatKwacha(wanted)}.`,
      "conflict",
    );
  }
}

/**
 * Adds a sale to what a customer owes, inside the sale's transaction. Like stock, it's one
 * conditional UPDATE, "add K50 only if they'd still be within their limit", so two tills
 * can't both push a customer over it. Prisma can't compare two columns, hence raw SQL.
 */
export async function chargeAccount(tx: Tx, ctx: Ctx, customerId: string, amountNgwee: number) {
  const updated = await tx.$executeRaw`
    UPDATE "Customer" SET "balanceNgwee" = "balanceNgwee" + ${amountNgwee}
    WHERE id = ${customerId} AND "businessId" = ${ctx.businessId}
      AND "balanceNgwee" + ${amountNgwee} <= "creditLimitNgwee"`;
  if (updated === 0) {
    const c = await tx.customer.findFirst({ where: { id: customerId, businessId: ctx.businessId } });
    if (!c) throw new DomainError("Customer not found", "not_found");
    throw new CreditLimitError(c.name, c.balanceNgwee, c.creditLimitNgwee, amountNgwee);
  }
}

/** Takes a cancelled on-account sale back off what the customer owes. */
export async function uncharge(tx: Tx, customerId: string, amountNgwee: number) {
  await tx.customer.update({ where: { id: customerId }, data: { balanceNgwee: { decrement: amountNgwee } } });
}

export const paymentInput = z.object({
  amountNgwee: z.number().int().positive("Enter an amount above zero"),
  method: z.enum(["CASH", "MOBILE_MONEY"]),
  reference: z.string().trim().max(40).optional().transform((s) => s || null),
});

/** A customer pays some or all of what they owe. They can't pay more than that. */
export async function recordPayment(ctx: Ctx, customerId: string, input: z.input<typeof paymentInput>) {
  const data = paymentInput.parse(input);
  if (data.method === "MOBILE_MONEY" && !data.reference) throw new DomainError("Enter the mobile-money transaction ID", "invalid");

  return db.$transaction(async (tx) => {
    const res = await tx.customer.updateMany({
      where: { id: customerId, businessId: ctx.businessId, balanceNgwee: { gte: data.amountNgwee } },
      data: { balanceNgwee: { decrement: data.amountNgwee } },
    });
    const c = await tx.customer.findFirst({ where: { id: customerId, businessId: ctx.businessId } });
    if (!c) throw new DomainError("Customer not found", "not_found");
    if (res.count === 0) {
      throw new DomainError(c.balanceNgwee === 0 ? `${c.name} doesn't owe anything` : `${c.name} only owes ${formatKwacha(c.balanceNgwee)}`, "invalid");
    }
    return tx.customerPayment.create({
      data: { customerId, amountNgwee: data.amountNgwee, method: data.method, reference: data.reference?.toUpperCase() ?? null, balanceAfter: c.balanceNgwee, receivedById: ctx.userId },
    });
  });
}

export function listCustomers(ctx: Ctx, search?: string) {
  const q = search?.trim();
  return db.customer.findMany({
    where: {
      businessId: ctx.businessId,
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { phone: { contains: q.replace(/\s/g, "") } }] } : {}),
    },
    orderBy: [{ balanceNgwee: "desc" }, { name: "asc" }],
  });
}

export type StatementLine = {
  at: Date;
  kind: "sale" | "cancelled" | "payment";
  description: string;
  amountNgwee: number; // + adds to what they owe, − reduces it
  balanceNgwee: number;
  link?: string;
};

/**
 * Everything on a customer's account, oldest first, with a running balance. A cancelled
 * sale shows as the original charge followed by a reversal, so the history stays honest.
 */
export async function statement(ctx: Ctx, customerId: string) {
  const customer = await db.customer.findFirst({ where: { id: customerId, businessId: ctx.businessId } });
  if (!customer) throw new DomainError("Customer not found", "not_found");

  const [sales, payments] = await Promise.all([
    db.sale.findMany({ where: { customerId, method: "ON_ACCOUNT" }, select: { id: true, receiptNo: true, totalNgwee: true, createdAt: true, status: true, voidedAt: true } }),
    db.customerPayment.findMany({ where: { customerId }, include: { receivedBy: { select: { name: true } } } }),
  ]);

  const events: Omit<StatementLine, "balanceNgwee">[] = [];
  for (const s of sales) {
    events.push({ at: s.createdAt, kind: "sale", description: `Receipt #${s.receiptNo}`, amountNgwee: s.totalNgwee, link: `/sales/${s.id}` });
    if (s.status === "VOIDED") events.push({ at: s.voidedAt ?? s.createdAt, kind: "cancelled", description: `Receipt #${s.receiptNo} cancelled`, amountNgwee: -s.totalNgwee, link: `/sales/${s.id}` });
  }
  for (const p of payments) {
    const how = p.method === "CASH" ? "Cash" : `Mobile money ${p.reference ?? ""}`.trim();
    events.push({ at: p.createdAt, kind: "payment", description: `Payment · ${how}${p.receivedBy ? ` · taken by ${p.receivedBy.name}` : ""}`, amountNgwee: -p.amountNgwee });
  }
  events.sort((a, b) => a.at.getTime() - b.at.getTime());

  let balance = 0;
  const lines: StatementLine[] = events.map((e) => ({ ...e, balanceNgwee: (balance += e.amountNgwee) }));
  return { customer, lines, matches: balance === customer.balanceNgwee };
}
