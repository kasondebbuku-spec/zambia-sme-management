import { Prisma, type PaymentMethod } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { formatKwacha } from "@/lib/money";
import { moveChange } from "./change";
import { DomainError, requireRole, type Ctx } from "./errors";
import { chargeAccount, uncharge } from "./customers";
import { moveStock } from "./stock";

export const checkoutInput = z.object({
  // Made once per basket by the till, so a double tap or a retry can't record the sale twice.
  clientRef: z.string().trim().min(8).max(64),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().int().positive().max(10_000),
      }),
    )
    .min(1, "The basket is empty")
    .max(100, "Too many lines in one sale"),
  payment: z.discriminatedUnion("method", [
    z.object({
      method: z.literal("CASH"),
      tenderedNgwee: z.number().int().min(0),
      // No coins? Some or all of the change is kept for the named customer.
      keepChangeNgwee: z.number().int().min(0).default(0),
    }),
    z.object({
      method: z.literal("MOBILE_MONEY"),
      // The customer approves on their phone; the cashier types the transaction ID from the SMS.
      reference: z
        .string()
        .trim()
        .regex(
          /^[A-Za-z0-9.-]{6,40}$/,
          "Enter the transaction ID from the mobile-money SMS",
        ),
    }),
    // A regular customer pays later: the total is added to what they owe, within their limit.
    z.object({
      method: z.literal("ON_ACCOUNT"),
      customerId: z.string().min(1, "Choose the customer"),
    }),
  ]),
  // Any sale can name the customer, so the shop sees what its regulars buy. Optional for cash
  // and mobile money; an on-account sale names them in the payment.
  customerId: z
    .string()
    .min(1)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  customerPhone: z
    .string()
    .trim()
    .regex(/^(?:\+?260|0)?[79]\d{8}$/, "Enter a Zambian mobile number")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  // Change the shop kept for this customer earlier, put towards this sale.
  useChangeNgwee: z.number().int().min(0).default(0),
});

export type CheckoutInput = z.input<typeof checkoutInput>;

const saleInclude = {
  items: { orderBy: { name: "asc" } },
  cashier: { select: { name: true } },
  voidedBy: { select: { name: true } },
  customer: { select: { id: true, name: true, balanceNgwee: true, changeHeldNgwee: true } },
  business: { select: { name: true, town: true, phone: true } },
} satisfies Prisma.SaleInclude;

export type SaleWithItems = Prisma.SaleGetPayload<{
  include: typeof saleInclude;
}>;

/**
 * Records a sale. Everything happens in one transaction:
 *   1. load the products and price the basket from the database (never from the browser)
 *   2. check the payment covers the total
 *   3. take the next receipt number
 *   4. write the sale and its lines
 *   5. take each item off the shelf with the race-safe stock update
 *   6. for an on-account sale, add the total to what the customer owes, within their limit
 * If anything fails, for example the last bag was sold a moment ago, PostgreSQL undoes the
 * whole thing: no sale, no stock taken, no receipt number used.
 */
