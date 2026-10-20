-- AlterTable
ALTER TABLE "Order" DROP COLUMN "lostRevenueCents",
DROP COLUMN "supportCostCents";

-- AlterTable
ALTER TABLE "ShopifyStore" DROP COLUMN "ticketCostCents";

