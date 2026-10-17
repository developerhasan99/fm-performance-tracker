import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { csvResponse } from "@/lib/csv";
import { getOrders, getStoreOptions, parseOrderParams, statusLabels } from "@/lib/dashboard";

// Every order matching the list's filters, as CSV.
// ponytail: builds the whole file in memory; stream in batches if exports reach tens of thousands of orders.
export async function GET(request: NextRequest) {
  await requireUser();
  const { filters } = parseOrderParams(Object.fromEntries(request.nextUrl.searchParams), await getStoreOptions());
  const { orders } = await getOrders(filters);
  return csvResponse("orders", [
    ["Order", "Store", "Order date (UTC)", "Customer", "Email", "Status", "Requires shipping", "Items", "Units", "Units shipped", "Order value", "Currency",
      "Factory", "Carrier", "Shipping service", "Tracking number", "Tracking URL", "Dispatch due", "Collected by carrier", "Delivery due", "Delivered",
      "Support contacts", "WISMO contacts", "Refund requested"],
    ...orders.map((order) => [
      order.shopifyOrderId, order.store?.name, order.orderDate, order.customerName, order.customerEmail, statusLabels[order.status], order.requiresShipping ? "Yes" : "No",
      order.items.map((item) => `${item.quantity} × ${item.name}${item.sku ? ` (${item.sku})` : ""}`).join("; "),
      order.items.reduce((sum, item) => sum + item.quantity, 0),
      order.items.reduce((sum, item) => sum + item.shippedQuantity, 0),
      (order.items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0) / 100).toFixed(2), order.currency,
      order.factoryName, order.carrier, order.shippingService, order.trackingNumber, order.trackingUrl,
      order.dispatchDueAt, order.carrierCollectedAt, order.deliveryDueAt, order.deliveredAt,
      order.contacts.length, order.contacts.filter((contact) => contact.wismo).length, order.contacts.some((contact) => contact.refundRequested) ? "Yes" : "No",
    ]),
  ]);
}
