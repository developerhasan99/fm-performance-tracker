-- AlterTable
ALTER TABLE "ShopifyStore" ADD COLUMN     "importOrdersFrom" TIMESTAMP(3);


-- Existing stores (TryScent) import from 14 Sep 2026.
UPDATE "ShopifyStore" SET "importOrdersFrom" = '2026-09-14 00:00:00';

-- Start over: delete every order. Line items, support contacts and fulfillment events
-- are removed with their order (ON DELETE CASCADE).
DELETE FROM "Order";

-- Next sync re-imports each store from its import date.
UPDATE "ShopifyStore" SET "lastSyncedAt" = NULL, "lastSyncError" = NULL;
