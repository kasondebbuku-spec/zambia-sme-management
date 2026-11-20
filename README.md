# Kantemba

[![CI](https://github.com/kasondebbuku-spec/zambia-sme-management/actions/workflows/ci.yml/badge.svg)](https://github.com/kasondebbuku-spec/zambia-sme-management/actions/workflows/ci.yml)

**Stock, sales, suppliers and profit for small Zambian businesses.** *Kantemba* is the Zambian word for a small market stall or shop, and that's who this is for.

Many small shops in Lusaka, Ndola or Kabwe track stock in an exercise book, if at all. The owner can't tell what's running low until a customer asks for it, can't tell how much money is sitting on the shelves, and can't explain where missing stock went. Enterprise software is too expensive and too complicated. Kantemba is a simple web app that runs on the phone the shopkeeper already has.

> **Status: milestone 3 of 4.** Inventory, point of sale, purchasing and customer credit work end to end. Next: reports, staff accounts and a live demo. See the [roadmap](#roadmap).

## What it does today

- **Sell from a phone.** Search or scan a barcode, build a basket, take cash (with change worked out) or mobile money (with the transaction ID), and get a printable receipt.
- **Today's takings:** sales, cash to match the drawer, mobile money, and profit (owners and managers only).
- **Cancel a sale** (owners and managers): it's kept, marked cancelled with who and why, and every item goes back on the shelf.
- **Order from suppliers.** A new purchase order starts with everything running low. When the delivery arrives, record what actually came and what it actually cost: short deliveries and price changes are handled.
- **Average cost.** Receiving stock updates each product's cost to the weighted average of old and new stock, so profit stays honest when prices rise.
- **Sell on credit.** Regular customers can buy on account up to a limit set by the owner, then pay later in cash or mobile money. Each customer has a statement with a running balance.
- **Register a business** and become its owner. Roles: owner, manager, cashier.
- **Products** with a code, category, unit (bag, packet, bottle…), cost and selling price, with profit per unit and margin shown.
- **Stock you can trust.** Every change is recorded in a ledger: opening stock, received from a supplier, returned, damaged, or corrected after a count. Each entry has who did it, when, why and the balance after. The current quantity always equals the sum of the ledger.
- **Physical counts.** Enter what's actually on the shelf; the difference is recorded as an adjustment, so missing stock is visible rather than silently overwritten.
- **Running-low alerts** on the dashboard, emptiest first, plus the value of stock at cost and at selling price.
- **Role limits.** Cashiers can see products and stock but can't change prices or adjust stock. This is checked on the server, not just hidden in the page.
- **Built for phones.** No sideways scrolling at 375 px, and forms keep what you typed when something needs fixing.

## Engineering highlights

### Stock can never go negative, even when two cashiers sell at once

The naive way to sell is "read the stock, check it, write the new value". Two cashiers selling the last bag at the same moment both read "1 left", both pass the check, and stock ends at −1.

Kantemba removes stock with **one conditional update**:

```sql
UPDATE "Product" SET "stockQty" = "stockQty" - 3
WHERE id = $1 AND "businessId" = $2 AND "stockQty" >= 3
```

PostgreSQL locks the row for the first sale and re-checks the condition for the second, so only one can succeed. A test fires **10 simultaneous sales at 5 units of stock** and checks that exactly 5 succeed, the other 5 are refused as insufficient stock, stock ends at 0, and the ledger still adds up. See [`src/server/stock.ts`](src/server/stock.ts).

A **physical count** locks the row with `SELECT … FOR UPDATE` before working out the difference, so a sale that lands mid-count isn't overwritten.

### A sale is all or nothing

Checkout is one database transaction:

1. load the products and **price the basket from the database**, so a tampered request can't sell anything for K1
2. check the payment covers the total
3. take the next receipt number
4. write the sale and its lines
5. take each item off the shelf with the race-safe update above

If step 5 fails on the third item because someone just sold the last one, PostgreSQL undoes steps 3–5 completely: no sale, no stock taken, and the receipt number isn't used, so **receipts have no gaps**. Tests cover this, two tills fighting over the last items (one wins), six simultaneous sales (receipts 1–6, no duplicates), and receipt numbers per shop. See [`src/server/sales.ts`](src/server/sales.ts).

### Credit limits that hold under pressure

A customer's balance is raised with one conditional update, "add K110 only if they'd still be within their limit", so two tills can't both push a customer over it. Payments use the same idea in reverse, so the balance never goes below zero. A test runs two K110 sales at once against a K200 limit: one succeeds. The customer statement is rebuilt from the sales and payments and checked against the stored balance.

### Weighted average cost

10 bags on the shelf at K230 plus 20 more at K245 cost K240 each. When a delivery is received the product row is locked (`SELECT … FOR UPDATE`), the average is worked out, and the stock is added through the ledger, so a sale happening at the same moment can't distort the cost.

### No double sales on a slow connection

The till makes a random ID for each basket and sends it with the sale. If the network is slow and the cashier taps **Complete sale** twice, or the browser retries, the second request finds the first sale and returns it. A unique database rule on `(businessId, clientRef)` catches the case where both copies arrive at the same instant. Tested both ways.

### Receipts don't change when prices do

Each sale line copies the product's name, price and cost at the moment of sale. Raising the price of sugar next week doesn't rewrite last week's receipts or profit.

### An append-only stock ledger

Stock is never edited directly. Every change is a `StockMovement` with a type, a signed quantity and the balance after it. Each type may only move one way: a restock can't remove stock, and damage can't add it. Tests check after every scenario that `stockQty` equals the sum of the movements.

### Money in whole ngwee

Amounts are stored and calculated as whole ngwee (K1 = 100 ngwee), so `0.1 + 0.2` rounding errors can't happen. Typed amounts are parsed as text, not floats. **`12,50` is refused rather than read as K1,250**: many phones type a comma for the decimal point, and accepting it would price an item a hundred times too high. A test caught this before it shipped.

### Every shop is isolated

Every query is scoped by `businessId` taken from the signed-in user, never from the request. Tests check that one shop can't see, restock or count another shop's products, even with a valid product id.

### Other details

- Sessions are signed JWTs in `httpOnly` cookies; the user is reloaded on every request, so a deactivated account is locked out immediately.
- Unknown email and wrong password give the same answer and take the same time (a dummy bcrypt compare).
- Sign-in attempts are limited per email (10 per 15 minutes).
- After a validation error, forms keep what was typed, except passwords, which are never sent back.

## Architecture

```mermaid
flowchart LR
    Phone([Shopkeeper's phone]) --> Pages
    subgraph App["Next.js app (one deployable)"]
      Pages["Server-rendered pages<br/>and forms"] --> Actions["Server actions<br/>(check session, parse form)"]
      Actions --> Services["Services<br/>products · stock · accounts<br/>(rules, roles, transactions)"]
    end
    Services -->|Prisma| DB[(PostgreSQL)]
```

Pages and forms never touch the database directly. **Server actions** check the session and turn form fields into plain values. **Services** in `src/server/` hold every business rule, check the user's role, and run multi-step changes in transactions. The services know nothing about HTTP or forms, which is why they can be tested directly against a real database.

## Data model

```mermaid
erDiagram
    Business ||--o{ User : employs
    Business ||--o{ Product : sells
    Product ||--o{ StockMovement : "history of"
    User ||--o{ StockMovement : records
    Business ||--o{ Sale : "receipts"
    Sale ||--o{ SaleItem : lines
    Product ||--o{ SaleItem : "sold as"
    Sale ||--o{ StockMovement : "takes stock"

    Product {
      string sku "unique per business"
      int costNgwee
      int priceNgwee
      int stockQty "sum of movements, never negative"
      int reorderLevel
    }
    StockMovement {
      enum type "OPENING RESTOCK SALE RETURN DAMAGE ADJUSTMENT"
      int quantity "signed"
      int balanceAfter
      string note
    }
    User {
      enum role "OWNER MANAGER CASHIER"
    }
    Sale {
      int receiptNo "1, 2, 3 per shop, no gaps"
      string clientRef "unique per shop: stops double sales"
      int totalNgwee
      int costTotalNgwee
      enum method "CASH MOBILE_MONEY"
      enum status "COMPLETED VOIDED"
    }
    SaleItem {
      string name "copied at time of sale"
      int unitPriceNgwee "copied at time of sale"
      int quantity
    }
```

Full schema: [`prisma/schema.prisma`](prisma/schema.prisma).

## Testing

```bash
npm test
```

119 tests with Vitest. Most run against a real PostgreSQL database:

- **Purchasing:** order numbering, stock unchanged until delivery, receiving as ordered or short and at a different price, weighted average cost (including an empty shelf and rounding), receiving twice at once counts once, a sale during a delivery, cancelling, validation, roles and shop isolation
- **Credit:** phone numbers normalised, limits refused and exactly reached, cash-only customers, two tills racing over a limit, cancelled credit sales taken off the balance, payments (not more than owed, mobile money needs an ID, racing payments), statement with running balance that matches

- **Sales:** totals, change and stock taken; prices always from the database; same product twice becomes one line; short cash refused; mobile-money references; **rollback when one item runs short** (other items restored, no receipt number used); two tills and the last items; six simultaneous sales get receipts 1–6; double taps and simultaneous duplicates make one sale; old receipts keep old prices; cancelling returns stock once even if two managers press it; shops can't sell or cancel each other's sales; today's totals by payment method; Lusaka midnight

- **Stock:** opening stock recorded as a movement; restock, sale, damage and count history with running balances; refusing to oversell with a clear message; **10 simultaneous sales against 5 units**; a sale racing a physical count; movement direction rules; cashiers can't adjust stock; shops can't touch each other's products; dashboard totals and low-stock order
- **Products:** duplicate codes per shop (allowed across shops), selling below cost refused, editing details never changes stock
- **Accounts:** sign-up creates a business and owner together; duplicate email refused without a stray business; case-insensitive sign-in; deactivated accounts refused; attempt limit
- **Money:** formatting, parsing (including `12,50` refused), margin
- **Forms:** typed values echoed back after errors, passwords never echoed

The database tests use `TEST_DATABASE_URL` and are skipped when it isn't set. GitHub Actions runs type checks, lint, all tests against PostgreSQL, and a production build on every push and pull request.

## Run it locally

**Requirements:** Node 20+ and PostgreSQL (or Docker).

```bash
git clone https://github.com/kasondebbuku-spec/zambia-sme-management.git
cd zambia-sme-management
docker compose up -d          # PostgreSQL with kantemba and kantemba_test
cp .env.example .env          # then set SESSION_SECRET and SEED_OWNER_PASSWORD
npm install
npm run db:migrate
npm run db:seed               # demo shop: owner, manager, cashier and 12 products
npm run dev                   # http://localhost:3100
```

Sign in as `owner@kantemba.test`, `manager@kantemba.test` or `cashier@kantemba.test` with your `SEED_OWNER_PASSWORD`, or register a new business at `/signup`.

## Project layout

```
prisma/schema.prisma         data model
prisma/seed.ts               demo shop
src/server/sales.ts          checkout transaction, double-sale protection, cancelling
src/server/purchases.ts      suppliers, purchase orders, deliveries, average cost
src/server/customers.ts      customers, credit limits, payments, statements
src/server/stock.ts          stock ledger, race-safe updates, counts
src/server/products.ts       products, validation, dashboard figures
src/server/accounts.ts       sign-up, password checks, attempt limit
src/server/session.ts        signed session cookie
src/app/actions/             server actions behind each form
src/app/(app)/               signed-in pages: sell, sales, receipts, products, dashboard
src/components/SellScreen    the till: basket, barcode entry, payment
src/lib/money.ts             ngwee formatting and parsing
tests/                       unit and database tests
```

## Roadmap

- [x] **1. Foundation and inventory:** sign-up and roles, products, stock ledger with race-safe updates, counts, low-stock alerts, tests, CI
- [x] **2. Point of sale:** phone-friendly till with barcode entry, cash and mobile money, receipts, cancelling, today's takings; each sale is **one transaction that rolls back completely if any step fails**, with no double sales on a slow connection
- [x] **3. Customers, suppliers and purchasing:** purchase orders and deliveries with weighted average cost, customer credit with race-safe limits, payments and statements
- [ ] **4. Reports and launch:** daily sales, profit and loss, best sellers, staff accounts, live demo

## Author

**Kasonde Bbuku**, BSc Computer Science (Software Engineering), University of Zambia
GitHub: [@kasondebbuku-spec](https://github.com/kasondebbuku-spec)

Licensed under the [MIT License](LICENSE).
