-- AlterEnum
ALTER TYPE "FulfillmentStatus" ADD VALUE 'completed';


-- Re-fetch the last 60 days on the next sync so already-imported no-shipping orders get the new status.
UPDATE "ShopifyStore" SET "lastSyncedAt" = NULL;
