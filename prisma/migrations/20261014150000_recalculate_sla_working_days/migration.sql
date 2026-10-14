-- SLA due dates now count working days (Mon–Fri). Re-fetch so existing orders are recalculated.
UPDATE "ShopifyStore" SET "lastSyncedAt" = NULL;
