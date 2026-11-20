import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { DomainError, requireRole, type Ctx } from "./errors";
import { moveStock } from "./stock";

// ---------- Suppliers ----------

export const supplierInput = z.object({
  name: z.string().trim().min(2, "Enter the supplier's name").max(120),
  phone: z.string().trim().max(20).optional().transform((s) => s || null),
  notes: z.string().trim().max(500).optional().transform((s) => s || null),
});

export async function createSupplier(ctx: Ctx, input: z.input<typeof supplierInput>) {
  requireRole(ctx, "OWNER", "MANAGER");
  const data = supplierInput.parse(input);
  try {
    return await db.supplier.create({ data: { ...data, businessId: ctx.businessId } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new DomainError(`You already have a supplier called ${data.name}`, "conflict");
    throw e;
  }
}

export function listSuppliers(ctx: Ctx) {
  return db.supplier.findMany({
    where: { businessId: ctx.businessId },
    orderBy: { name: "asc" },
    include: { _count: { select: { purchases: true } } },
  });
}

// ---------- Average cost ----------

/**
 * The cost of stock after a delivery, as a weighted average of what's on the shelf and
 * what just arrived. 10 bags at K230 plus 20 at K245 is K240 each. Using the latest price
 * alone would overstate the cost of the older, cheaper bags and understate profit.
 * Rounded to the nearest ngwee.
 */
export function weightedAverageCost(onHand: number, currentCostNgwee: number, received: number, receivedCostNgwee: number): number {
  if (received <= 0) return currentCostNgwee;
  if (onHand <= 0) return receivedCostNgwee; // nothing on the shelf to average with
  return Math.round((onHand * currentCostNgwee + received * receivedCostNgwee) / (onHand + received));
}

// ---------- Purchase orders ----------

export const purchaseInput = z.object({
  supplierId: z.string().min(1, "Choose a supplier"),
  note: z.string().trim().max(500).optional().transform((s) => s || null),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().int().positive("Quantities must be whole numbers above zero").max(1_000_000),
        unitCostNgwee: z.number().int().min(0).max(100_000_000),
      }),
    )
    .min(1, "Add at least one product")
    .max(200)
    .refine((items) => new Set(items.map((i) => i.productId)).size === items.length, "Each product can appear only once"),
});

const purchaseInclude = {
  supplier: true,
  items: { include: { product: { select: { name: true, sku: true, unit: true, stockQty: true, costNgwee: true, priceNgwee: true } } }, orderBy: { product: { name: "asc" } } },
  createdBy: { select: { name: true } },
  receivedBy: { select: { name: true } },
} satisfies Prisma.PurchaseInclude;

export type PurchaseWithItems = Prisma.PurchaseGetPayload<{ include: typeof purchaseInclude }>;

export async function createPurchase(ctx: Ctx, input: z.input<typeof purchaseInput>) {
  requireRole(ctx, "OWNER", "MANAGER");
  const data = purchaseInput.parse(input);

  return db.$transaction(async (tx) => {
    const supplier = await tx.supplier.findFirst({ where: { id: data.supplierId, businessId: ctx.businessId } });
    if (!supplier) throw new DomainError("Supplier not found", "not_found");
    const products = await tx.product.count({ where: { id: { in: data.items.map((i) => i.productId) }, businessId: ctx.businessId } });
    if (products !== data.items.length) throw new DomainError("A product on the order wasn't found", "not_found");

    const { nextPurchaseNo } = await tx.business.update({ where: { id: ctx.businessId }, data: { nextPurchaseNo: { increment: 1 } }, select: { nextPurchaseNo: true } });
    return tx.purchase.create({
      data: {
        businessId: ctx.businessId,
        number: nextPurchaseNo - 1,
        supplierId: supplier.id,
        note: data.note,
        createdById: ctx.userId,
        totalNgwee: data.items.reduce((n, i) => n + i.quantity * i.unitCostNgwee, 0),
        items: { create: data.items.map((i) => ({ productId: i.productId, orderedQty: i.quantity, orderedCostNgwee: i.unitCostNgwee })) },
      },
      include: purchaseInclude,
    });
  });
}

