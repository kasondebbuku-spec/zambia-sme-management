import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../src/server/db";
import { InsufficientStockError } from "../src/server/errors";
import { createProduct } from "../src/server/products";
import { checkout, lusakaDay, salesBetween, voidSale, type CheckoutInput } from "../src/server/sales";
import { hasTestDb, makeShop, resetDb, sugar } from "./helpers";

type Shop = Awaited<ReturnType<typeof makeShop>>;

const stockOf = async (id: string) => (await db.product.findUniqueOrThrow({ where: { id } })).stockQty;

async function ledgerMatches(productId: string) {
  const [p, sum] = await Promise.all([
    db.product.findUniqueOrThrow({ where: { id: productId } }),
    db.stockMovement.aggregate({ where: { productId }, _sum: { quantity: true } }),
  ]);
  return p.stockQty === (sum._sum.quantity ?? 0);
}

describe.skipIf(!hasTestDb)("sales", () => {
  let shop: Shop;
  let sugarId: string, oilId: string;

  const cash = (items: { productId: string; quantity: number }[], tenderedNgwee: number, clientRef = randomUUID()): CheckoutInput => ({
    clientRef,
    items,
    payment: { method: "CASH", tenderedNgwee },
  });

  beforeEach(async () => {
    await resetDb();
    shop = await makeShop();
    sugarId = (await createProduct(shop.owner, { ...sugar, openingStock: 10 })).id; // K55.00, cost K45.00
    oilId = (await createProduct(shop.owner, { ...sugar, sku: "OIL-2", name: "Cooking oil 2 L", costNgwee: 9000, priceNgwee: 10800, openingStock: 3 })).id;
  });

  describe("checkout", () => {
    it("records the sale, its lines, the payment and the change, and takes stock off the shelf", async () => {
      const sale = await checkout(shop.cashier, cash([{ productId: sugarId, quantity: 2 }, { productId: oilId, quantity: 1 }], 25000));

      expect(sale).toMatchObject({ receiptNo: 1, status: "COMPLETED", method: "CASH", totalNgwee: 2 * 5500 + 10800, costTotalNgwee: 2 * 4500 + 9000, tenderedNgwee: 25000, changeNgwee: 25000 - 21800, cashierId: shop.cashier.userId });
      expect(sale.items.map((i) => [i.sku, i.quantity, i.unitPriceNgwee, i.lineTotalNgwee])).toEqual([
        ["OIL-2", 1, 10800, 10800],
        ["SUG-2", 2, 5500, 11000],
      ]);
      expect(await stockOf(sugarId)).toBe(8);
      expect(await stockOf(oilId)).toBe(2);

      const movements = await db.stockMovement.findMany({ where: { saleId: sale.id } });
      expect(movements.map((m) => [m.type, m.quantity, m.note]).sort()).toEqual([
        ["SALE", -1, "Receipt #1"],
        ["SALE", -2, "Receipt #1"],
      ]);
    });

    it("prices the basket from the database, whatever the till sends", async () => {
      // An edited request carrying its own price is simply ignored: only id and quantity are read.
      const tampered = { ...cash([{ productId: sugarId, quantity: 1 }], 5500), items: [{ productId: sugarId, quantity: 1, priceNgwee: 1 }] };
      const sale = await checkout(shop.cashier, tampered as CheckoutInput);
      expect(sale.totalNgwee).toBe(5500);
    });

    it("merges the same product added twice into one line", async () => {
      const sale = await checkout(shop.cashier, cash([{ productId: sugarId, quantity: 1 }, { productId: sugarId, quantity: 2 }], 20000));
      expect(sale.items).toHaveLength(1);
      expect(sale.items[0]).toMatchObject({ quantity: 3, lineTotalNgwee: 16500 });
    });

    it("refuses cash that doesn't cover the total, and changes nothing", async () => {
      await expect(checkout(shop.cashier, cash([{ productId: sugarId, quantity: 1 }], 5000))).rejects.toThrow("The cash given is less than the total");
      expect(await stockOf(sugarId)).toBe(10);
      expect(await db.sale.count()).toBe(0);
    });

    it("records mobile-money payments with their transaction ID", async () => {
      const sale = await checkout(shop.cashier, {
        clientRef: randomUUID(),
        items: [{ productId: oilId, quantity: 1 }],
        payment: { method: "MOBILE_MONEY", reference: "mp261120.1532.a71x" },
        customerPhone: "0971234567",
      });
      expect(sale).toMatchObject({ method: "MOBILE_MONEY", paymentRef: "MP261120.1532.A71X", tenderedNgwee: null, changeNgwee: null, customerPhone: "0971234567" });
      await expect(checkout(shop.cashier, { clientRef: randomUUID(), items: [{ productId: oilId, quantity: 1 }], payment: { method: "MOBILE_MONEY", reference: "x" } })).rejects.toThrow(/transaction ID/);
    });

    it("refuses an empty basket", async () => {
      await expect(checkout(shop.cashier, cash([], 0))).rejects.toThrow(/empty/);
    });
  });

  describe("all or nothing", () => {
    it("undoes everything when one item runs short: no sale, no stock taken, no receipt number used", async () => {
      // Sugar is fine (2 of 10) but only 3 oil are left and the basket wants 5.
      const err = await checkout(shop.cashier, cash([{ productId: sugarId, quantity: 2 }, { productId: oilId, quantity: 5 }], 100000)).catch((e) => e);

      expect(err).toBeInstanceOf(InsufficientStockError);
      expect(err.message).toBe("Only 3 Cooking oil 2 L in stock, but 5 needed");
      expect(await stockOf(sugarId)).toBe(10); // the sugar taken earlier in the transaction is back
      expect(await stockOf(oilId)).toBe(3);
      expect(await db.sale.count()).toBe(0);
      expect(await db.saleItem.count()).toBe(0);
      expect(await db.stockMovement.count({ where: { type: "SALE" } })).toBe(0);

      // The next good sale still gets receipt #1: the failed one didn't burn a number.
      const next = await checkout(shop.cashier, cash([{ productId: sugarId, quantity: 1 }], 5500));
      expect(next.receiptNo).toBe(1);
    });

    it("lets only one of two tills sell the last items", async () => {
      // Two cashiers each try to sell all 3 bottles of oil at the same moment.
      const results = await Promise.allSettled([
        checkout(shop.cashier, cash([{ productId: oilId, quantity: 3 }], 50000)),
        checkout(shop.manager, cash([{ productId: oilId, quantity: 3 }], 50000)),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(results.find((r) => r.status === "rejected")).toMatchObject({ reason: expect.any(InsufficientStockError) });
      expect(await stockOf(oilId)).toBe(0);
      expect(await db.sale.count()).toBe(1);
      expect(await ledgerMatches(oilId)).toBe(true);
    });

    it("gives simultaneous sales unique receipt numbers with no gaps", async () => {
      const sales = await Promise.all(Array.from({ length: 6 }, () => checkout(shop.cashier, cash([{ productId: sugarId, quantity: 1 }], 5500))));
      expect(sales.map((s) => s.receiptNo).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
      expect(await stockOf(sugarId)).toBe(4);
    });
  });

  describe("double taps and retries", () => {
    it("returns the same sale when the same request arrives twice", async () => {
      const ref = randomUUID();
      const first = await checkout(shop.cashier, cash([{ productId: sugarId, quantity: 2 }], 11000, ref));
      const again = await checkout(shop.cashier, cash([{ productId: sugarId, quantity: 2 }], 11000, ref));
      expect(again.id).toBe(first.id);
      expect(await db.sale.count()).toBe(1);
      expect(await stockOf(sugarId)).toBe(8);
    });

    it("records one sale even when both copies arrive at the same instant", async () => {
      const ref = randomUUID();
      const [a, b] = await Promise.all([
        checkout(shop.cashier, cash([{ productId: sugarId, quantity: 2 }], 11000, ref)),
        checkout(shop.cashier, cash([{ productId: sugarId, quantity: 2 }], 11000, ref)),
      ]);
      expect(a.id).toBe(b.id);
      expect(await db.sale.count()).toBe(1);
      expect(await stockOf(sugarId)).toBe(8);
      expect(await ledgerMatches(sugarId)).toBe(true);
    });
  });

  describe("receipts keep their history", () => {
    it("still shows the old price after the product's price changes", async () => {
      const sale = await checkout(shop.cashier, cash([{ productId: sugarId, quantity: 1 }], 5500));
      await db.product.update({ where: { id: sugarId }, data: { priceNgwee: 6000, name: "Sugar (new pack)" } });
      const item = await db.saleItem.findFirstOrThrow({ where: { saleId: sale.id } });
      expect(item).toMatchObject({ unitPriceNgwee: 5500, name: "White sugar 2 kg" });
    });
  });

  describe("cancelling a sale", () => {
    it("puts the stock back and marks the sale voided, with who and why", async () => {
      const sale = await checkout(shop.cashier, cash([{ productId: sugarId, quantity: 3 }, { productId: oilId, quantity: 1 }], 30000));
      const voided = await voidSale(shop.manager, sale.id, "Customer changed their mind");

      expect(voided).toMatchObject({ status: "VOIDED", voidedById: shop.manager.userId, voidReason: "Customer changed their mind" });
      expect(await stockOf(sugarId)).toBe(10);
      expect(await stockOf(oilId)).toBe(3);
      const returns = await db.stockMovement.findMany({ where: { saleId: sale.id, type: "RETURN" } });
      expect(returns.map((r) => r.note)).toEqual(["Cancelled receipt #1", "Cancelled receipt #1"]);
      expect(await ledgerMatches(sugarId)).toBe(true);
    });

    it("can only happen once, even if two managers press it together", async () => {
      const sale = await checkout(shop.cashier, cash([{ productId: sugarId, quantity: 2 }], 11000));
      const results = await Promise.allSettled([voidSale(shop.manager, sale.id, "Mistake"), voidSale(shop.owner, sale.id, "Mistake")]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(await stockOf(sugarId)).toBe(10); // returned once, not twice
      await expect(voidSale(shop.owner, sale.id, "Again")).rejects.toThrow("already been cancelled");
    });

    it("needs a reason, and isn't something cashiers can do", async () => {
      const sale = await checkout(shop.cashier, cash([{ productId: sugarId, quantity: 1 }], 5500));
      await expect(voidSale(shop.manager, sale.id, "")).rejects.toThrow(/Say why/);
      await expect(voidSale(shop.cashier, sale.id, "Mistake")).rejects.toMatchObject({ code: "forbidden" });
    });

    it("can't touch another shop's sales", async () => {
      const sale = await checkout(shop.cashier, cash([{ productId: sugarId, quantity: 1 }], 5500));
      const other = await makeShop("Other Shop");
      await expect(voidSale(other.owner, sale.id, "Mistake")).rejects.toThrow("Sale not found");
    });
  });

  describe("other shops", () => {
    it("can't sell another shop's products", async () => {
      const other = await makeShop("Other Shop");
      await expect(checkout(other.cashier, cash([{ productId: sugarId, quantity: 1 }], 5500))).rejects.toThrow(/no longer exists/);
      expect(await stockOf(sugarId)).toBe(10);
    });

    it("numbers each shop's receipts separately", async () => {
      const other = await makeShop("Other Shop");
      const otherSugar = (await createProduct(other.owner, { ...sugar, openingStock: 5 })).id;
      await checkout(shop.cashier, cash([{ productId: sugarId, quantity: 1 }], 5500));
      const theirs = await checkout(other.cashier, cash([{ productId: otherSugar, quantity: 1 }], 5500));
      expect(theirs.receiptNo).toBe(1);
    });
  });

  describe("today's takings", () => {
    it("totals completed sales by payment method, leaving voided ones out", async () => {
      await checkout(shop.cashier, cash([{ productId: sugarId, quantity: 2 }], 11000));
      await checkout(shop.cashier, { clientRef: randomUUID(), items: [{ productId: oilId, quantity: 1 }], payment: { method: "MOBILE_MONEY", reference: "MP123456" } });
      const cancelled = await checkout(shop.cashier, cash([{ productId: sugarId, quantity: 1 }], 5500));
      await voidSale(shop.owner, cancelled.id, "Mistake");

      const { from, to } = lusakaDay();
      const day = await salesBetween(shop.owner, from, to);
      expect(day).toMatchObject({ count: 2, voided: 1, totalNgwee: 11000 + 10800, cashNgwee: 11000, mobileMoneyNgwee: 10800, profitNgwee: 2 * 1000 + 1800 });
      expect(day.sales).toHaveLength(3);
    });
  });
});

describe("Lusaka day boundaries", () => {
  it("starts at midnight Lusaka time, which is 22:00 UTC the day before", () => {
    const { from, to } = lusakaDay(new Date("2026-11-20T21:30:00Z")); // 23:30 in Lusaka
    expect(from.toISOString()).toBe("2026-11-19T22:00:00.000Z");
    expect(to.toISOString()).toBe("2026-11-20T22:00:00.000Z");
  });

  it("rolls over at Lusaka midnight, not UTC midnight", () => {
    const { from } = lusakaDay(new Date("2026-11-20T22:30:00Z")); // 00:30 on the 21st in Lusaka
    expect(from.toISOString()).toBe("2026-11-20T22:00:00.000Z");
  });
});
