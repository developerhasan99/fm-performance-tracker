// Run: npx tsx --test src/lib/shopify.test.ts
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { isValidCallbackHmac, mapShopifyOrder, normalizeShopDomain, type ShopifyOrder } from "./shopify";

test("shop domain normalization rejects look-alikes", () => {
  assert.equal(normalizeShopDomain("Acme"), "acme.myshopify.com");
  assert.equal(normalizeShopDomain("https://acme.myshopify.com/admin"), "acme.myshopify.com");
  assert.equal(normalizeShopDomain("acme.myshopify.com.evil.com"), null);
  assert.equal(normalizeShopDomain("acme.com"), null);
});

test("callback HMAC verification", () => {
  const params = new URLSearchParams({ code: "abc", shop: "acme.myshopify.com", state: "xyz", timestamp: "1700000000", host: "YWRtaW4uc2hvcGlmeS5jb20vc3RvcmUvYWNtZQ" });
  const message = new URLSearchParams([...params.entries()].sort(([a], [b]) => a.localeCompare(b))).toString();
  params.set("hmac", createHmac("sha256", "secret").update(message).digest("hex"));
  assert.equal(isValidCallbackHmac(params, "secret"), true);
  assert.equal(isValidCallbackHmac(params, "wrong"), false);
  params.set("shop", "evil.myshopify.com");
  assert.equal(isValidCallbackHmac(params, "secret"), false);
});

const base: ShopifyOrder = {
  id: "gid://shopify/Order/1", name: "#1001", email: "a@b.com", createdAt: "2026-10-01T10:00:00Z", cancelledAt: null,
  displayFulfillmentStatus: "UNFULFILLED", currencyCode: "GBP",
  shippingAddress: { name: "Ada", countryCodeV2: "GB" }, billingAddress: null, shippingLine: { title: "Standard" },
  lineItems: { nodes: [{ sku: "MUG", name: "Mug", requiresShipping: true, currentQuantity: 2, unfulfilledQuantity: 2, originalUnitPriceSet: { shopMoney: { amount: "12.50" } } }] },
  fulfillments: [],
};
const sla = { dispatchSlaDays: 2, deliverySlaDays: 5 };

test("order status mapping", () => {
  const placed = mapShopifyOrder(base, sla, new Date("2026-10-02T00:00:00Z"));
  assert.equal(placed.order.status, "placed");
  assert.equal(placed.items[0].unitPriceCents, 1250);
  assert.equal(mapShopifyOrder(base, sla, new Date("2026-10-04T00:00:00Z")).order.status, "delayed");

  const shipped: ShopifyOrder = { ...base, displayFulfillmentStatus: "FULFILLED",
    lineItems: { nodes: [{ ...base.lineItems.nodes[0], unfulfilledQuantity: 0 }] },
    fulfillments: [{ status: "SUCCESS", requiresShipping: true, createdAt: "2026-10-02T09:00:00Z", deliveredAt: null, trackingInfo: [{ company: "DPD", number: "123" }] }] };
  const inTransit = mapShopifyOrder(shipped, sla, new Date("2026-10-03T00:00:00Z"));
  assert.equal(inTransit.order.status, "in_transit");
  assert.equal(inTransit.order.carrier, "DPD");

  const delivered = mapShopifyOrder({ ...shipped, fulfillments: [{ ...shipped.fulfillments[0], deliveredAt: "2026-10-04T12:00:00Z" }] }, sla, new Date("2026-10-20T00:00:00Z"));
  assert.equal(delivered.order.status, "delivered");
  assert.equal(delivered.order.deliveredAt?.toISOString(), "2026-10-04T12:00:00.000Z");

  assert.equal(mapShopifyOrder({ ...base, cancelledAt: "2026-10-01T11:00:00Z" }, sla).order.status, "cancelled");
});

test("orders with nothing to ship", () => {
  const ebook = { sku: "EBOOK", name: "E-book", requiresShipping: false, currentQuantity: 1, unfulfilledQuantity: 0, originalUnitPriceSet: { shopMoney: { amount: "5.00" } } };
  const digitalFulfillment = { status: "SUCCESS", requiresShipping: false, createdAt: "2026-10-01T10:05:00Z", deliveredAt: null, trackingInfo: [] };
  const digital: ShopifyOrder = { ...base, displayFulfillmentStatus: "FULFILLED", lineItems: { nodes: [ebook] }, fulfillments: [digitalFulfillment] };
  const done = mapShopifyOrder(digital, sla, new Date("2026-10-20T00:00:00Z"));
  assert.equal(done.order.status, "completed");
  assert.equal(done.order.requiresShipping, false);
  assert.equal(done.order.carrierCollectedAt, null);
  // Unfulfilled digital order waits, but is never "delayed" by shipping SLAs.
  const waiting = mapShopifyOrder({ ...digital, displayFulfillmentStatus: "UNFULFILLED", lineItems: { nodes: [{ ...ebook, unfulfilledQuantity: 1 }] }, fulfillments: [] }, sla, new Date("2026-10-20T00:00:00Z"));
  assert.equal(waiting.order.status, "placed");

  // Mixed order: the digital fulfillment must not block "delivered".
  const mug = { ...base.lineItems.nodes[0], unfulfilledQuantity: 0 };
  const parcel = { status: "SUCCESS", requiresShipping: true, createdAt: "2026-10-02T09:00:00Z", deliveredAt: "2026-10-04T12:00:00Z", trackingInfo: [{ company: "DPD", number: "1" }] };
  const mixed = mapShopifyOrder({ ...base, displayFulfillmentStatus: "FULFILLED", lineItems: { nodes: [mug, ebook] }, fulfillments: [digitalFulfillment, parcel] }, sla, new Date("2026-10-20T00:00:00Z"));
  assert.equal(mixed.order.status, "delivered");
  assert.equal(mixed.order.requiresShipping, true);
  assert.equal(mixed.order.carrierCollectedAt?.toISOString(), "2026-10-02T09:00:00.000Z");
});
