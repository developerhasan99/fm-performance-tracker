import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { isDemoMode, requireUser } from "@/lib/auth";
import { csvResponse } from "@/lib/csv";
import { getStoreOptions } from "@/lib/dashboard";
import { getPrisma } from "@/lib/prisma";
import { parseRefundParams, refundSelect, shopifyNumericId } from "@/lib/refunds";

// Every refund matching the list's filters, as CSV.
export async function GET(request: NextRequest) {
  if (isDemoMode()) redirect("/");
  await requireUser();
  const { where } = parseRefundParams(Object.fromEntries(request.nextUrl.searchParams), await getStoreOptions());
  const refunds = await getPrisma().refund.findMany({ where, select: refundSelect, orderBy: [{ refundedAt: "desc" }, { id: "desc" }] });
  return csvResponse("refunds", [
    ["Store", "Shopify order ID", "Shopify order number", "Refund amount", "Currency", "Refund date (UTC)", "Refunded by", "Refund note"],
    ...refunds.map((refund) => [
      refund.order.store?.name, shopifyNumericId(refund.order.shopifyGid), refund.order.shopifyOrderId, (refund.amountCents / 100).toFixed(2), refund.order.currency,
      refund.refundedAt, refund.refundedBy, refund.note,
    ]),
  ]);
}
