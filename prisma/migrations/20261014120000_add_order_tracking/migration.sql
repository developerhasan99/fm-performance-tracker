-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "trackingNumber" TEXT,
ADD COLUMN     "trackingUrl" TEXT;

-- CreateIndex
CREATE INDEX "Order_trackingNumber_idx" ON "Order"("trackingNumber");


-- Re-fetch so existing orders get tracking numbers and the carrier fallback.
UPDATE "ShopifyStore" SET "lastSyncedAt" = NULL;
