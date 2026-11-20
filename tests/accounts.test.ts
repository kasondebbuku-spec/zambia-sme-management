import { beforeEach, describe, expect, it } from "vitest";
import { checkPassword, clearAttempts, registerBusiness, tooManyAttempts } from "../src/server/accounts";
import { db } from "../src/server/db";
import { hasTestDb, resetDb } from "./helpers";

const signUp = { businessName: "Mwila General Dealers", town: "Kabwe", ownerName: "Natasha Mwila", email: "Natasha@Shop.test", password: "a-long-password" };

describe.skipIf(!hasTestDb)("accounts", () => {
  beforeEach(resetDb);

  it("registers a business with its owner", async () => {
    const user = await registerBusiness(signUp);
    expect(user).toMatchObject({ email: "natasha@shop.test", role: "OWNER", name: "Natasha Mwila" });
    expect(user.passwordHash).not.toContain("a-long-password");
    expect(await db.business.findUniqueOrThrow({ where: { id: user.businessId } })).toMatchObject({ name: "Mwila General Dealers", town: "Kabwe" });
  });

  it("refuses an email that's already registered, without creating a second business", async () => {
    await registerBusiness(signUp);
    await expect(registerBusiness({ ...signUp, businessName: "Another" })).rejects.toThrow(/already exists/);
    expect(await db.business.count()).toBe(1);
  });

  it("validates the sign-up form", async () => {
    await expect(registerBusiness({ ...signUp, password: "short" })).rejects.toThrow(/at least 10/);
    await expect(registerBusiness({ ...signUp, email: "not-an-email" })).rejects.toThrow(/valid email/);
  });

  it("checks passwords, ignoring email case", async () => {
    await registerBusiness(signUp);
    expect(await checkPassword("NATASHA@shop.test", "a-long-password")).toMatchObject({ role: "OWNER" });
    expect(await checkPassword("natasha@shop.test", "wrong")).toBeNull();
    expect(await checkPassword("nobody@shop.test", "a-long-password")).toBeNull();
  });

  it("refuses deactivated accounts", async () => {
    const user = await registerBusiness(signUp);
    await db.user.update({ where: { id: user.id }, data: { isActive: false } });
    expect(await checkPassword(signUp.email, signUp.password)).toBeNull();
  });
});

describe("sign-in attempt limit", () => {
  it("allows 10 attempts per 15 minutes, then blocks", () => {
    const now = Date.now();
    const key = `limit-${now}`;
    for (let i = 0; i < 10; i++) expect(tooManyAttempts(key, now)).toBe(false);
    expect(tooManyAttempts(key, now)).toBe(true);
    expect(tooManyAttempts(key, now + 16 * 60 * 1000)).toBe(false); // window over
  });

  it("resets after a successful sign-in", () => {
    const key = `reset-${Date.now()}`;
    for (let i = 0; i < 11; i++) tooManyAttempts(key);
    clearAttempts(key);
    expect(tooManyAttempts(key)).toBe(false);
  });
});
