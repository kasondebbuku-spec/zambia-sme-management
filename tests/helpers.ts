import type { Role } from "@prisma/client";
import { db } from "../src/server/db";
import type { Ctx } from "../src/server/errors";

export const hasTestDb = Boolean(process.env.TEST_DATABASE_URL);

export async function resetDb() {
  await db.$executeRawUnsafe(`TRUNCATE "ChangeEntry", "CustomerPayment", "Customer", "PurchaseItem", "Purchase", "Supplier", "SaleItem", "Sale", "StockMovement", "Product", "User", "Business" CASCADE`);
}

let n = 0;
/** A shop with an owner, a manager and a cashier; returns a service context for each. */
export async function makeShop(name = "Test Shop") {
  const business = await db.business.create({ data: { name } });
  const ctx = async (role: Role): Promise<Ctx> => {
    n++;
    const user = await db.user.create({ data: { businessId: business.id, email: `${role.toLowerCase()}${n}@shop.test`, name: `${role} ${n}`, passwordHash: "x", role } });
    return { businessId: business.id, userId: user.id, role };
  };
  return { business, owner: await ctx("OWNER"), manager: await ctx("MANAGER"), cashier: await ctx("CASHIER") };
}

export const sugar = { sku: "SUG-2", name: "White sugar 2 kg", category: "Groceries", unit: "packet", costNgwee: 4500, priceNgwee: 5500, reorderLevel: 5 };