export async function checkout(
  ctx: Ctx,
  input: CheckoutInput,
): Promise<SaleWithItems> {
  requireRole(ctx, "OWNER", "MANAGER", "CASHIER");
  const data = checkoutInput.parse(input);

  // The same request again (double tap, retry after a timeout): return the sale already made.
  const already = await db.sale.findUnique({
    where: {
      businessId_clientRef: {
        businessId: ctx.businessId,
        clientRef: data.clientRef,
      },
    },
    include: saleInclude,
  });
  if (already) return already;

  // The same product twice in a basket becomes one line.
  const quantities = new Map<string, number>();
  for (const i of data.items)
    quantities.set(
      i.productId,
      (quantities.get(i.productId) ?? 0) + i.quantity,
    );

  try {
    return await db.$transaction(async (tx) => {
      const products = await tx.product.findMany({
        where: {
          id: { in: [...quantities.keys()] },
          businessId: ctx.businessId,
          isActive: true,
        },
      });
      if (products.length !== quantities.size)
        throw new DomainError(
          "A product in the basket no longer exists. Remove it and try again.",
          "not_found",
        );

      const lines = products
        .map((p) => {
          const quantity = quantities.get(p.id)!;
          return {
            product: p,
            quantity,
            lineTotal: p.priceNgwee * quantity,
            lineCost: p.costNgwee * quantity,
          };
        })
        .sort((a, b) => a.product.id.localeCompare(b.product.id)); // a fixed order avoids deadlocks between two tills

      const total = lines.reduce((n, l) => n + l.lineTotal, 0);
      const cost = lines.reduce((n, l) => n + l.lineCost, 0);
      const onAccount =
        data.payment.method === "ON_ACCOUNT" ? data.payment.customerId : null;
      if (onAccount && data.customerId && data.customerId !== onAccount)
        throw new DomainError(
          "The sale names two different customers",
          "invalid",
        );
      const customerId = onAccount ?? data.customerId ?? null;
      const customer = customerId
        ? await tx.customer.findFirst({
            where: { id: customerId, businessId: ctx.businessId },
            select: { phone: true },
          })
        : null;
      if (customerId && !customer)
        throw new DomainError(
          "That customer no longer exists. Choose another or leave it blank.",
          "not_found",
        );

      // Kept change belongs to a customer, so using or keeping it needs one.
      const keep = data.payment.method === "CASH" ? data.payment.keepChangeNgwee : 0;
      const used = data.useChangeNgwee;
      if ((keep > 0 || used > 0) && !customerId)
        throw new DomainError("Choose the customer whose change this is", "invalid");
      if (used > total)
        throw new DomainError(`Use at most ${formatKwacha(total)} of their change on this sale`, "invalid");
      const due = total - used; // what the payment itself must cover
      const payment = paymentFields(data.payment, due);

      const { nextReceiptNo } = await tx.business.update({
        where: { id: ctx.businessId },
        data: { nextReceiptNo: { increment: 1 } },
        select: { nextReceiptNo: true },
      });
      const receiptNo = nextReceiptNo - 1;

      const sale = await tx.sale.create({
        data: {
          businessId: ctx.businessId,
          receiptNo,
          clientRef: data.clientRef,
          cashierId: ctx.userId,
          totalNgwee: total,
          costTotalNgwee: cost,
          customerPhone: data.customerPhone ?? customer?.phone ?? null,
          customerId,
          method: payment.method,
          tenderedNgwee: payment.tenderedNgwee,
          changeNgwee: payment.changeNgwee,
          paymentRef: payment.paymentRef,
          changeUsedNgwee: used,
          changeKeptNgwee: payment.keptNgwee,
          items: {
            create: lines.map((l) => ({
              productId: l.product.id,
              name: l.product.name,
              sku: l.product.sku,
              unit: l.product.unit,
              quantity: l.quantity,
              unitPriceNgwee: l.product.priceNgwee,
              unitCostNgwee: l.product.costNgwee,
              lineTotalNgwee: l.lineTotal,
            })),
          },
        },
      });

      for (const l of lines) {
        await moveStock(tx, ctx, {
          productId: l.product.id,
          type: "SALE",
          quantity: -l.quantity,
          note: `Receipt #${receiptNo}`,
          saleId: sale.id,
        });
      }
      if (onAccount && due > 0) await chargeAccount(tx, ctx, onAccount, due);
      if (used > 0) await moveChange(tx, ctx, customerId!, -used, "USED", sale.id);
      if (payment.keptNgwee > 0) await moveChange(tx, ctx, customerId!, payment.keptNgwee, "KEPT", sale.id);

      return tx.sale.findUniqueOrThrow({
        where: { id: sale.id },
        include: saleInclude,
      });
    });
  } catch (e) {
    // Two copies of the same request raced past the check above: the database let one in.
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002" &&
      String(e.meta?.target).includes("clientRef")
    ) {
      return db.sale.findUniqueOrThrow({
        where: {
          businessId_clientRef: {
            businessId: ctx.businessId,
            clientRef: data.clientRef,
          },
        },
        include: saleInclude,
      });
    }
    throw e;
  }
}

/** Checks the payment covers what's due (the total less any kept change used) and works out the change. */
function paymentFields(
  payment: z.infer<typeof checkoutInput>["payment"],
  due: number,
): {
  method: PaymentMethod;
  tenderedNgwee: number | null;
  changeNgwee: number | null; // handed back now
  keptNgwee: number; // kept for the customer
  paymentRef: string | null;
} {
  if (payment.method === "ON_ACCOUNT")
    return { method: "ON_ACCOUNT", tenderedNgwee: null, changeNgwee: null, keptNgwee: 0, paymentRef: null };
  if (payment.method === "CASH") {
    if (payment.tenderedNgwee < due)
      throw new DomainError("The cash given is less than the total", "invalid");
    const change = payment.tenderedNgwee - due;
    if (payment.keepChangeNgwee > change)
      throw new DomainError(`The change is only ${formatKwacha(change)}, so you can't keep more than that`, "invalid");
    return {
      method: "CASH",
      tenderedNgwee: payment.tenderedNgwee,
      changeNgwee: change - payment.keepChangeNgwee,
      keptNgwee: payment.keepChangeNgwee,
      paymentRef: null,
    };
  }
  return { method: "MOBILE_MONEY", tenderedNgwee: null, changeNgwee: null, keptNgwee: 0, paymentRef: payment.reference.toUpperCase() };
}

/**
 * Cancels a sale: marks it VOIDED and puts every item back on the shelf, together.
 * Owners and managers only; a sale can be voided once.
 */
