-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "chargebackCostCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "chargebacks" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "chargebacksLost" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "eurRate" DOUBLE PRECISION,
ADD COLUMN     "failureCause" TEXT,
ADD COLUMN     "failureCostCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "financialStatus" TEXT,
ADD COLUMN     "firstRefundAt" TIMESTAMP(3),
ADD COLUMN     "isReplacement" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lostRevenueCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "refundCostCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "refundCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "refundedCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "replacementForId" TEXT,
ADD COLUMN     "reshipCostCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "supportCostCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tags" TEXT[],
ADD COLUMN     "totalCents" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ShopifyStore" ADD COLUMN     "chargebackFeeCents" INTEGER NOT NULL DEFAULT 1500,
ADD COLUMN     "reshipCostCents" INTEGER NOT NULL DEFAULT 1000,
ADD COLUMN     "ticketCostCents" INTEGER NOT NULL DEFAULT 200;

-- CreateIndex
CREATE INDEX "Order_failureCause_orderDate_idx" ON "Order"("failureCause", "orderDate");

-- CreateIndex
CREATE INDEX "Order_replacementForId_idx" ON "Order"("replacementForId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_replacementForId_fkey" FOREIGN KEY ("replacementForId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Re-fetch the last 60 days so existing orders get totals, refunds, cancellation reasons and chargebacks.
UPDATE "ShopifyStore" SET "lastSyncedAt" = NULL;
