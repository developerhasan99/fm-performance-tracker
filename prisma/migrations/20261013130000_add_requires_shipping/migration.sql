-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "requiresShipping" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "Order_requiresShipping_orderDate_idx" ON "Order"("requiresShipping", "orderDate");


-- Completed orders are by definition no-shipping orders.
UPDATE "Order" SET "requiresShipping" = false WHERE "status" = 'completed';
-- Re-fetch the last 60 days so unfulfilled no-shipping orders get flagged too.
UPDATE "ShopifyStore" SET "lastSyncedAt" = NULL;