export const receiveInput = z
  .array(
    z.object({
      productId: z.string().min(1),
      quantity: z.number().int().min(0, "Can't receive a negative amount").max(1_000_000), // 0 = didn't arrive
      unitCostNgwee: z.number().int().min(0).max(100_000_000),
    }),
  )
  .optional();

/**
 * Records a delivery. Pass what actually arrived and what it actually cost, or nothing to
 * accept the order exactly as placed. In one transaction:
 *   - the order is claimed (ORDERED → RECEIVED), so it can't be received twice
 *   - each product's row is locked, its cost becomes the weighted average, and the stock
 *     is added through the ledger as a RESTOCK linked to this order
 */
export async function receivePurchase(ctx: Ctx, purchaseId: string, lines?: z.input<typeof receiveInput>) {
  requireRole(ctx, "OWNER", "MANAGER");
  const received = receiveInput.parse(lines);

  return db.$transaction(async (tx) => {
    const claimed = await tx.purchase.updateMany({
      where: { id: purchaseId, businessId: ctx.businessId, status: "ORDERED" },
      data: { status: "RECEIVED", receivedAt: new Date(), receivedById: ctx.userId },
    });
    if (claimed.count === 0) {
      const p = await tx.purchase.findFirst({ where: { id: purchaseId, businessId: ctx.businessId }, select: { status: true } });
      if (!p) throw new DomainError("Purchase order not found", "not_found");
      throw new DomainError(p.status === "RECEIVED" ? "This order has already been received" : "This order was cancelled", "conflict");
    }

    const purchase = await tx.purchase.findUniqueOrThrow({ where: { id: purchaseId }, include: { items: true, supplier: true } });
    const actual = new Map((received ?? []).map((r) => [r.productId, r]));
    if (received && received.some((r) => !purchase.items.find((i) => i.productId === r.productId))) {
      throw new DomainError("A received product isn't on this order", "invalid");
    }

    let total = 0;
    for (const item of purchase.items) {
      const got = actual.get(item.productId);
      const qty = received ? (got?.quantity ?? 0) : item.orderedQty;
      const unitCost = got?.unitCostNgwee ?? item.orderedCostNgwee;
      await tx.purchaseItem.update({ where: { id: item.id }, data: { receivedQty: qty, receivedCostNgwee: unitCost } });
      if (qty === 0) continue;
      total += qty * unitCost;

      // Lock the product so a sale can't change the quantity between reading it and averaging.
      const [row] = await tx.$queryRaw<{ stockQty: number; costNgwee: number }[]>`
        SELECT "stockQty", "costNgwee" FROM "Product" WHERE id = ${item.productId} FOR UPDATE`;
      await tx.product.update({ where: { id: item.productId }, data: { costNgwee: weightedAverageCost(row!.stockQty, row!.costNgwee, qty, unitCost) } });
      await moveStock(tx, ctx, {
        productId: item.productId,
        type: "RESTOCK",
        quantity: qty,
        costNgwee: unitCost,
        note: `PO-${purchase.number} from ${purchase.supplier.name}`,
        purchaseId,
      });
    }

    await tx.purchase.update({ where: { id: purchaseId }, data: { totalNgwee: total } });
    return tx.purchase.findUniqueOrThrow({ where: { id: purchaseId }, include: purchaseInclude });
  });
}

export async function cancelPurchase(ctx: Ctx, purchaseId: string) {
  requireRole(ctx, "OWNER", "MANAGER");
  const res = await db.purchase.updateMany({ where: { id: purchaseId, businessId: ctx.businessId, status: "ORDERED" }, data: { status: "CANCELLED" } });
  if (res.count === 0) {
    const p = await db.purchase.findFirst({ where: { id: purchaseId, businessId: ctx.businessId } });
    if (!p) throw new DomainError("Purchase order not found", "not_found");
    throw new DomainError("Only orders that haven't arrived can be cancelled", "conflict");
  }
}

export async function getPurchase(ctx: Ctx, id: string) {
  const p = await db.purchase.findFirst({ where: { id, businessId: ctx.businessId }, include: purchaseInclude });
  if (!p) throw new DomainError("Purchase order not found", "not_found");
  return p;
}

export function listPurchases(ctx: Ctx) {
  return db.purchase.findMany({
    where: { businessId: ctx.businessId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { supplier: { select: { name: true } }, _count: { select: { items: true } } },
  });
}
