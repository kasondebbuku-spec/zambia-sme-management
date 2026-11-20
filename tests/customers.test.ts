import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { createCustomer, recordPayment, setCreditLimit, statement } from "../src/server/customers";
import { db } from "../src/server/db";
import { createProduct } from "../src/server/products";
import { checkout, salesBetween, lusakaDay, voidSale } from "../src/server/sales";
import { hasTestDb, makeShop, resetDb, sugar } from "./helpers";

type Shop = Awaited<ReturnType<typeof makeShop>>;

describe.skipIf(!hasTestDb)("customers and credit", () => {
  let shop: Shop;
  let sugarId: string, customerId: string;

  const onAccount = (quantity: number, who = customerId, ctx = shop.cashier) =>
    checkout(ctx, { clientRef: randomUUID(), items: [{ productId: sugarId, quantity }], payment: { method: "ON_ACCOUNT", customerId: who } });

  const owes = async (id = customerId) => (await db.customer.findUniqueOrThrow({ where: { id } })).balanceNgwee;

  beforeEach(async () => {
    await resetDb();
    shop = await makeShop();
    sugarId = (await createProduct(shop.owner, { ...sugar, openingStock: 50 })).id; // K55.00 each
    customerId = (await createCustomer(shop.manager, { name: "Mr Phiri", phone: "097 123 4567", creditLimitNgwee: 20000 })).id; // K200 limit
  });

  describe("customers", () => {
    it("stores phone numbers in one format and refuses duplicates", async () => {
      expect((await db.customer.findUniqueOrThrow({ where: { id: customerId } })).phone).toBe("0971234567");
      await expect(createCustomer(shop.manager, { name: "Someone else", phone: "+260971234567", creditLimitNgwee: 0 })).rejects.toThrow(/already has that phone/);
      await expect(createCustomer(shop.manager, { name: "Bad number", phone: "12345", creditLimitNgwee: 0 })).rejects.toThrow(/Zambian mobile/);
    });

    it("lets owners and managers set credit, not cashiers", async () => {
      await expect(createCustomer(shop.cashier, { name: "X", creditLimitNgwee: 0 })).rejects.toMatchObject({ code: "forbidden" });
      await expect(setCreditLimit(shop.cashier, customerId, 99999)).rejects.toMatchObject({ code: "forbidden" });
    });
  });

  describe("buying on account", () => {
    it("adds the sale to what the customer owes and links it to them", async () => {
      const sale = await onAccount(2); // K110
      expect(sale).toMatchObject({ method: "ON_ACCOUNT", customerId, totalNgwee: 11000, tenderedNgwee: null, changeNgwee: null });
      expect(await owes()).toBe(11000);
    });

    it("refuses a sale that would go over the limit, and changes nothing", async () => {
      await onAccount(3); // K165 of K200
      const err = await onAccount(1).catch((e) => e); // K55 more would be K220
      expect(err.message).toBe("That's over Mr Phiri's credit limit. They owe K165.00 of K200.00, so K35.00 is available but this sale is K55.00.");
      expect(await owes()).toBe(16500);
      expect((await db.product.findUniqueOrThrow({ where: { id: sugarId } })).stockQty).toBe(47); // the refused sale took no stock
      expect(await db.sale.count()).toBe(1);
    });

    it("allows exactly the limit", async () => {
      await createProduct(shop.owner, { ...sugar, sku: "EXACT", priceNgwee: 20000, costNgwee: 100, openingStock: 1 });
      const exact = await db.product.findFirstOrThrow({ where: { sku: "EXACT" } });
      await checkout(shop.cashier, { clientRef: randomUUID(), items: [{ productId: exact.id, quantity: 1 }], payment: { method: "ON_ACCOUNT", customerId } });
      expect(await owes()).toBe(20000);
    });

    it("tells a cash-only customer to pay now", async () => {
      const cashOnly = (await createCustomer(shop.manager, { name: "Ms Zulu", creditLimitNgwee: 0 })).id;
      await expect(onAccount(1, cashOnly)).rejects.toThrow("Ms Zulu doesn't have credit with you. Take cash or mobile money.");
    });

    it("never lets two tills push a customer over their limit at once", async () => {
      // Each sale is K110; together they'd be K220 against a K200 limit.
      const results = await Promise.allSettled([onAccount(2, customerId, shop.cashier), onAccount(2, customerId, shop.manager)]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(await owes()).toBe(11000);
      expect((await db.product.findUniqueOrThrow({ where: { id: sugarId } })).stockQty).toBe(48);
    });

    it("takes a cancelled on-account sale back off what they owe", async () => {
      const sale = await onAccount(2);
      await voidSale(shop.manager, sale.id, "Wrong customer");
      expect(await owes()).toBe(0);
    });

    it("shows on-account sales separately in today's takings", async () => {
      await onAccount(2);
      await checkout(shop.cashier, { clientRef: randomUUID(), items: [{ productId: sugarId, quantity: 1 }], payment: { method: "CASH", tenderedNgwee: 5500 } });
      const { from, to } = lusakaDay();
      expect(await salesBetween(shop.owner, from, to)).toMatchObject({ totalNgwee: 16500, cashNgwee: 5500, onAccountNgwee: 11000 });
    });

    it("can't charge another shop's customer", async () => {
      const other = await makeShop("Other Shop");
      const theirSugar = (await createProduct(other.owner, { ...sugar, openingStock: 5 })).id;
      await expect(
        checkout(other.cashier, { clientRef: randomUUID(), items: [{ productId: theirSugar, quantity: 1 }], payment: { method: "ON_ACCOUNT", customerId } }),
      ).rejects.toThrow("Customer not found");
      expect((await db.product.findUniqueOrThrow({ where: { id: theirSugar } })).stockQty).toBe(5);
    });
  });

  describe("paying off", () => {
    beforeEach(async () => {
      await onAccount(3); // owes K165
    });

    it("reduces what they owe and records the balance after", async () => {
      const p = await recordPayment(shop.cashier, customerId, { amountNgwee: 10000, method: "CASH" });
      expect(p).toMatchObject({ amountNgwee: 10000, balanceAfter: 6500, receivedById: shop.cashier.userId });
      expect(await owes()).toBe(6500);
    });

    it("refuses paying more than they owe", async () => {
      await expect(recordPayment(shop.cashier, customerId, { amountNgwee: 20000, method: "CASH" })).rejects.toThrow("Mr Phiri only owes K165.00");
      expect(await owes()).toBe(16500);
    });

    it("needs a transaction ID for mobile money", async () => {
      await expect(recordPayment(shop.cashier, customerId, { amountNgwee: 1000, method: "MOBILE_MONEY" })).rejects.toThrow(/transaction ID/);
      await expect(recordPayment(shop.cashier, customerId, { amountNgwee: 1000, method: "MOBILE_MONEY", reference: "mp9988" })).resolves.toMatchObject({ reference: "MP9988" });
    });

    it("never takes the balance below zero when two payments race", async () => {
      const results = await Promise.allSettled([
        recordPayment(shop.cashier, customerId, { amountNgwee: 16500, method: "CASH" }),
        recordPayment(shop.manager, customerId, { amountNgwee: 16500, method: "CASH" }),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(await owes()).toBe(0);
    });

    it("frees up credit for new purchases", async () => {
      await expect(onAccount(1)).rejects.toThrow(/credit limit/); // K165 + K55 > K200
      await recordPayment(shop.cashier, customerId, { amountNgwee: 5500, method: "CASH" });
      await expect(onAccount(1)).resolves.toMatchObject({ method: "ON_ACCOUNT" });
    });
  });

  describe("statement", () => {
    it("lists sales, cancellations and payments with a running balance that matches", async () => {
      const a = await onAccount(2); // +110
      await onAccount(1); // +55
      await voidSale(shop.manager, a.id, "Returned"); // −110
      await recordPayment(shop.cashier, customerId, { amountNgwee: 2500, method: "CASH" }); // −25

      const { lines, matches } = await statement(shop.owner, customerId);
      expect(lines.map((l) => [l.kind, l.amountNgwee, l.balanceNgwee])).toEqual([
        ["sale", 11000, 11000],
        ["sale", 5500, 16500],
        ["cancelled", -11000, 5500],
        ["payment", -2500, 3000],
      ]);
      expect(matches).toBe(true);
      expect(await owes()).toBe(3000);
    });

    it("can't be read by another shop", async () => {
      const other = await makeShop("Other Shop");
      await expect(statement(other.owner, customerId)).rejects.toThrow("Customer not found");
    });
  });
});
