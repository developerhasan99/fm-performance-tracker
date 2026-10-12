import { createHmac, timingSafeEqual } from "node:crypto";
import type { FulfillmentStatus, ShopifyStore } from "@prisma/client";
import { decrypt, encrypt } from "@/lib/encryption";
import { getPrisma } from "@/lib/prisma";

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
      id name email createdAt cancelledAt displayFulfillmentStatus currencyCode
      shippingAddress { name countryCodeV2 }
      billingAddress { name }
      shippingLine { title }
      lineItems(first: 50) { nodes { sku name currentQuantity unfulfilledQuantity originalUnitPriceSet { shopMoney { amount } } } }
      fulfillments(first: 10) { status createdAt deliveredAt trackingInfo(first: 1) { company number } }
    }
  }
}`;

export type ShopifyOrder = {
  id: string;
  name: string;
  email: string | null;
  createdAt: string;
  cancelledAt: string | null;
  displayFulfillmentStatus: string;
  currencyCode: string;
  shippingAddress: { name: string | null; countryCodeV2: string | null } | null;
  billingAddress: { name: string | null } | null;
  shippingLine: { title: string } | null;
  lineItems: { nodes: { sku: string | null; name: string; currentQuantity: number; unfulfilledQuantity: number; originalUnitPriceSet: { shopMoney: { amount: string } } }[] };
  fulfillments: { status: string; createdAt: string; deliveredAt: string | null; trackingInfo: { company: string | null; number: string | null }[] }[];
};

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

const toCents = (amount: string) => Math.round(Number(amount) * 100);
const earliest = (dates: Date[]) => (dates.length ? new Date(Math.min(...dates.map(Number))) : null);
const latest = (dates: Date[]) => (dates.length ? new Date(Math.max(...dates.map(Number))) : null);

/** Pure mapping from a Shopify order to our columns, so it can be tested without a database. */
export function mapShopifyOrder(order: ShopifyOrder, sla: { dispatchSlaDays: number; deliverySlaDays: number }, now = new Date()) {
  const orderDate = new Date(order.createdAt);
  const dispatchDueAt = new Date(orderDate.getTime() + sla.dispatchSlaDays * DAY);
  const deliveryDueAt = new Date(orderDate.getTime() + sla.deliverySlaDays * DAY);
  const items = order.lineItems.nodes
    .filter((item) => item.currentQuantity > 0)
    .map((item) => ({
      sku: item.sku ?? "",
      name: item.name,
      quantity: item.currentQuantity,
      shippedQuantity: Math.max(0, item.currentQuantity - item.unfulfilledQuantity),
      unitPriceCents: toCents(item.originalUnitPriceSet.shopMoney.amount),
    }));
  const fulfillments = order.fulfillments.filter((fulfillment) => fulfillment.status === "SUCCESS");
  // ponytail: fulfillment creation is treated as carrier collection; swap in carrier scan events once a carrier feed exists.
  const carrierCollectedAt = earliest(fulfillments.map((fulfillment) => new Date(fulfillment.createdAt)));
  const allShipped = items.length > 0 && items.every((item) => item.shippedQuantity >= item.quantity);
  const allDelivered = fulfillments.length > 0 && fulfillments.every((fulfillment) => fulfillment.deliveredAt);
  const deliveredAt = allShipped && allDelivered ? latest(fulfillments.map((fulfillment) => new Date(fulfillment.deliveredAt!))) : null;
  const tracking = fulfillments.flatMap((fulfillment) => fulfillment.trackingInfo)[0];

  let status: FulfillmentStatus;
  if (order.cancelledAt) status = "cancelled";
  else if (deliveredAt) status = "delivered";
  else if ((!carrierCollectedAt && now > dispatchDueAt) || now > deliveryDueAt) status = "delayed";
  else if (carrierCollectedAt) status = "in_transit";
  else if (order.displayFulfillmentStatus !== "UNFULFILLED") status = "processing";
  else status = "placed";

  const events = [{ eventType: "Order placed", details: `Order ${order.name} received from Shopify`, occurredAt: orderDate }];
  for (const fulfillment of fulfillments) {
    const info = fulfillment.trackingInfo[0];
    events.push({ eventType: "Fulfilled in Shopify", details: [info?.company, info?.number].filter(Boolean).join(" · ") || "No tracking details", occurredAt: new Date(fulfillment.createdAt) });
    if (fulfillment.deliveredAt) events.push({ eventType: "Delivered", details: "Marked delivered in Shopify", occurredAt: new Date(fulfillment.deliveredAt) });
  }
  if (order.cancelledAt) events.push({ eventType: "Order cancelled", details: "Cancelled in Shopify", occurredAt: new Date(order.cancelledAt) });

  return {
    order: {
      shopifyOrderId: order.name,
      customerName: order.shippingAddress?.name ?? order.billingAddress?.name ?? "Unknown customer",
      customerEmail: order.email ?? "",
      market: order.shippingAddress?.countryCodeV2 ?? "—",
      currency: order.currencyCode,
      carrier: tracking?.company ?? "Unassigned",
      shippingService: order.shippingLine?.title ?? "",
      orderDate,
      dispatchDueAt,
      deliveryDueAt,
      carrierCollectedAt,
      deliveredAt,
      status,
    },
    items,
    events,
  };
}

async function saveOrder(store: ShopifyStore, shopifyOrder: ShopifyOrder) {
  const { order, items, events } = mapShopifyOrder(shopifyOrder, store);
  await getPrisma().$transaction(async (tx) => {
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
  });
}

// Shared across module copies in one process so the scheduler and "Sync now" don't overlap on a store.
const running: Set<string> = ((globalThis as { shopifySyncRunning?: Set<string> }).shopifySyncRunning ??= new Set());

export async function syncStore(storeId: string) {
  if (running.has(storeId)) return { imported: 0, skipped: true };
  running.add(storeId);
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
      const page: OrdersPage = await adminGraphql<OrdersPage>(store.shopDomain, token, ORDERS_QUERY, { cursor, query: `updated_at:>='${since.toISOString()}'` });
      for (const order of page.orders.nodes) await saveOrder(store, order);
      imported += page.orders.nodes.length;
      cursor = page.orders.pageInfo.hasNextPage ? page.orders.pageInfo.endCursor : null;
    } while (cursor);
    await prisma.shopifyStore.update({ where: { id: storeId }, data: { lastSyncedAt: startedAt, lastSyncError: null } });
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
