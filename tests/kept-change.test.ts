import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { changeHistory, changePaidOutBetween, payOutChange } from "../src/server/change";
import { createCustomer } from "../src/server/customers";
import { db } from "../src/server/db";
import { createProduct } from "../src/server/products";
import { checkout, lusakaDay, salesBetween, voidSale, type CheckoutInput } from "../src/server/sales";
import { hasTestDb, makeShop, resetDb, sugar } from "./helpers";

type Shop = Awaited<ReturnType<typeof makeShop>>;

describe.skipIf(!hasTestDb)("change kept for customers", () => {
  let shop: Shop;
  let sugarId: string, lunguId: string, phiriId: string;

  // Sugar is K55.00.
  const cash = (tenderedNgwee: number, extra: Partial<CheckoutInput> & { keep?: number } = {}, quantity = 1) => {
    const { keep = 0, ...rest } = extra;
    return checkout(shop.cashier, {
      clientRef: randomUUID(),
      items: [{ productId: sugarId, quantity }],
      payment: { method: "CASH", tenderedNgwee, keepChangeNgwee: keep },
      ...rest,
    });
  };
  const held = async (id = lunguId) => (await db.customer.findUniqueOrThrow({ where: { id } })).changeHeldNgwee;
  const stock = async () => (await db.product.findUniqueOrThrow({ where: { id: sugarId } })).stockQty;

  beforeEach(async () => {
    await resetDb();
    shop = await makeShop();
    sugarId = (await createProduct(shop.owner, { ...sugar, openingStock: 50 })).id;
    lunguId = (await createCustomer(shop.manager, { name: "Mrs Lungu", creditLimitNgwee: 0 })).id;
    phiriId = (await createCustomer(shop.manager, { name: "Mr Phiri", creditLimitNgwee: 50000 })).id;
  });

  describe("keeping change", () => {
    it("keeps all the change for the customer when there are no coins", async () => {
      const sale = await cash(6000, { customerId: lunguId, keep: 500 }); // K60 for K55
      expect(sale).toMatchObject({ tenderedNgwee: 6000, changeNgwee: 0, changeKeptNgwee: 500, changeUsedNgwee: 0 });
      expect(await held()).toBe(500);
      expect(await changeHistory(shop.owner, lunguId)).toMatchObject([{ kind: "KEPT", amountNgwee: 500, balanceAfter: 500, receiptNo: sale.receiptNo }]);
    });

    it("can keep part and give the rest", async () => {
      const sale = await cash(10000, { customerId: lunguId, keep: 500 }); // change K45: give K40, keep K5
      expect(sale).toMatchObject({ changeNgwee: 4000, changeKeptNgwee: 500 });
    });

    it("adds up across visits", async () => {
      await cash(6000, { customerId: lunguId, keep: 500 });
      await cash(5700, { customerId: lunguId, keep: 200 });
      expect(await held()).toBe(700);
    });

    it("needs a customer, and can't keep more than the change; nothing is recorded", async () => {
      await expect(cash(6000, { keep: 500 })).rejects.toThrow(/Choose the customer/);
      await expect(cash(6000, { customerId: lunguId, keep: 600 })).rejects.toThrow(/only K5.00/);
      expect(await db.sale.count()).toBe(0);
      expect(await stock()).toBe(50);
      expect(await held()).toBe(0);
    });
  });

  describe("using kept change", () => {
    beforeEach(async () => {
      await cash(6000, { customerId: lunguId, keep: 500 }); // Mrs Lungu has K5 kept
    });

    it("takes it off the next sale, so they pay less", async () => {
      const sale = await cash(5000, { customerId: lunguId, useChangeNgwee: 500 }); // K55 − K5 = K50
      expect(sale).toMatchObject({ totalNgwee: 5500, changeUsedNgwee: 500, tenderedNgwee: 5000, changeNgwee: 0 });
      expect(await held()).toBe(0);
      expect((await changeHistory(shop.owner, lunguId)).map((l) => [l.kind, l.amountNgwee, l.balanceAfter])).toEqual([
        ["USED", -500, 0],
        ["KEPT", 500, 500],
      ]);
    });

    it("keeps profit on the full price", async () => {
      const sale = await cash(5000, { customerId: lunguId, useChangeNgwee: 500 });
      expect(sale.totalNgwee - sale.costTotalNgwee).toBe(1000);
    });

    it("refuses to use more than is kept, and changes nothing", async () => {
      await expect(cash(5000, { customerId: lunguId, useChangeNgwee: 600 })).rejects.toThrow("You're only keeping K5.00 change for Mrs Lungu.");
      expect(await db.sale.count()).toBe(1);
      expect(await stock()).toBe(49);
      expect(await held()).toBe(500);
    });

    it("can't be spent twice by two tills at once", async () => {
      const results = await Promise.allSettled([cash(5000, { customerId: lunguId, useChangeNgwee: 500 }), cash(5000, { customerId: lunguId, useChangeNgwee: 500 })]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(await held()).toBe(0);
    });

    it("can't use another customer's change, or more than the total", async () => {
      await expect(cash(5000, { customerId: phiriId, useChangeNgwee: 500 })).rejects.toThrow(/aren't keeping any change for Mr Phiri/);
      await expect(cash(0, { customerId: lunguId, useChangeNgwee: 5600 })).rejects.toThrow(/at most K55.00/);
    });

    it("can pay for a whole sale", async () => {
      await cash(20000, { customerId: lunguId, keep: 14500 }); // K200 for K55: keep K145 → K150 kept
      const sale = await cash(0, { customerId: lunguId, useChangeNgwee: 5500 });
      expect(sale).toMatchObject({ changeUsedNgwee: 5500, tenderedNgwee: 0, changeNgwee: 0 });
      expect(await held()).toBe(9500);
    });

    it("works with mobile money and on account, charging only what's left", async () => {
      await cash(6000, { customerId: phiriId, keep: 500 });
      const sale = await checkout(shop.cashier, {
        clientRef: randomUUID(),
        items: [{ productId: sugarId, quantity: 1 }],
        payment: { method: "ON_ACCOUNT", customerId: phiriId },
        useChangeNgwee: 500,
      });
      expect((await db.customer.findUniqueOrThrow({ where: { id: phiriId } })).balanceNgwee).toBe(5000);

      // Cancelling puts both back: the K50 comes off what he owes and the K5 is kept for him again.
      await voidSale(shop.manager, sale.id, "Wrong items");
      expect(await db.customer.findUniqueOrThrow({ where: { id: phiriId } })).toMatchObject({ balanceNgwee: 0, changeHeldNgwee: 500 });
    });
  });

  describe("cancelling a sale that kept change", () => {
    it("takes the kept change back", async () => {
      const sale = await cash(6000, { customerId: lunguId, keep: 500 });
      await voidSale(shop.manager, sale.id, "Customer returned it");
      expect(await held()).toBe(0);
      expect((await changeHistory(shop.owner, lunguId))[0]).toMatchObject({ kind: "SALE_CANCELLED", amountNgwee: -500 });
    });

    it("refuses if that change was already used, and changes nothing", async () => {
      const sale = await cash(6000, { customerId: lunguId, keep: 500 });
      await cash(5000, { customerId: lunguId, useChangeNgwee: 500 });
      await expect(voidSale(shop.manager, sale.id, "Returned")).rejects.toThrow(/already been used or collected/);
      expect((await db.sale.findUniqueOrThrow({ where: { id: sale.id } })).status).toBe("COMPLETED");
      expect(await stock()).toBe(48);
    });
  });

  describe("handing change over", () => {
    beforeEach(async () => {
      await cash(6000, { customerId: lunguId, keep: 500 });
    });

    it("lets any role hand over some or all of it", async () => {
      await payOutChange(shop.cashier, lunguId, 200);
      expect(await held()).toBe(300);
      await payOutChange(shop.cashier, lunguId, 300);
      expect(await held()).toBe(0);
    });

    it("refuses more than is kept, zero, and another shop", async () => {
      await expect(payOutChange(shop.cashier, lunguId, 600)).rejects.toThrow(/only keeping K5.00/);
      await expect(payOutChange(shop.cashier, lunguId, 0)).rejects.toThrow(/above zero/);
      const other = await makeShop("Other Shop");
      await expect(payOutChange(other.owner, lunguId, 100)).rejects.toThrow("Customer not found");
      expect(await held()).toBe(500);
    });
  });

  it("counts kept change in the day's cash and reports what was used and handed out", async () => {
    await cash(6000, { customerId: lunguId, keep: 500 }); // K60 into the drawer
    await cash(5200, { customerId: lunguId, useChangeNgwee: 300 }); // K55 less K3 kept change: K52 into the drawer
    await payOutChange(shop.cashier, lunguId, 200); // the last K2 handed over from the drawer
    const { from, to } = lusakaDay();
    const day = await salesBetween(shop.owner, from, to);
    expect(day).toMatchObject({ totalNgwee: 11000, cashNgwee: 6000 + 5200, changeKeptNgwee: 500, changeUsedNgwee: 300 });
    expect(await changePaidOutBetween(shop.owner, from, to)).toBe(200);
  });
});
