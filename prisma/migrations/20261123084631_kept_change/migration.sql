-- CreateEnum
CREATE TYPE "ChangeKind" AS ENUM ('KEPT', 'USED', 'PAID_OUT', 'SALE_CANCELLED');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "changeHeldNgwee" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "changeKeptNgwee" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "changeUsedNgwee" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ChangeEntry" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "saleId" TEXT,
    "kind" "ChangeKind" NOT NULL,
    "amountNgwee" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "byId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChangeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChangeEntry_customerId_createdAt_idx" ON "ChangeEntry"("customerId", "createdAt");

-- AddForeignKey
ALTER TABLE "ChangeEntry" ADD CONSTRAINT "ChangeEntry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeEntry" ADD CONSTRAINT "ChangeEntry_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeEntry" ADD CONSTRAINT "ChangeEntry_byId_fkey" FOREIGN KEY ("byId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
