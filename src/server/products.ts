import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { DomainError, requireRole, type Ctx } from "./errors";
import { moveStock } from "./stock";

export const productInput = z
  .object({
    sku: z
      .string()
      .trim()
      .min(1, "Enter a product code")
      .max(40)
      .regex(/^[A-Za-z0-9._-]+$/, "Use letters, numbers, dots, dashes or underscores")
      .transform((s) => s.toUpperCase()),
    name: z.string().trim().min(2, "Enter the product name").max(120),
    category: z.string().trim().max(60).default("General"),
    unit: z.string().trim().max(20).default("each"),
    costNgwee: z.number().int().min(0, "Cost can't be negative").max(100_000_000),
    priceNgwee: z.number().int().min(0, "Price can't be negative").max(100_000_000),
    reorderLevel: z.number().int().min(0).max(1_000_000).default(0),
  })
  .refine((p) => p.priceNgwee >= p.costNgwee || p.priceNgwee === 0, {
    message: "The selling price is below the cost: you'd lose money on every sale",
    path: ["priceNgwee"],
  });

export type ProductInput = z.input<typeof productInput>;

/** Adds a product and its opening stock together, or neither. */
export async function createProduct(ctx: Ctx, input: ProductInput & { openingStock?: number }) {
  requireRole(ctx, "OWNER", "MANAGER");
  const data = productInput.parse(input);
  const opening = input.openingStock ?? 0;
  if (!Number.isInteger(opening) || opening < 0) throw new DomainError("Opening stock must be a whole number, zero or more", "invalid");

  try {
    return await db.$transaction(async (tx) => {
      const product = await tx.product.create({ data: { ...data, businessId: ctx.businessId } });
      if (opening > 0) await moveStock(tx, ctx, { productId: product.id, type: "OPENING", quantity: opening, costNgwee: data.costNgwee });
      return tx.product.findUniqueOrThrow({ where: { id: product.id } });
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new DomainError(`Another product already uses the code ${data.sku}`, "conflict");
    }
    throw e;
  }
}

/** Price, cost, name and reorder level. Stock is never edited directly: use a movement or a count. */
export async function updateProduct(ctx: Ctx, id: string, input: ProductInput) {
  requireRole(ctx, "OWNER", "MANAGER");
  const data = productInput.parse(input);
  const existing = await db.product.findFirst({ where: { id, businessId: ctx.businessId } });
  if (!existing) throw new DomainError("Product not found", "not_found");
  try {
    return await db.product.update({ where: { id }, data });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new DomainError(`Another product already uses the code ${data.sku}`, "conflict");
    }
    throw e;
  }
}

export async function getProduct(ctx: Ctx, id: string) {
  const product = await db.product.findFirst({ where: { id, businessId: ctx.businessId } });
  if (!product) throw new DomainError("Product not found", "not_found");
  return product;
}

export async function listProducts(ctx: Ctx, opts: { search?: string; lowStockOnly?: boolean } = {}) {
  const search = opts.search?.trim();
  const products = await db.product.findMany({
    where: {
      businessId: ctx.businessId,
      isActive: true,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { sku: { contains: search, mode: "insensitive" } },
              { category: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ name: "asc" }],
  });
  return opts.lowStockOnly ? products.filter(isLowStock) : products;
}

export const isLowStock = (p: { stockQty: number; reorderLevel: number }) => p.stockQty <= p.reorderLevel;

/** Figures for the dashboard. Stock value uses cost, which is what the shop has tied up. */
export async function inventorySummary(ctx: Ctx) {
  const products = await db.product.findMany({
    where: { businessId: ctx.businessId, isActive: true },
    select: { id: true, name: true, sku: true, unit: true, stockQty: true, reorderLevel: true, costNgwee: true, priceNgwee: true },
  });
  const low = products.filter(isLowStock).sort((a, b) => a.stockQty - b.stockQty);
  return {
    productCount: products.length,
    unitsInStock: products.reduce((n, p) => n + p.stockQty, 0),
    stockValueAtCostNgwee: products.reduce((n, p) => n + p.stockQty * p.costNgwee, 0),
    stockValueAtPriceNgwee: products.reduce((n, p) => n + p.stockQty * p.priceNgwee, 0),
    outOfStock: products.filter((p) => p.stockQty === 0).length,
    lowStock: low,
  };
}
