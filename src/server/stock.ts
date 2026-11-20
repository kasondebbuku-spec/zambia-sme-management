import type { MovementType } from "@prisma/client";
import { db, type Tx } from "./db";
import { DomainError, InsufficientStockError, requireRole, type Ctx } from "./errors";

// Which way each kind of movement may go.
const DIRECTION: Record<MovementType, "in" | "out" | "either"> = {
  OPENING: "in",
  RESTOCK: "in",
  RETURN: "in",
  SALE: "out",
  DAMAGE: "out",
  ADJUSTMENT: "either",
};

export type MovementInput = {
  productId: string;
  type: MovementType;
  quantity: number; // signed: positive adds stock, negative removes it
  note?: string | null;
  costNgwee?: number | null;
};

/**
 * Changes a product's stock and records the movement, inside the caller's transaction.
 *
 * Removing stock is one conditional UPDATE: "subtract 3 where at least 3 are left". Two
 * cashiers selling the last item at the same moment can't both succeed, because PostgreSQL
 * locks the row for the first update and re-checks the condition for the second. Stock can
 * never go below zero, and no read-then-write race is possible.
 */
export async function moveStock(tx: Tx, ctx: Ctx, m: MovementInput) {
  if (!Number.isInteger(m.quantity) || m.quantity === 0) throw new DomainError("Quantity must be a whole number other than zero", "invalid");
  const dir = DIRECTION[m.type];
  if ((dir === "in" && m.quantity < 0) || (dir === "out" && m.quantity > 0)) {
    throw new DomainError(`A ${m.type.toLowerCase()} must ${dir === "in" ? "add" : "remove"} stock`, "invalid");
  }

  const where = { id: m.productId, businessId: ctx.businessId };
  const updated = await tx.product.updateMany({
    where: m.quantity < 0 ? { ...where, stockQty: { gte: -m.quantity } } : where,
    data: { stockQty: { increment: m.quantity } },
  });

  if (updated.count === 0) {
    const product = await tx.product.findFirst({ where, select: { name: true, stockQty: true } });
    if (!product) throw new DomainError("Product not found", "not_found");
    throw new InsufficientStockError(product.name, product.stockQty, -m.quantity);
  }

  // This transaction holds the row lock from the update, so this reads our own result.
  const { stockQty } = await tx.product.findUniqueOrThrow({ where: { id: m.productId }, select: { stockQty: true } });
  return tx.stockMovement.create({
    data: {
      businessId: ctx.businessId,
      productId: m.productId,
      type: m.type,
      quantity: m.quantity,
      balanceAfter: stockQty,
      costNgwee: m.costNgwee ?? null,
      note: m.note?.trim() || null,
      userId: ctx.userId,
    },
  });
}

/** Stock received, damaged or returned, recorded by a manager or owner. */
export async function recordMovement(ctx: Ctx, m: MovementInput) {
  requireRole(ctx, "OWNER", "MANAGER");
  if (m.type === "SALE" || m.type === "OPENING") throw new DomainError("Sales and opening stock are recorded elsewhere", "invalid");
  return db.$transaction((tx) => moveStock(tx, ctx, m));
}

/**
 * After a physical count: sets stock to what's actually on the shelf and records the
 * difference as an ADJUSTMENT. The row is locked first (SELECT ... FOR UPDATE) so a sale
 * that happens mid-count can't be silently overwritten.
 */
export async function recordCount(ctx: Ctx, productId: string, counted: number, note?: string) {
  requireRole(ctx, "OWNER", "MANAGER");
  if (!Number.isInteger(counted) || counted < 0) throw new DomainError("The count must be a whole number, zero or more", "invalid");

  return db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ stockQty: number }[]>`
      SELECT "stockQty" FROM "Product" WHERE id = ${productId} AND "businessId" = ${ctx.businessId} FOR UPDATE`;
    if (!rows[0]) throw new DomainError("Product not found", "not_found");
    const difference = counted - rows[0].stockQty;
    if (difference === 0) return null; // the count matches: nothing to record
    return moveStock(tx, ctx, { productId, type: "ADJUSTMENT", quantity: difference, note: note ?? `Counted ${counted}` });
  });
}

export async function movementHistory(ctx: Ctx, productId: string, take = 50) {
  return db.stockMovement.findMany({
    where: { productId, businessId: ctx.businessId },
    orderBy: { createdAt: "desc" },
    take,
    include: { user: { select: { name: true } } },
  });
}
