import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

// A demo shop with an owner, a manager and a cashier, and a shelf of everyday stock.
// Running it again resets the demo shop.
const db = new PrismaClient();

const PRODUCTS: [sku: string, name: string, category: string, unit: string, cost: number, price: number, reorder: number, stock: number][] = [
  ["MEAL-25", "Breakfast mealie meal 25 kg", "Staples", "bag", 23000, 26500, 10, 34],
  ["MEAL-10", "Roller meal 10 kg", "Staples", "bag", 9500, 11000, 8, 6],
  ["SUG-2", "White sugar 2 kg", "Groceries", "packet", 4500, 5500, 12, 40],
  ["OIL-2", "Cooking oil 2 L", "Groceries", "bottle", 9000, 10800, 6, 4],
  ["SALT-1", "Iodised salt 1 kg", "Groceries", "packet", 800, 1200, 10, 25],
  ["KAP-500", "Kapenta 500 g", "Groceries", "packet", 6500, 8000, 5, 0],
  ["BEANS-1", "Sugar beans 1 kg", "Groceries", "packet", 3200, 4000, 8, 18],
  ["SOAP-BAR", "Washing soap bar", "Household", "each", 1400, 2000, 20, 60],
  ["CANDLE-6", "Candles, pack of 6", "Household", "pack", 1800, 2500, 10, 9],
  ["AIR-30", "Airtime voucher K30", "Airtime", "each", 2850, 3000, 15, 50],
  ["MAZOE-2", "Orange squash 2 L", "Drinks", "bottle", 5200, 6500, 6, 12],
  ["WATER-500", "Bottled water 500 ml", "Drinks", "bottle", 350, 600, 24, 96],
];

async function main() {
  const email = (process.env.SEED_OWNER_EMAIL || "owner@kantemba.test").toLowerCase();
  const password = process.env.SEED_OWNER_PASSWORD;
  if (!password || password.length < 10) throw new Error("Set SEED_OWNER_PASSWORD (10+ characters) in .env before seeding.");
  const hash = await bcrypt.hash(password, 12);

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) await db.business.delete({ where: { id: existing.businessId } }); // cascades to everything

  const business = await db.business.create({ data: { name: "Mwila General Dealers", town: "Lusaka", phone: "0971234567" } });
  const [owner] = await Promise.all([
    db.user.create({ data: { businessId: business.id, email, name: "Natasha Mwila", passwordHash: hash, role: "OWNER" } }),
    db.user.create({ data: { businessId: business.id, email: "manager@kantemba.test", name: "Joseph Tembo", passwordHash: hash, role: "MANAGER" } }),
    db.user.create({ data: { businessId: business.id, email: "cashier@kantemba.test", name: "Grace Zulu", passwordHash: hash, role: "CASHIER" } }),
  ]);

  for (const [sku, name, category, unit, costNgwee, priceNgwee, reorderLevel, stock] of PRODUCTS) {
    const p = await db.product.create({ data: { businessId: business.id, sku, name, category, unit, costNgwee, priceNgwee, reorderLevel, stockQty: stock } });
    if (stock > 0) {
      await db.stockMovement.create({
        data: { businessId: business.id, productId: p.id, type: "OPENING", quantity: stock, balanceAfter: stock, costNgwee, userId: owner.id },
      });
    }
  }

  console.log(`Seeded "${business.name}" with ${PRODUCTS.length} products.`);
  console.log(`Sign in as ${email} (owner), manager@kantemba.test or cashier@kantemba.test, all with SEED_OWNER_PASSWORD.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
