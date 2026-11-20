import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../src/server/db";
import { DomainError, InsufficientStockError } from "../src/server/errors";
import { createProduct, inventorySummary, listProducts, updateProduct } from "../src/server/products";
import { moveStock, recordCount, recordMovement } from "../src/server/stock";
import { hasTestDb, makeShop, resetDb, sugar } from "./helpers";

type Shop = Awaited<ReturnType<typeof makeShop>>;

/** The ledger must always explain the stock: the sum of movements equals stockQty. */
async function ledgerMatches(productId: string) {
  const [product, sum] = await Promise.all([
    db.product.findUniqueOrThrow({ where: { id: productId } }),
    db.stockMovement.aggregate({ where: { productId }, _sum: { quantity: true } }),
  ]);
  return product.stockQty === (sum._sum.quantity ?? 0);
}

const sell = (shop: Shop, productId: string, qty: number) =>
  db.$transaction((tx) => moveStock(tx, shop.cashier, { productId, type: "SALE", quantity: -qty }));

describe.skipIf(!hasTestDb)("stock", () => {
  let shop: Shop;
  beforeEach(async () => {
    await resetDb();
    shop = await makeShop();
  });

  describe("adding products", () => {
    it("records opening stock as the first movement", async () => {
      const p = await createProduct(shop.manager, { ...sugar, openingStock: 20 });
      expect(p.stockQty).toBe(20);
      const [m] = await db.stockMovement.findMany({ where: { productId: p.id } });
      expect(m).toMatchObject({ type: "OPENING", quantity: 20, balanceAfter: 20, costNgwee: 4500, userId: shop.manager.userId });
    });

    it("refuses a duplicate product code in the same shop, but allows it in another", async () => {
      await createProduct(shop.owner, sugar);
      await expect(createProduct(shop.owner, { ...sugar, sku: "sug-2" })).rejects.toThrow(/already uses the code SUG-2/);

      const other = await makeShop("Other Shop");
      await expect(createProduct(other.owner, sugar)).resolves.toBeDefined();
    });

    it("refuses a selling price below cost", async () => {
      await expect(createProduct(shop.owner, { ...sugar, priceNgwee: 4000 })).rejects.toThrow(/below the cost/);
    });

    it("is for owners and managers, not cashiers", async () => {
      await expect(createProduct(shop.cashier, sugar)).rejects.toMatchObject({ code: "forbidden" });
    });

    it("never edits stock directly when details change", async () => {
      const p = await createProduct(shop.owner, { ...sugar, openingStock: 7 });
      const updated = await updateProduct(shop.owner, p.id, { ...sugar, priceNgwee: 6000 });
      expect(updated).toMatchObject({ priceNgwee: 6000, stockQty: 7 });
    });
  });

  describe("moving stock", () => {
    let id: string;
    beforeEach(async () => {
      id = (await createProduct(shop.owner, { ...sugar, openingStock: 10 })).id;
    });

    it("records each movement with the balance after it", async () => {
      await recordMovement(shop.manager, { productId: id, type: "RESTOCK", quantity: 24, note: "Invoice 112" });
      await sell(shop, id, 3);
      await recordMovement(shop.manager, { productId: id, type: "DAMAGE", quantity: -1, note: "Torn packet" });

      const history = await db.stockMovement.findMany({ where: { productId: id }, orderBy: { createdAt: "asc" } });
      expect(history.map((h) => [h.type, h.quantity, h.balanceAfter])).toEqual([
        ["OPENING", 10, 10],
        ["RESTOCK", 24, 34],
        ["SALE", -3, 31],
        ["DAMAGE", -1, 30],
      ]);
      expect(await ledgerMatches(id)).toBe(true);
    });

    it("refuses to sell more than is in stock, and says how many are left", async () => {
      const err = await sell(shop, id, 11).catch((e) => e);
      expect(err).toBeInstanceOf(InsufficientStockError);
      expect(err).toMatchObject({ available: 10, requested: 11 });
      expect(err.message).toBe("Only 10 White sugar 2 kg in stock, but 11 needed");
      expect((await db.product.findUniqueOrThrow({ where: { id } })).stockQty).toBe(10);
    });

    it("never lets simultaneous sales take stock below zero", async () => {
      await recordCount(shop.owner, id, 5);
      // Ten cashiers try to sell the last 5 packets at the same instant.
      const results = await Promise.allSettled(Array.from({ length: 10 }, () => sell(shop, id, 1)));

      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(5);
      const failures = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
      expect(failures).toHaveLength(5);
      for (const f of failures) expect(f.reason).toBeInstanceOf(InsufficientStockError);

      expect((await db.product.findUniqueOrThrow({ where: { id } })).stockQty).toBe(0);
      expect(await ledgerMatches(id)).toBe(true);
    });

    it("checks that each kind of movement goes the right way", async () => {
      await expect(recordMovement(shop.manager, { productId: id, type: "RESTOCK", quantity: -5 })).rejects.toThrow(/must add stock/);
      await expect(recordMovement(shop.manager, { productId: id, type: "DAMAGE", quantity: 2 })).rejects.toThrow(/must remove stock/);
      await expect(recordMovement(shop.manager, { productId: id, type: "RESTOCK", quantity: 1.5 })).rejects.toThrow(/whole number/);
      await expect(recordMovement(shop.manager, { productId: id, type: "RESTOCK", quantity: 0 })).rejects.toThrow(/whole number/);
    });

    it("keeps sales and opening stock out of manual movements", async () => {
      await expect(recordMovement(shop.manager, { productId: id, type: "SALE", quantity: -1 })).rejects.toBeInstanceOf(DomainError);
      await expect(recordMovement(shop.manager, { productId: id, type: "OPENING", quantity: 1 })).rejects.toBeInstanceOf(DomainError);
    });

    it("doesn't let cashiers adjust stock", async () => {
      await expect(recordMovement(shop.cashier, { productId: id, type: "RESTOCK", quantity: 5 })).rejects.toMatchObject({ code: "forbidden" });
      await expect(recordCount(shop.cashier, id, 3)).rejects.toMatchObject({ code: "forbidden" });
    });

    it("can't touch another shop's products", async () => {
      const other = await makeShop("Other Shop");
      await expect(recordMovement(other.owner, { productId: id, type: "RESTOCK", quantity: 5 })).rejects.toThrow("Product not found");
      await expect(recordCount(other.owner, id, 0)).rejects.toThrow("Product not found");
      expect(await listProducts(other.owner)).toEqual([]);
    });
  });

  describe("physical counts", () => {
    let id: string;
    beforeEach(async () => {
      id = (await createProduct(shop.owner, { ...sugar, openingStock: 12 })).id;
    });

    it("records the difference as an adjustment", async () => {
      const m = await recordCount(shop.manager, id, 9, "Month-end count");
      expect(m).toMatchObject({ type: "ADJUSTMENT", quantity: -3, balanceAfter: 9, note: "Month-end count" });
      expect(await ledgerMatches(id)).toBe(true);
    });

    it("can find extra stock too", async () => {
      expect(await recordCount(shop.manager, id, 15)).toMatchObject({ quantity: 3, balanceAfter: 15 });
    });

    it("records nothing when the count matches", async () => {
      expect(await recordCount(shop.manager, id, 12)).toBeNull();
      expect(await db.stockMovement.count({ where: { productId: id } })).toBe(1);
    });

    it("doesn't lose a sale that happens during the count", async () => {
      // A sale and a count race. Whatever order they run in, the ledger still matches.
      await Promise.all([sell(shop, id, 2), recordCount(shop.manager, id, 8)]);
      expect(await ledgerMatches(id)).toBe(true);
    });

    it("rejects negative or fractional counts", async () => {
      await expect(recordCount(shop.manager, id, -1)).rejects.toThrow(/zero or more/);
      await expect(recordCount(shop.manager, id, 2.5)).rejects.toThrow(/whole number/);
    });
  });

  describe("dashboard figures", () => {
    it("adds up stock value and lists what's running low, emptiest first", async () => {
      await createProduct(shop.owner, { ...sugar, openingStock: 10 }); // 10 × K45 cost, × K55 price; not low (reorder 5)
      await createProduct(shop.owner, { ...sugar, sku: "OIL-2", name: "Cooking oil 2 L", costNgwee: 9000, priceNgwee: 11000, reorderLevel: 6, openingStock: 4 });
      await createProduct(shop.owner, { ...sugar, sku: "SALT", name: "Salt 1 kg", costNgwee: 800, priceNgwee: 1200, reorderLevel: 3 });

      const s = await inventorySummary(shop.owner);
      expect(s).toMatchObject({ productCount: 3, unitsInStock: 14, outOfStock: 1, stockValueAtCostNgwee: 10 * 4500 + 4 * 9000, stockValueAtPriceNgwee: 10 * 5500 + 4 * 11000 });
      expect(s.lowStock.map((p) => p.sku)).toEqual(["SALT", "OIL-2"]);
    });
  });
});
