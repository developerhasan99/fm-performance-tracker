-- CreateEnum
CREATE TYPE "FulfillmentStatus" AS ENUM ('placed', 'processing', 'in_transit', 'delivered', 'delayed', 'cancelled');

-- CreateEnum
CREATE TYPE "IssueCategory" AS ENUM ('late_delivery', 'not_dispatched', 'lost_in_transit', 'missing_item', 'wrong_item', 'damaged', 'address_error', 'cancellation', 'other');

-- CreateEnum
CREATE TYPE "IssueResolution" AS ENUM ('pending', 'resolved', 'refunded', 'replacement', 'reshipped');

-- CreateEnum
CREATE TYPE "EventSource" AS ENUM ('shopify', 'factory', 'carrier', 'support');

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "shopifyOrderId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "market" TEXT NOT NULL DEFAULT 'UK',
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "factoryName" TEXT NOT NULL,
    "carrier" TEXT NOT NULL,
    "shippingService" TEXT NOT NULL,
    "orderDate" TIMESTAMP(3) NOT NULL,
    "dispatchDueAt" TIMESTAMP(3) NOT NULL,
    "deliveryDueAt" TIMESTAMP(3) NOT NULL,
    "factoryReceivedAt" TIMESTAMP(3),
    "pickedAt" TIMESTAMP(3),
    "packedAt" TIMESTAMP(3),
    "carrierCollectedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "status" "FulfillmentStatus" NOT NULL DEFAULT 'placed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "shippedQuantity" INTEGER NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportContact" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "category" "IssueCategory" NOT NULL,
    "resolution" "IssueResolution" NOT NULL DEFAULT 'pending',
    "channel" TEXT NOT NULL DEFAULT 'email',
    "contactedAt" TIMESTAMP(3) NOT NULL,
    "refundAmountCents" INTEGER NOT NULL DEFAULT 0,
    "replacementCostCents" INTEGER NOT NULL DEFAULT 0,
    "handlingMinutes" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SupportContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FulfillmentEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "source" "EventSource" NOT NULL,
    "eventType" TEXT NOT NULL,
    "details" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FulfillmentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Order_shopifyOrderId_key" ON "Order"("shopifyOrderId");

-- CreateIndex
CREATE INDEX "Order_orderDate_idx" ON "Order"("orderDate");

-- CreateIndex
CREATE INDEX "Order_status_orderDate_idx" ON "Order"("status", "orderDate");

-- CreateIndex
CREATE INDEX "Order_factoryName_orderDate_idx" ON "Order"("factoryName", "orderDate");

-- CreateIndex
CREATE INDEX "Order_carrier_orderDate_idx" ON "Order"("carrier", "orderDate");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "SupportContact_orderId_contactedAt_idx" ON "SupportContact"("orderId", "contactedAt");

-- CreateIndex
CREATE INDEX "SupportContact_category_contactedAt_idx" ON "SupportContact"("category", "contactedAt");

-- CreateIndex
CREATE INDEX "FulfillmentEvent_orderId_occurredAt_idx" ON "FulfillmentEvent"("orderId", "occurredAt");

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportContact" ADD CONSTRAINT "SupportContact_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FulfillmentEvent" ADD CONSTRAINT "FulfillmentEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
