-- Product names aren't shown; product status is, as a filter. Rows are rebuilt on the next sync.
DELETE FROM "InventoryLevel";
ALTER TABLE "InventoryLevel" DROP COLUMN "productName",
ADD COLUMN "active" BOOLEAN NOT NULL;

-- CreateIndex
CREATE INDEX "InventoryLevel_active_sku_idx" ON "InventoryLevel"("active", "sku");
