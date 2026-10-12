-- DropIndex
DROP INDEX "Order_shopifyOrderId_key";

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "shopifyGid" TEXT,
ADD COLUMN     "storeId" TEXT;

-- CreateTable
CREATE TABLE "ShopifyStore" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "customDomain" TEXT,
    "clientId" TEXT NOT NULL,
    "clientSecret" TEXT NOT NULL,
    "accessToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshToken" TEXT,
    "dispatchSlaDays" INTEGER NOT NULL DEFAULT 2,
    "deliverySlaDays" INTEGER NOT NULL DEFAULT 5,
    "lastSyncedAt" TIMESTAMP(3),
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopifyStore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShopifyStore_shopDomain_key" ON "ShopifyStore"("shopDomain");

-- CreateIndex
CREATE INDEX "Order_shopifyOrderId_idx" ON "Order"("shopifyOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_storeId_shopifyGid_key" ON "Order"("storeId", "shopifyGid");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "ShopifyStore"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

