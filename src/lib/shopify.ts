import { createHmac, timingSafeEqual } from "node:crypto";
import type { FulfillmentStatus, ShopifyStore } from "@prisma/client";
import { decrypt, encrypt } from "@/lib/encryption";
import { getPrisma, runInBatches } from "@/lib/prisma";
import { recomputeFailures } from "@/lib/failure";
import { eurRate } from "@/lib/fx";
import { linkTickets } from "@/lib/support-matching";

export const SHOPIFY_API_VERSION = "2026-10";
// read_orders only reaches the last 60 days; older orders need read_all_orders, which Shopify must approve.
export const SHOPIFY_SCOPES = "read_orders";
const DAY = 24 * 60 * 60 * 1000;

/** "Acme", "acme.myshopify.com" or "https://acme.myshopify.com/admin" → "acme.myshopify.com", or null if invalid. */
export function normalizeShopDomain(input: string) {
  let host = input.trim().toLowerCase().replace(/^https?:\/\//, "").split(/[/?#]/)[0];
  if (host && !host.includes(".")) host = `${host}.myshopify.com`;
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(host) ? host : null;
}

export function normalizeCustomDomain(input: string) {
  const host = input.trim().toLowerCase().replace(/^https?:\/\//, "").split(/[/?#]/)[0].replace(/^www\./, "");
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : null;
}

// ---- OAuth (authorization code grant) -------------------------------------------------

export function authorizeUrl(store: Pick<ShopifyStore, "shopDomain" | "clientId">, redirectUri: string, state: string) {
  const params = new URLSearchParams({ client_id: store.clientId, scope: SHOPIFY_SCOPES, redirect_uri: redirectUri, state });
  return `https://${store.shopDomain}/admin/oauth/authorize?${params}`;
}

/** Shopify signs the callback query with the app's client secret. */
export function isValidCallbackHmac(query: URLSearchParams, clientSecret: string) {
  const received = query.get("hmac") ?? "";
  // Same encoding as Shopify's own library: sorted params, URLSearchParams-encoded.
  const message = new URLSearchParams(
    [...query.entries()].filter(([key]) => key !== "hmac" && key !== "signature").sort(([a], [b]) => a.localeCompare(b)),
  ).toString();
  const expected = createHmac("sha256", clientSecret).update(message).digest("hex");
  return received.length === expected.length && timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

type TokenResponse = { access_token: string; scope: string; expires_in?: number; refresh_token?: string };

async function tokenRequest(shopDomain: string, body: Record<string, string>) {
  const response = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(body),
  });
  return response;
}

function tokenFields(token: TokenResponse) {
  return {
    accessToken: encrypt(token.access_token),
    accessTokenExpiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null,
    refreshToken: token.refresh_token ? encrypt(token.refresh_token) : null,
  };
}

export async function connectStore(store: ShopifyStore, code: string) {
  const response = await tokenRequest(store.shopDomain, {
    client_id: store.clientId,
    client_secret: decrypt(store.clientSecret),
    code,
    expiring: "1",
  });
  if (!response.ok) throw new Error(`Shopify rejected the authorization (${response.status}).`);
  const token = (await response.json()) as TokenResponse;
  if (!token.scope.split(",").includes("read_orders")) throw new Error("The app was installed without the read_orders scope.");
  await getPrisma().shopifyStore.update({ where: { id: store.id }, data: { ...tokenFields(token), lastSyncError: null } });
}

async function accessTokenFor(store: ShopifyStore) {
  if (!store.accessToken) throw new Error("Not connected. Click Connect to authorize the app.");
  const fresh = !store.accessTokenExpiresAt || store.accessTokenExpiresAt.getTime() - Date.now() > 60_000;
  if (fresh) return decrypt(store.accessToken);
  if (!store.refreshToken) throw new Error("Access expired. Click Connect to authorize again.");

  const response = await tokenRequest(store.shopDomain, {
    client_id: store.clientId,
    client_secret: decrypt(store.clientSecret),
    grant_type: "refresh_token",
    refresh_token: decrypt(store.refreshToken),
  });
  if (response.status === 400 || response.status === 401) {
    await getPrisma().shopifyStore.update({ where: { id: store.id }, data: { accessToken: null, refreshToken: null, accessTokenExpiresAt: null } });
    throw new Error("Shopify revoked access (app uninstalled or refresh expired). Click Connect to authorize again.");
  }
  if (!response.ok) throw new Error(`Token refresh failed (${response.status}); will retry next sync.`);
  const token = (await response.json()) as TokenResponse;
  await getPrisma().shopifyStore.update({ where: { id: store.id }, data: tokenFields(token) });
  return token.access_token;
}

// ---- Orders ---------------------------------------------------------------------------

const ORDERS_QUERY = `query Orders($cursor: String, $query: String) {
  orders(first: 10, after: $cursor, sortKey: UPDATED_AT, query: $query) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id name email createdAt cancelledAt cancelReason displayFulfillmentStatus displayFinancialStatus currencyCode tags
      totalPriceSet { shopMoney { amount } }
      totalRefundedSet { shopMoney { amount } }
      refunds { id createdAt note totalRefundedSet { shopMoney { amount } } }
      disputes { initiatedAs status }
      shippingAddress { name countryCodeV2 }
      billingAddress { name }
      shippingLine { title }
      lineItems(first: 50) { nodes { sku name requiresShipping currentQuantity unfulfilledQuantity originalUnitPriceSet { shopMoney { amount } } } }
      fulfillments(first: 10) { status requiresShipping createdAt deliveredAt trackingInfo(first: 1) { company number url } }
    }
  }
}`;

export type ShopifyRefund = { id: string; createdAt: string | null; note: string | null; totalRefundedSet: { shopMoney: { amount: string } } };
type RefundEvent = { createdAt: string; author?: string | null };

export type ShopifyOrder = {
  id: string;
  name: string;
  email: string | null;
  createdAt: string;
  cancelledAt: string | null;
  cancelReason?: string | null;
  displayFulfillmentStatus: string;
  displayFinancialStatus?: string | null;
  currencyCode: string;
  tags?: string[];
  totalPriceSet?: { shopMoney: { amount: string } };
  totalRefundedSet?: { shopMoney: { amount: string } };
  refunds?: ShopifyRefund[];
  disputes?: { initiatedAs: string; status: string }[];
  shippingAddress: { name: string | null; countryCodeV2: string | null } | null;
  billingAddress: { name: string | null } | null;
  shippingLine: { title: string } | null;
  lineItems: { nodes: { sku: string | null; name: string; requiresShipping: boolean; currentQuantity: number; unfulfilledQuantity: number; originalUnitPriceSet: { shopMoney: { amount: string } } }[] };
  fulfillments: { status: string; requiresShipping: boolean; createdAt: string; deliveredAt: string | null; trackingInfo: { company: string | null; number: string | null; url: string | null }[] }[];
};

// Asked per refunded order, not in ORDERS_QUERY: Refund.staffMember needs read_users, the order timeline only read_orders.
const REFUND_EVENTS_QUERY = `query RefundEvents($id: ID!) {
  order(id: $id) { events(first: 20, reverse: true, query: "action:refund_created") { nodes { createdAt ... on BasicEvent { author } } } }
}`;

type OrdersPage = { orders: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: ShopifyOrder[] } };

