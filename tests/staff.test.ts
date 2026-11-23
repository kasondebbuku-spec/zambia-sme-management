import { beforeEach, describe, expect, it } from "vitest";
import { checkPassword } from "../src/server/accounts";
import { db } from "../src/server/db";
import { addStaff, changeOwnPassword, listStaff, resetStaffPassword, sessionStillValid, setStaffActive, setStaffRole } from "../src/server/staff";
import { hasTestDb, makeShop, resetDb } from "./helpers";

type Shop = Awaited<ReturnType<typeof makeShop>>;

describe("sessions after a password change", () => {
  const changed = new Date("2026-11-22T10:00:00.500Z");
  const at = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

  it("keeps sessions when the password never changed", () => {
    expect(sessionStillValid(at("2026-01-01T00:00:00Z"), null)).toBe(true);
  });

  it("refuses sessions started before the change, keeps ones from the same second on", () => {
    expect(sessionStillValid(at("2026-11-22T09:59:59Z"), changed)).toBe(false);
    expect(sessionStillValid(at("2026-11-22T10:00:00Z"), changed)).toBe(true); // the phone that made the change
    expect(sessionStillValid(at("2026-11-22T11:00:00Z"), changed)).toBe(true);
  });

  it("refuses a token without an issue time once the password has changed", () => {
    expect(sessionStillValid(undefined, changed)).toBe(false);
  });
});

describe.skipIf(!hasTestDb)("staff logins", () => {
  let shop: Shop;
  const cashierInput = { name: "Chanda Mulenga", email: "Chanda@Shop.test ", role: "CASHIER" as const, password: "starting-pass-1" };

  beforeEach(async () => {
    await resetDb();
    shop = await makeShop();
  });

  describe("adding", () => {
    it("lets the owner add a cashier who can then sign in", async () => {
      const added = await addStaff(shop.owner, cashierInput);
      expect(added).toMatchObject({ name: "Chanda Mulenga", email: "chanda@shop.test", role: "CASHIER", isActive: true });
      expect(added).not.toHaveProperty("passwordHash");
      expect((await checkPassword("chanda@shop.test", "starting-pass-1"))?.businessId).toBe(shop.business.id);
    });

    it("only lets the owner manage staff", async () => {
      await expect(addStaff(shop.manager, cashierInput)).rejects.toMatchObject({ code: "forbidden" });
      await expect(addStaff(shop.cashier, cashierInput)).rejects.toMatchObject({ code: "forbidden" });
      await expect(listStaff(shop.manager)).rejects.toMatchObject({ code: "forbidden" });
    });

    it("never creates another owner", async () => {
      await expect(addStaff(shop.owner, { ...cashierInput, role: "OWNER" as "CASHIER" })).rejects.toThrow(/manager or cashier/);
    });

    it("checks the password and refuses an email already in use", async () => {
      await expect(addStaff(shop.owner, { ...cashierInput, password: "short" })).rejects.toThrow(/10 characters/);
      await addStaff(shop.owner, cashierInput);
      await expect(addStaff(shop.owner, { ...cashierInput, name: "Someone else" })).rejects.toThrow(/already uses that email/);
    });

    it("lists only this shop's people, with no password hashes", async () => {
      await addStaff(shop.owner, cashierInput);
      const other = await makeShop("Other Shop");
      await addStaff(other.owner, { ...cashierInput, email: "theirs@shop.test" });
      const list = await listStaff(shop.owner);
      expect(list).toHaveLength(4); // owner, manager, cashier from makeShop, plus Chanda
      expect(list.every((u) => !("passwordHash" in u))).toBe(true);
      expect(list.map((u) => u.email)).not.toContain("theirs@shop.test");
    });
  });

  describe("changing", () => {
    it("switches a login off and on; a switched-off login can't sign in", async () => {
      const { id } = await addStaff(shop.owner, cashierInput);
      await setStaffActive(shop.owner, id, false);
      expect(await checkPassword("chanda@shop.test", "starting-pass-1")).toBeNull();
      await setStaffActive(shop.owner, id, true);
      expect(await checkPassword("chanda@shop.test", "starting-pass-1")).not.toBeNull();
    });

    it("changes a role between cashier and manager", async () => {
      const { id } = await addStaff(shop.owner, cashierInput);
      await setStaffRole(shop.owner, id, "MANAGER");
      expect((await db.user.findUniqueOrThrow({ where: { id } })).role).toBe("MANAGER");
      await expect(setStaffRole(shop.owner, id, "OWNER" as "MANAGER")).rejects.toThrow();
    });

    it("protects the owner's own account", async () => {
      await expect(setStaffActive(shop.owner, shop.owner.userId, false)).rejects.toThrow(/your own access/);
      await expect(setStaffRole(shop.owner, shop.owner.userId, "CASHIER")).rejects.toThrow(/your own access/);
      await expect(resetStaffPassword(shop.owner, shop.owner.userId, "a-new-password")).rejects.toThrow(/your own access/);
    });

    it("can't touch another owner or another shop's staff", async () => {
      const coOwner = await db.user.create({ data: { businessId: shop.business.id, email: "co@shop.test", name: "Co Owner", passwordHash: "x", role: "OWNER" } });
      await expect(setStaffActive(shop.owner, coOwner.id, false)).rejects.toThrow(/owner's account/);

      const other = await makeShop("Other Shop");
      await expect(setStaffActive(other.owner, shop.cashier.userId, false)).rejects.toThrow("Staff member not found");
      await expect(resetStaffPassword(other.owner, shop.cashier.userId, "taken-over-123")).rejects.toThrow("Staff member not found");
      expect((await db.user.findUniqueOrThrow({ where: { id: shop.cashier.userId } })).isActive).toBe(true);
    });

    it("resets a forgotten password and marks when, so old sessions end", async () => {
      const { id } = await addStaff(shop.owner, cashierInput);
      const before = Date.now();
      await resetStaffPassword(shop.owner, id, "brand-new-pass");
      expect(await checkPassword("chanda@shop.test", "starting-pass-1")).toBeNull();
      const user = await checkPassword("chanda@shop.test", "brand-new-pass");
      expect(user?.passwordChangedAt?.getTime()).toBeGreaterThanOrEqual(before - 1000);
      await expect(resetStaffPassword(shop.owner, id, "short")).rejects.toThrow(/10 characters/);
    });
  });

  describe("changing your own password", () => {
    it("needs the current password, and works for any role", async () => {
      const { id } = await addStaff(shop.owner, cashierInput);
      const me = { businessId: shop.business.id, userId: id, role: "CASHIER" as const };
      await expect(changeOwnPassword(me, "wrong-password", "my-own-secret-1")).rejects.toThrow(/current password isn't right/);
      await expect(changeOwnPassword(me, "starting-pass-1", "short")).rejects.toThrow(/10 characters/);
      await expect(changeOwnPassword(me, "starting-pass-1", "starting-pass-1")).rejects.toThrow(/different/);

      await changeOwnPassword(me, "starting-pass-1", "my-own-secret-1");
      expect(await checkPassword("chanda@shop.test", "starting-pass-1")).toBeNull();
      expect((await checkPassword("chanda@shop.test", "my-own-secret-1"))?.passwordChangedAt).toBeInstanceOf(Date);
    });
  });
});
