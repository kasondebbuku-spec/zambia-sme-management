import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { bestCustomers, createCustomer, customerHistory, quickAddCustomer, statement } from "../src/server/customers";
import { db } from "../src/server/db";
import { createProduct } from "../src/server/products";
import { checkout, lusakaMonth, salesBetween, voidSale, type CheckoutInput } from "../src/server/sales";
import { hasTestDb, makeShop, resetDb, sugar } from "./helpers";

type Shop = Awaited<ReturnType<typeof makeShop>>;

describe.skipIf(!hasTestDb)("customers on every sale", () => {
  let shop: Shop;
  let sugarId: string, oilId: string, lunguId: string, phiriId: string;

  const sell = (items: CheckoutInput["items"], extra: Partial<CheckoutInput> = {}, ctx = shop.cashier) =>
    checkout(ctx, { clientRef: randomUUID(), items, payment: { method: "CASH", tenderedNgwee: 1_000_000 }, ...extra });

  beforeEach(async () => {
    await resetDb();
    shop = await makeShop();
    sugarId = (await createProduct(shop.owner, { ...sugar, openingStock: 50 })).id; // K55
    oilId = (await createProduct(shop.owner, { ...sugar, sku: "OIL-2", name: "Cooking oil 2 L", unit: "bottle", costNgwee: 7000, priceNgwee: 8500, openingStock: 50 })).id; // K85
    lunguId = (await createCustomer(shop.manager, { name: "Mrs Lungu", phone: "0961112222", creditLimitNgwee: 0 })).id; // cash only
    phiriId = (await createCustomer(shop.manager, { name: "Mr Phiri", creditLimitNgwee: 20000 })).id;
  });

  describe("naming the customer on a sale", () => {
    it("links a cash sale to a cash-only customer and fills in their number", async () => {
      const sale = await sell([{ productId: sugarId, quantity: 1 }], { customerId: lunguId });
      expect(sale).toMatchObject({ method: "CASH", customerId: lunguId, customerPhone: "0961112222" });
      expect(sale.customer?.name).toBe("Mrs Lungu");
    });

    it("leaves what they owe alone for cash and mobile money", async () => {
      await sell([{ productId: sugarId, quantity: 2 }], { customerId: phiriId });
      await checkout(shop.cashier, { clientRef: randomUUID(), items: [{ productId: oilId, quantity: 1 }], payment: { method: "MOBILE_MONEY", reference: "MP2611.ABC123" }, customerId: phiriId });
      expect((await db.customer.findUniqueOrThrow({ where: { id: phiriId } })).balanceNgwee).toBe(0);
      expect((await statement(shop.owner, phiriId)).lines).toEqual([]); // the credit statement only shows credit
    });

    it("keeps the number the cashier typed over the one on file", async () => {
      const sale = await checkout(shop.cashier, {
        clientRef: randomUUID(),
        items: [{ productId: sugarId, quantity: 1 }],
        payment: { method: "MOBILE_MONEY", reference: "MP2611.XYZ789" },
        customerId: lunguId,
        customerPhone: "0977000111",
      });
      expect(sale.customerPhone).toBe("0977000111");
    });

    it("is still optional", async () => {
      expect((await sell([{ productId: sugarId, quantity: 1 }], { customerId: "" })).customerId).toBeNull();
    });

    it("refuses another shop's customer and changes nothing", async () => {
      const other = await makeShop("Other Shop");
      const theirs = (await createCustomer(other.manager, { name: "Not ours", creditLimitNgwee: 0 })).id;
      await expect(sell([{ productId: sugarId, quantity: 1 }], { customerId: theirs })).rejects.toThrow(/no longer exists/);
      expect(await db.sale.count()).toBe(0);
      expect((await db.product.findUniqueOrThrow({ where: { id: sugarId } })).stockQty).toBe(50);
    });

    it("refuses a sale on account that names someone else as well", async () => {
      await expect(
        checkout(shop.cashier, { clientRef: randomUUID(), items: [{ productId: sugarId, quantity: 1 }], payment: { method: "ON_ACCOUNT", customerId: phiriId }, customerId: lunguId }),
      ).rejects.toThrow(/two different customers/);
    });

    it("still keeps cash-only customers off credit", async () => {
      await expect(checkout(shop.cashier, { clientRef: randomUUID(), items: [{ productId: sugarId, quantity: 1 }], payment: { method: "ON_ACCOUNT", customerId: lunguId } })).rejects.toThrow(
        /doesn't have credit/,
      );
    });

    it("shows the customer in the day's sales", async () => {
      await sell([{ productId: sugarId, quantity: 1 }], { customerId: lunguId });
      const { from, to } = lusakaMonth();
      expect((await salesBetween(shop.owner, from, to)).sales[0]?.customer?.name).toBe("Mrs Lungu");
    });
  });

  describe("adding a customer at the till", () => {
    it("lets a cashier add one, cash only", async () => {
      const { customer, existed } = await quickAddCustomer(shop.cashier, { name: "Mrs Banda", phone: "+260 955 123 456" });
      expect(existed).toBe(false);
      expect(customer).toMatchObject({ name: "Mrs Banda", phone: "0955123456", creditLimitNgwee: 0, balanceNgwee: 0 });
    });

    it("returns the customer already on file for a known number instead of a duplicate", async () => {
      const { customer, existed } = await quickAddCustomer(shop.cashier, { name: "Lungu", phone: "096 111 2222" });
      expect(existed).toBe(true);
      expect(customer.id).toBe(lunguId);
      expect(await db.customer.count()).toBe(2);
    });

    it("works without a phone number and checks the name", async () => {
      await expect(quickAddCustomer(shop.cashier, { name: "Ba Tembo" })).resolves.toMatchObject({ existed: false });
      await expect(quickAddCustomer(shop.cashier, { name: "X" })).rejects.toThrow(/name/);
    });

    it("never gives credit, whatever is sent", async () => {
      const sneaky = { name: "Free credit", creditLimitNgwee: 99_999_00 } as unknown as { name: string };
      expect((await quickAddCustomer(shop.cashier, sneaky)).customer.creditLimitNgwee).toBe(0);
    });
  });

  describe("history", () => {
    it("adds up visits, spending and favourites, leaving out cancelled sales", async () => {
      await sell([{ productId: sugarId, quantity: 2 }, { productId: oilId, quantity: 1 }], { customerId: lunguId }); // 110 + 85
      await sell([{ productId: sugarId, quantity: 1 }], { customerId: lunguId }); // 55
      const cancelled = await sell([{ productId: oilId, quantity: 5 }], { customerId: lunguId });
      await voidSale(shop.manager, cancelled.id, "Wrong customer");
      await sell([{ productId: oilId, quantity: 9 }], { customerId: phiriId }); // someone else's

      const h = await customerHistory(shop.owner, lunguId);
      expect(h.visits).toBe(2);
      expect(h.spentNgwee).toBe(25000);
      expect(h.favourites.map((f) => [f.name, f.quantity, f.spentNgwee])).toEqual([
        ["White sugar 2 kg", 3, 16500],
        ["Cooking oil 2 L", 1, 8500],
      ]);
      expect(h.recent).toHaveLength(3); // recent purchases still list the cancelled one, marked VOIDED
      expect(h.recent[0]?.status).toBe("VOIDED");
      expect(h.lastVisit).toBeInstanceOf(Date);
    });

    it("is empty for a new customer", async () => {
      expect(await customerHistory(shop.owner, lunguId)).toMatchObject({ visits: 0, spentNgwee: 0, lastVisit: null, favourites: [], recent: [] });
    });

    it("doesn't show another shop's sales", async () => {
      await sell([{ productId: sugarId, quantity: 1 }], { customerId: lunguId });
      const other = await makeShop("Other Shop");
      expect(await customerHistory(other.owner, lunguId)).toMatchObject({ visits: 0, recent: [] });
    });
  });

  describe("best customers", () => {
    it("ranks this month's spending, counting every way of paying", async () => {
      await sell([{ productId: sugarId, quantity: 1 }], { customerId: lunguId }); // 55 cash
      await sell([{ productId: oilId, quantity: 1 }], { customerId: lunguId }); // 85 cash
      await checkout(shop.cashier, { clientRef: randomUUID(), items: [{ productId: oilId, quantity: 2 }], payment: { method: "ON_ACCOUNT", customerId: phiriId } }); // 170 credit
      await sell([{ productId: oilId, quantity: 4 }]); // no customer: not counted

      const { from, to } = lusakaMonth();
      expect((await bestCustomers(shop.owner, from, to)).map((b) => [b.name, b.visits, b.spentNgwee])).toEqual([
        ["Mr Phiri", 1, 17000],
        ["Mrs Lungu", 2, 14000],
      ]);
    });

    it("drops a cancelled sale and anything outside the dates", async () => {
      const s = await sell([{ productId: oilId, quantity: 3 }], { customerId: phiriId });
      await voidSale(shop.manager, s.id, "Returned");
      await sell([{ productId: sugarId, quantity: 1 }], { customerId: lunguId });
      const { from, to } = lusakaMonth();
      expect((await bestCustomers(shop.owner, from, to)).map((b) => b.name)).toEqual(["Mrs Lungu"]);
      expect(await bestCustomers(shop.owner, to, new Date(to.getTime() + 86_400_000))).toEqual([]);
    });
  });

  it("works out the Lusaka month", () => {
    // 23:30 on 31 October in Lusaka is still October; 00:30 on 1 November is November.
    expect(lusakaMonth(new Date("2026-10-31T21:30:00Z")).from.toISOString()).toBe("2026-09-30T22:00:00.000Z");
    expect(lusakaMonth(new Date("2026-10-31T22:30:00Z"))).toEqual({ from: new Date("2026-10-31T22:00:00Z"), to: new Date("2026-11-30T22:00:00Z") });
  });
});
