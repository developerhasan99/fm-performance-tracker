-- AlterTable
ALTER TABLE "SupportTicket" ADD COLUMN     "category" "IssueCategory",
ADD COLUMN     "excluded" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "matchMethod" TEXT,
ADD COLUMN     "messageNumbers" TEXT[],
ADD COLUMN     "messagesCheckedAt" TIMESTAMP(3),
ADD COLUMN     "orderId" TEXT,
ADD COLUMN     "refundRequested" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "storeId" TEXT,
ADD COLUMN     "subjectNumbers" TEXT[],
ADD COLUMN     "wismo" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "SupportInbox" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "externalInboxId" INTEGER NOT NULL,
    "storeId" TEXT,

    CONSTRAINT "SupportInbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupportInbox_accountId_externalInboxId_key" ON "SupportInbox"("accountId", "externalInboxId");

-- CreateIndex
CREATE INDEX "SupportTicket_orderId_idx" ON "SupportTicket"("orderId");

-- CreateIndex
CREATE INDEX "SupportTicket_storeId_idx" ON "SupportTicket"("storeId");

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "ShopifyStore"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportInbox" ADD CONSTRAINT "SupportInbox_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "SupportAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportInbox" ADD CONSTRAINT "SupportInbox_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "ShopifyStore"("id") ON DELETE SET NULL ON UPDATE CASCADE;