async function adminGraphql<T>(shopDomain: string, token: string, query: string, variables: Record<string, unknown>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(`https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
      body: JSON.stringify({ query, variables }),
    });
    const body = (await response.json().catch(() => null)) as { data?: T; errors?: { message: string; extensions?: { code?: string } }[] } | null;
    const throttled = response.status === 429 || body?.errors?.some((error) => error.extensions?.code === "THROTTLED");
    if (throttled && attempt < 6) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
      continue;
    }
    if (response.status === 401) throw new Error("Shopify rejected the access token. Click Connect to authorize again.");
    if (!response.ok || body?.errors?.length || !body?.data) {
      throw new Error(`Shopify API error (${response.status}): ${body?.errors?.map((error) => error.message).join("; ") ?? "no data"}`);
    }
    return body.data;
  }
}

// ponytail: name list, not exhaustive; add carriers as new stores bring them.
const KNOWN_CARRIER = /\b(dpd|gls|dhl|ups|fedex|inpost|royal mail|evri|hermes|postnl|poczta polska|colissimo|chronopost|correos|la poste|bpost|postnord|yodel|parcelforce|tnt|usps|packeta|zasilkovna|orlen|mondial relay|sendcloud)\b/i;

/** Marketplace imports (e.g. M2E/TikTok) often set tracking without a carrier name, but the shipping line names it ("GLS Poland"). */
export function carrierFromShippingLine(title: string | undefined) {
  const name = title?.replace(/\(.*\)/, "").trim();
  return name && KNOWN_CARRIER.test(name) ? name : null;
}

/** Adds working days (Mon–Fri), keeping the time of day. Warehouse and carriers don't work weekends. */
// ponytail: weekdays are judged in UTC and public holidays aren't skipped; add the shop timezone / a holiday list if needed.
export function addWorkingDays(start: Date, days: number) {
  const date = new Date(start);
  for (let added = 0; added < days; ) {
    date.setUTCDate(date.getUTCDate() + 1);
    const weekday = date.getUTCDay();
    if (weekday !== 0 && weekday !== 6) added++;
  }
  return date;
}

const toCents = (amount: string) => Math.round(Number(amount) * 100);
const earliest = (dates: Date[]) => (dates.length ? new Date(Math.min(...dates.map(Number))) : null);
const latest = (dates: Date[]) => (dates.length ? new Date(Math.max(...dates.map(Number))) : null);

// Orders that make up for an earlier one: tagged as such (stores use e.g. "Replacement Package", "commslayer-free-replacement"),
// or free and not a sample/gift. Free influencer samples ("sample-request", "trybe") are marketing, not failures.
const REPLACEMENT_TAG = /replac|reship|re-ship|resend|re-send|ersatz|nachsend|ersättning|ersattning|vervang|warranty|garanti/i;
const NOT_REPLACEMENT_TAG = /sample|trybe|creator|influenc|gift|giveaway|collab|wholesale|\bpr\b/i;

export function isReplacementOrder(order: { totalCents: number; tags: string[]; requiresShipping: boolean; cancelled: boolean }) {
  if (!order.requiresShipping || order.cancelled) return false;
  if (order.tags.some((tag) => REPLACEMENT_TAG.test(tag))) return true;
  return order.totalCents === 0 && !order.tags.some((tag) => NOT_REPLACEMENT_TAG.test(tag));
}

/** The order a replacement makes up for: the same customer's latest earlier order in the store, within 90 days. */
export function findReplacedOrder(order: { id?: string; storeId: string; customerEmail: string; orderDate: Date }) {
  if (!order.customerEmail) return null;
  return getPrisma().order.findFirst({
    where: { storeId: order.storeId, customerEmail: order.customerEmail, isReplacement: false, ...(order.id && { id: { not: order.id } }), orderDate: { lt: order.orderDate, gte: new Date(order.orderDate.getTime() - 90 * DAY) } },
    orderBy: { orderDate: "desc" },
    select: { id: true },
  });
}

/** Pure mapping from a Shopify order to our columns, so it can be tested without a database. */
export function mapShopifyOrder(order: ShopifyOrder, sla: { dispatchSlaDays: number; deliverySlaDays: number }, now = new Date()) {
  const orderDate = new Date(order.createdAt);
  const dispatchDueAt = addWorkingDays(orderDate, sla.dispatchSlaDays);
  const deliveryDueAt = addWorkingDays(orderDate, sla.deliverySlaDays);
  const lines = order.lineItems.nodes.filter((item) => item.currentQuantity > 0);
  // Digital products, gift cards, services: nothing for a factory or carrier to do.
  const needsShipping = lines.some((item) => item.requiresShipping);
  const items = lines.map((item) => ({
    sku: item.sku ?? "",
    name: item.name,
    quantity: item.currentQuantity,
    shippedQuantity: Math.max(0, item.currentQuantity - item.unfulfilledQuantity),
    unitPriceCents: toCents(item.originalUnitPriceSet.shopMoney.amount),
  }));
  const fulfillments = order.fulfillments.filter((fulfillment) => fulfillment.status === "SUCCESS");
  // Only fulfillments with physical items involve a carrier; digital ones never get a delivered date.
  const shipments = fulfillments.filter((fulfillment) => fulfillment.requiresShipping);
  // Carrier data comes only from Shopify: fulfillment creation stands in for carrier collection.
  const carrierCollectedAt = earliest(shipments.map((fulfillment) => new Date(fulfillment.createdAt)));
  const allFulfilled = lines.length > 0 && lines.every((item) => item.unfulfilledQuantity === 0);
  const allShippableSent = lines.filter((item) => item.requiresShipping).every((item) => item.unfulfilledQuantity === 0);
  const allDelivered = shipments.length > 0 && shipments.every((fulfillment) => fulfillment.deliveredAt);
  const deliveredAt = allShippableSent && allDelivered ? latest(shipments.map((fulfillment) => new Date(fulfillment.deliveredAt!))) : null;
  const tracking = shipments.flatMap((fulfillment) => fulfillment.trackingInfo)[0];

  let status: FulfillmentStatus;
  if (order.cancelledAt) status = "cancelled";
  // No SLA applies to orders with nothing to ship, so they are never "delayed".
  else if (!needsShipping) status = allFulfilled ? "completed" : order.displayFulfillmentStatus !== "UNFULFILLED" ? "processing" : "placed";
  else if (deliveredAt) status = "delivered";
  else if ((!carrierCollectedAt && now > dispatchDueAt) || now > deliveryDueAt) status = "delayed";
  else if (carrierCollectedAt) status = "in_transit";
  else if (order.displayFulfillmentStatus !== "UNFULFILLED") status = "processing";
  else status = "placed";

  const events = [{ eventType: "Order placed", details: `Order ${order.name} received from Shopify`, occurredAt: orderDate }];
  for (const fulfillment of fulfillments) {
    if (!fulfillment.requiresShipping) {
      events.push({ eventType: "Fulfilled in Shopify", details: "No shipping required", occurredAt: new Date(fulfillment.createdAt) });
      continue;
    }
    const info = fulfillment.trackingInfo[0];
    events.push({ eventType: "Fulfilled in Shopify", details: [info?.company, info?.number].filter(Boolean).join(" · ") || "No tracking details", occurredAt: new Date(fulfillment.createdAt) });
    if (fulfillment.deliveredAt) events.push({ eventType: "Delivered", details: "Marked delivered in Shopify", occurredAt: new Date(fulfillment.deliveredAt) });
  }
  if (order.cancelledAt) events.push({ eventType: "Order cancelled", details: order.cancelReason ? `Cancelled in Shopify · reason: ${order.cancelReason.toLowerCase()}` : "Cancelled in Shopify", occurredAt: new Date(order.cancelledAt) });
  for (const refund of order.refunds ?? []) if (refund.createdAt) events.push({ eventType: "Refunded", details: "Refund issued in Shopify", occurredAt: new Date(refund.createdAt) });

  return {
    order: {
      shopifyOrderId: order.name,
      customerName: order.shippingAddress?.name ?? order.billingAddress?.name ?? "Unknown customer",
      customerEmail: order.email ?? "",
      market: order.shippingAddress?.countryCodeV2 ?? "—",
      currency: order.currencyCode,
      carrier: tracking?.company || carrierFromShippingLine(order.shippingLine?.title) || "Unassigned",
      trackingNumber: tracking?.number ?? null,
      trackingUrl: tracking?.url ?? null,
      shippingService: order.shippingLine?.title ?? "",
      orderDate,
      dispatchDueAt,
      deliveryDueAt,
      carrierCollectedAt,
      deliveredAt,
      status,
      requiresShipping: needsShipping,
      totalCents: toCents(order.totalPriceSet?.shopMoney.amount ?? "0"),
      refundedCents: toCents(order.totalRefundedSet?.shopMoney.amount ?? "0"),
      refundCount: order.refunds?.length ?? 0,
      firstRefundAt: earliest((order.refunds ?? []).filter((refund) => refund.createdAt).map((refund) => new Date(refund.createdAt!))),
      cancelReason: order.cancelReason ?? null,
      cancelledAt: order.cancelledAt ? new Date(order.cancelledAt) : null,
      financialStatus: order.displayFinancialStatus ?? null,
      tags: order.tags ?? [],
      chargebacks: (order.disputes ?? []).filter((dispute) => dispute.initiatedAs === "CHARGEBACK").length,
      chargebacksLost: (order.disputes ?? []).filter((dispute) => dispute.initiatedAs === "CHARGEBACK" && (dispute.status === "LOST" || dispute.status === "ACCEPTED")).length,
      isReplacement: isReplacementOrder({ totalCents: toCents(order.totalPriceSet?.shopMoney.amount ?? "1"), tags: order.tags ?? [], requiresShipping: needsShipping, cancelled: Boolean(order.cancelledAt) }),
    },
    items,
    events,
  };
}

/** Real refunds only: Shopify also records €0 refunds for order edits. Who did it comes from the timeline event at the same moment. */
export function mapRefunds(refunds: ShopifyRefund[], events: RefundEvent[]) {
  return refunds.flatMap((refund) => {
    const amountCents = toCents(refund.totalRefundedSet.shopMoney.amount);
    if (!refund.createdAt || amountCents <= 0) return [];
    const refundedAt = new Date(refund.createdAt);
    const distance = (event: RefundEvent) => Math.abs(new Date(event.createdAt).getTime() - refundedAt.getTime());
    const event = events.filter((candidate) => distance(candidate) <= 60_000).sort((a, b) => distance(a) - distance(b))[0];
    return [{ shopifyGid: refund.id, amountCents, note: refund.note?.trim() || null, refundedBy: event?.author ?? null, refundedAt }];
  });
}

/** A failed lookup must not fail the order sync; the name is filled in the next time the order syncs. */
async function refundEvents(store: ShopifyStore, token: string, orderId: string) {
  try {
    const data = await adminGraphql<{ order: { events: { nodes: RefundEvent[] } } | null }>(store.shopDomain, token, REFUND_EVENTS_QUERY, { id: orderId });
    return data.order?.events.nodes ?? [];
  } catch (error) {
    console.error(`[shopify] ${store.shopDomain}: refund events for ${orderId}: ${error instanceof Error ? error.message : error}`);
    return [];
  }
}

async function saveOrder(store: ShopifyStore, token: string, shopifyOrder: ShopifyOrder) {
  const mapped = mapShopifyOrder(shopifyOrder, store);
  const { items, events } = mapped;
  const prisma = getPrisma();
  const replacementFor = mapped.order.isReplacement ? await findReplacedOrder({ storeId: store.id, customerEmail: mapped.order.customerEmail, orderDate: mapped.order.orderDate }) : null;
  const order = { ...mapped.order, eurRate: await eurRate(mapped.order.currency, mapped.order.orderDate), replacementForId: replacementFor?.id ?? null };
  const paidRefunds = mapRefunds(shopifyOrder.refunds ?? [], []);
  const refunds = paidRefunds.length ? mapRefunds(shopifyOrder.refunds ?? [], await refundEvents(store, token, shopifyOrder.id)) : [];
  await prisma.$transaction(async (tx) => {
    const { id } = await tx.order.upsert({
      // The (storeId, shopifyGid) unique key is what guarantees an order is never imported twice.
      where: { storeId_shopifyGid: { storeId: store.id, shopifyGid: shopifyOrder.id } },
      // Factory isn't known to Shopify; set once on create so a later manual assignment isn't overwritten.
      create: { ...order, storeId: store.id, shopifyGid: shopifyOrder.id, factoryName: "Unassigned" },
      update: order,
      select: { id: true },
    });
    await tx.orderItem.deleteMany({ where: { orderId: id } });
    await tx.orderItem.createMany({ data: items.map((item) => ({ ...item, orderId: id })) });
    await tx.fulfillmentEvent.deleteMany({ where: { orderId: id, source: "shopify" } });
    await tx.fulfillmentEvent.createMany({ data: events.map((event) => ({ ...event, orderId: id, source: "shopify" as const })) });
    for (const { refundedBy, ...refund } of refunds) {
      await tx.refund.upsert({
        where: { shopifyGid: refund.shopifyGid },
        create: { ...refund, refundedBy, orderId: id },
        // Keep a known name if this sync's timeline lookup failed.
        update: { ...refund, ...(refundedBy && { refundedBy }) },
      });
    }
  });
}

// Shared across module copies in one process so the scheduler and "Sync now" don't overlap on a store.
// Also the live progress shown on the Stores page.
type SyncProgress = { startedAt: Date; imported: number };
const running: Map<string, SyncProgress> = ((globalThis as { shopifySyncProgress?: Map<string, SyncProgress> }).shopifySyncProgress ??= new Map());
export const getSyncProgress = (storeId: string) => running.get(storeId);

export async function syncStore(storeId: string) {
  if (running.has(storeId)) return { imported: 0, skipped: true };
  const progress: SyncProgress = { startedAt: new Date(), imported: 0 };
  running.set(storeId, progress);
  const prisma = getPrisma();
  try {
    const store = await prisma.shopifyStore.findUniqueOrThrow({ where: { id: storeId } });
    const startedAt = new Date();
    // Re-read a 5-minute overlap; upserts make the overlap harmless.
    const since = store.lastSyncedAt ? new Date(store.lastSyncedAt.getTime() - 5 * 60 * 1000) : new Date(Date.now() - 60 * DAY);
    const token = await accessTokenFor(store);
    let cursor: string | null = null;
    let imported = 0;
    do {
      const from = store.importOrdersFrom;
      const query = `updated_at:>='${since.toISOString()}'${from ? ` AND created_at:>='${from.toISOString()}'` : ""}`;
      const page: OrdersPage = await adminGraphql<OrdersPage>(store.shopDomain, token, ORDERS_QUERY, { cursor, query });
      // Second guard in case Shopify ever ignores the created_at filter. Orders are independent, so a page saves in parallel.
      await runInBatches(page.orders.nodes.filter((order) => !from || new Date(order.createdAt) >= from), (order) => saveOrder(store, token, order));
      imported += page.orders.nodes.length;
      progress.imported = imported;
      cursor = page.orders.pageInfo.hasNextPage ? page.orders.pageInfo.endCursor : null;
    } while (cursor);
    await prisma.shopifyStore.update({ where: { id: storeId }, data: { lastSyncedAt: startedAt, lastSyncError: null } });
    // New orders may be what waiting support tickets refer to.
    await linkTickets();
    await recomputeFailures(storeId);
    return { imported, skipped: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.shopifyStore.update({ where: { id: storeId }, data: { lastSyncError: message.slice(0, 500) } }).catch(() => {});
    throw error;
  } finally {
    running.delete(storeId);
  }
}

export async function syncAllStores() {
  const stores = await getPrisma().shopifyStore.findMany({ where: { accessToken: { not: null } }, select: { id: true, shopDomain: true } });
  for (const store of stores) {
    try {
      const result = await syncStore(store.id);
      console.log(`[shopify] ${store.shopDomain}: ${result.skipped ? "already syncing" : `${result.imported} orders synced`}`);
    } catch (error) {
      console.error(`[shopify] ${store.shopDomain}: ${error instanceof Error ? error.message : error}`);
    }
  }
}