export async function voidSale(ctx: Ctx, saleId: string, reason: string) {
  requireRole(ctx, "OWNER", "MANAGER");
  const why = reason.trim();
  if (why.length < 3)
    throw new DomainError("Say why the sale is being cancelled", "invalid");

  return db.$transaction(async (tx) => {
    // Only one void can win, even if two managers press it at once.
    const claimed = await tx.sale.updateMany({
      where: { id: saleId, businessId: ctx.businessId, status: "COMPLETED" },
      data: {
        status: "VOIDED",
        voidedAt: new Date(),
        voidedById: ctx.userId,
        voidReason: why,
      },
    });
    if (claimed.count === 0) {
      const sale = await tx.sale.findFirst({
        where: { id: saleId, businessId: ctx.businessId },
        select: { status: true },
      });
      if (!sale) throw new DomainError("Sale not found", "not_found");
      throw new DomainError("This sale has already been cancelled", "conflict");
    }

    const sale = await tx.sale.findUniqueOrThrow({
      where: { id: saleId },
      include: { items: true },
    });
    for (const item of sale.items) {
      await moveStock(tx, ctx, {
        productId: item.productId,
        type: "RETURN",
        quantity: item.quantity,
        note: `Cancelled receipt #${sale.receiptNo}`,
        saleId,
      });
    }
    // An on-account sale comes off what the customer owes (the part that was charged).
    const charged = sale.totalNgwee - sale.changeUsedNgwee;
    if (sale.method === "ON_ACCOUNT" && sale.customerId && charged > 0)
      await uncharge(tx, sale.customerId, charged);
    // Kept change goes back the way it came: change used returns to them, change kept is taken back.
    if (sale.customerId && sale.changeUsedNgwee > 0)
      await moveChange(tx, ctx, sale.customerId, sale.changeUsedNgwee, "SALE_CANCELLED", saleId);
    if (sale.customerId && sale.changeKeptNgwee > 0) {
      await moveChange(tx, ctx, sale.customerId, -sale.changeKeptNgwee, "SALE_CANCELLED", saleId).catch((e) => {
        if (e instanceof DomainError && e.code === "conflict")
          throw new DomainError(
            `The ${formatKwacha(sale.changeKeptNgwee)} change kept from this sale has already been used or collected, so it can't be cancelled here. Settle it with the customer first.`,
            "conflict",
          );
        throw e;
      });
    }
    return tx.sale.findUniqueOrThrow({
      where: { id: saleId },
      include: saleInclude,
    });
  });
}

export async function getSale(ctx: Ctx, id: string) {
  const sale = await db.sale.findFirst({
    where: { id, businessId: ctx.businessId },
    include: saleInclude,
  });
  if (!sale) throw new DomainError("Sale not found", "not_found");
  return sale;
}

/** Sales in [from, to), newest first, with totals for completed sales only. */
export async function salesBetween(ctx: Ctx, from: Date, to: Date) {
  const sales = await db.sale.findMany({
    where: { businessId: ctx.businessId, createdAt: { gte: from, lt: to } },
    orderBy: { createdAt: "desc" },
    include: {
      cashier: { select: { name: true } },
      customer: { select: { name: true } },
      _count: { select: { items: true } },
    },
  });
  const done = sales.filter((s) => s.status === "COMPLETED");
  const sum = (f: (s: (typeof done)[number]) => number) =>
    done.reduce((n, s) => n + f(s), 0);
  // What each sale's payment covered: the total less kept change put towards it.
  const paid = (s: (typeof done)[number]) => s.totalNgwee - s.changeUsedNgwee;
  return {
    sales,
    count: done.length,
    totalNgwee: sum((s) => s.totalNgwee),
    profitNgwee: sum((s) => s.totalNgwee - s.costTotalNgwee),
    // Cash that went into the drawer for sales, including change kept back for customers.
    cashNgwee: sum((s) => (s.method === "CASH" ? paid(s) + s.changeKeptNgwee : 0)),
    mobileMoneyNgwee: sum((s) => (s.method === "MOBILE_MONEY" ? paid(s) : 0)),
    onAccountNgwee: sum((s) => (s.method === "ON_ACCOUNT" ? paid(s) : 0)),
    changeKeptNgwee: sum((s) => s.changeKeptNgwee),
    changeUsedNgwee: sum((s) => s.changeUsedNgwee),
    voided: sales.length - done.length,
  };
}

/** From the 1st of this month in Lusaka to the 1st of next month. */
export function lusakaMonth(now = new Date()) {
  const offset = 2 * 60 * 60 * 1000;
  const local = new Date(now.getTime() + offset);
  const y = local.getUTCFullYear(),
    m = local.getUTCMonth();
  return {
    from: new Date(Date.UTC(y, m, 1) - offset),
    to: new Date(Date.UTC(y, m + 1, 1) - offset),
  };
}

/** Start and end of "today" in Lusaka (UTC+2, no daylight saving). */
export function lusakaDay(now = new Date()) {
  const offset = 2 * 60 * 60 * 1000;
  const local = new Date(now.getTime() + offset);
  const start = new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) -
      offset,
  );
  return { from: start, to: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}
