import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../src/server/db";
import { createProduct } from "../src/server/products";
import { cancelPurchase, createPurchase, createSupplier, receivePurchase, weightedAverageCost } from "../src/server/purchases";
import { checkout } from "../src/server/sales";
import { hasTestDb, makeShop, resetDb, sugar } from "./helpers";

describe("weightedAverageCost", () => {
  it("averages what's on the shelf with what arrived", () => {
    expect(weightedAverageCost(10, 23000, 20, 24500)).toBe(24000); // 10 at K230 + 20 at K245
  });

  it("uses the new price when the shelf was empty", () => {
    expect(weightedAverageCost(0, 23000, 20, 24500)).toBe(24500);
  });

  it("keeps the old cost when nothing arrived", () => {
    expect(weightedAverageCost(10, 23000, 0, 99999)).toBe(23000);
  });

  it("rounds to the nearest ngwee", () => {
    expect(weightedAverageCost(1, 100, 2, 101)).toBe(101); // 100.67
    expect(weightedAverageCost(2, 100, 1, 101)).toBe(100); // 100.33
  });
});

type Shop = Awaited<ReturnType<typeof makeShop>>;

describe.skipIf(!hasTestDb)("purchasing", () => {
  let shop: Shop;
  let supplierId: string, sugarId: string, oilId: string;

  beforeEach(async () => {
    await resetDb();
    shop = await makeShop();
    supplierId = (await createSupplier(shop.manager, { name: "Kalulushi Wholesalers", phone: "0961234567" })).id;
    sugarId = (await createProduct(shop.owner, { ...sugar, openingStock: 10 })).id; // cost K45.00
    oilId = (await createProduct(shop.owner, { ...sugar, sku: "OIL-2", name: "Cooking oil 2 L", costNgwee: 9000, priceNgwee: 10800 })).id;
  });

  const order = () =>
    createPurchase(shop.manager, {
      supplierId,
      note: "Monthly order",
      items: [
        { productId: sugarId, quantity: 20, unitCostNgwee: 4800 },
        { productId: oilId, quantity: 12, unitCostNgwee: 9200 },
      ],
    });

  it("numbers orders per shop and totals them", async () => {
    const first = await order();
    const second = await order();
    expect([first.number, second.number]).toEqual([1, 2]);
    expect(first).toMatchObject({ status: "ORDERED", totalNgwee: 20 * 4800 + 12 * 9200, createdById: shop.manager.userId });
  });

  it("doesn't change stock until the delivery arrives", async () => {
    await order();
    expect((await db.product.findUniqueOrThrow({ where: { id: sugarId } })).stockQty).toBe(10);
  });

  it("receives the order as placed: stock up, average cost, ledger entries linked to the order", async () => {
    const po = await order();
    const done = await receivePurchase(shop.manager, po.id);

    expect(done).toMatchObject({ status: "RECEIVED", receivedById: shop.manager.userId, totalNgwee: 20 * 4800 + 12 * 9200 });
    const s = await db.product.findUniqueOrThrow({ where: { id: sugarId } });
    expect(s.stockQty).toBe(30);
    expect(s.costNgwee).toBe(Math.round((10 * 4500 + 20 * 4800) / 30)); // 4700
    const o = await db.product.findUniqueOrThrow({ where: { id: oilId } });
    expect(o).toMatchObject({ stockQty: 12, costNgwee: 9200 }); // shelf was empty: new price

    const restocks = await db.stockMovement.findMany({ where: { purchaseId: po.id }, orderBy: { quantity: "asc" } });
    expect(restocks.map((m) => [m.type, m.quantity, m.costNgwee, m.note])).toEqual([
      ["RESTOCK", 12, 9200, "PO-1 from Kalulushi Wholesalers"],
      ["RESTOCK", 20, 4800, "PO-1 from Kalulushi Wholesalers"],
    ]);
  });

  it("records a short delivery at the price actually charged", async () => {
    const po = await order();
    const done = await receivePurchase(shop.manager, po.id, [
      { productId: sugarId, quantity: 15, unitCostNgwee: 4900 }, // 5 short, and dearer
      { productId: oilId, quantity: 0, unitCostNgwee: 9200 }, // didn't come
    ]);

    expect(done.totalNgwee).toBe(15 * 4900);
    expect(done.items.find((i) => i.productId === sugarId)).toMatchObject({ orderedQty: 20, receivedQty: 15, receivedCostNgwee: 4900 });
    expect(done.items.find((i) => i.productId === oilId)).toMatchObject({ receivedQty: 0 });
    expect((await db.product.findUniqueOrThrow({ where: { id: sugarId } })).stockQty).toBe(25);
    expect((await db.product.findUniqueOrThrow({ where: { id: oilId } })).stockQty).toBe(0);
    expect(await db.stockMovement.count({ where: { purchaseId: po.id } })).toBe(1);
  });

  it("can't be received twice, even by two managers at once", async () => {
    const po = await order();
    const results = await Promise.allSettled([receivePurchase(shop.manager, po.id), receivePurchase(shop.owner, po.id)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await db.product.findUniqueOrThrow({ where: { id: sugarId } })).stockQty).toBe(30); // added once
    await expect(receivePurchase(shop.owner, po.id)).rejects.toThrow("already been received");
  });

  it("averages correctly when a sale happens during the delivery", async () => {
    const po = await order();
    await Promise.all([
      receivePurchase(shop.manager, po.id),
      checkout(shop.cashier, { clientRef: randomUUID(), items: [{ productId: sugarId, quantity: 4 }], payment: { method: "CASH", tenderedNgwee: 22000 } }),
    ]);
    const s = await db.product.findUniqueOrThrow({ where: { id: sugarId } });
    expect(s.stockQty).toBe(26);
    // Whichever ran first, the cost is a valid average: 10 or 6 packets at K45 with 20 at K48.
    expect([Math.round((10 * 4500 + 20 * 4800) / 30), Math.round((6 * 4500 + 20 * 4800) / 26)]).toContain(s.costNgwee);
  });

  it("cancels orders that haven't arrived, but not received ones", async () => {
    const a = await order();
    await cancelPurchase(shop.manager, a.id);
    await expect(receivePurchase(shop.manager, a.id)).rejects.toThrow("cancelled");

    const b = await order();
    await receivePurchase(shop.manager, b.id);
    await expect(cancelPurchase(shop.manager, b.id)).rejects.toThrow("haven't arrived");
  });

  it("refuses products that aren't on the order", async () => {
    const po = await order();
    const other = (await createProduct(shop.owner, { ...sugar, sku: "SALT" })).id;
    await expect(receivePurchase(shop.manager, po.id, [{ productId: other, quantity: 5, unitCostNgwee: 100 }])).rejects.toThrow("isn't on this order");
    expect((await db.purchase.findUniqueOrThrow({ where: { id: po.id } })).status).toBe("ORDERED"); // nothing changed
  });

  it("validates orders", async () => {
    await expect(createPurchase(shop.manager, { supplierId, items: [] })).rejects.toThrow(/at least one/);
    await expect(createPurchase(shop.manager, { supplierId, items: [{ productId: sugarId, quantity: 0, unitCostNgwee: 100 }] })).rejects.toThrow(/above zero/);
    await expect(
      createPurchase(shop.manager, {
        supplierId,
        items: [
          { productId: sugarId, quantity: 1, unitCostNgwee: 100 },
          { productId: sugarId, quantity: 2, unitCostNgwee: 100 },
        ],
      }),
    ).rejects.toThrow(/only once/);
  });

  it("is for owners and managers, and stays inside the shop", async () => {
    await expect(createSupplier(shop.cashier, { name: "X Ltd" })).rejects.toMatchObject({ code: "forbidden" });
    await expect(createPurchase(shop.cashier, { supplierId, items: [{ productId: sugarId, quantity: 1, unitCostNgwee: 1 }] })).rejects.toMatchObject({ code: "forbidden" });

    const other = await makeShop("Other Shop");
    await expect(createPurchase(other.manager, { supplierId, items: [{ productId: sugarId, quantity: 1, unitCostNgwee: 1 }] })).rejects.toThrow("Supplier not found");
    const po = await order();
    await expect(receivePurchase(other.manager, po.id)).rejects.toThrow("not found");
  });

  it("refuses duplicate supplier names in one shop", async () => {
    await expect(createSupplier(shop.manager, { name: "Kalulushi Wholesalers" })).rejects.toThrow(/already have a supplier/);
  });
});
