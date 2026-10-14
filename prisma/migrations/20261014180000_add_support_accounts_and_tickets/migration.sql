-- CreateTable
CREATE TABLE "SupportAccount" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "externalAccountId" INTEGER NOT NULL,
    "externalAccountName" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3),
    "importFrom" TIMESTAMP(3) NOT NULL,
    "lastSyncedAt" TIMESTAMP(3),
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "externalId" INTEGER NOT NULL,
    "displayId" INTEGER,
    "status" TEXT NOT NULL,
    "subject" TEXT,
    "inboxId" INTEGER,
    "contactId" INTEGER,
    "labels" TEXT[],
    "contactReason" TEXT,
    "contactReasonId" INTEGER,
    "ticketCreatedAt" TIMESTAMP(3) NOT NULL,
    "ticketUpdatedAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3),
    "raw" JSONB NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupportAccount_externalAccountId_key" ON "SupportAccount"("externalAccountId");

-- CreateIndex
CREATE INDEX "SupportTicket_ticketCreatedAt_idx" ON "SupportTicket"("ticketCreatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SupportTicket_accountId_externalId_key" ON "SupportTicket"("accountId", "externalId");

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "SupportAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

