import type { FulfillmentStatus, IssueCategory } from "@prisma/client";

export type OrderSummary = {
  id: string;
  shopifyOrderId: string;
  customerName: string;
  customerEmail: string;
  market: string;
  currency: string;
  factoryName: string;
  carrier: string;
  shippingService: string;
  orderDate: Date;
  dispatchDueAt: Date;
  deliveryDueAt: Date;
  factoryReceivedAt: Date | null;
  pickedAt: Date | null;
  packedAt: Date | null;
  carrierCollectedAt: Date | null;
  deliveredAt: Date | null;
  status: FulfillmentStatus;
  isSampleData: boolean;
  requiresShipping: boolean;
  store: { name: string; shopDomain: string; customDomain: string | null } | null;
  items: {
    id: string;
    sku: string;
    name: string;
    quantity: number;
    shippedQuantity: number;
    unitPriceCents: number;
  }[];
  contacts: {
    id: string;
    category: IssueCategory;
    resolution: string;
    channel: string;
    contactedAt: Date;
    refundAmountCents: number;
    replacementCostCents: number;
    handlingMinutes: number;
  }[];
  events: {
    id: string;
    source: string;
    eventType: string;
    details: string | null;
    occurredAt: Date;
  }[];
};

const day = 24 * 60 * 60 * 1000;
const now = Date.now();
type SampleSeed = {
  reference: string;
  customer: string;
  email: string;
  daysAgo: number;
  status: FulfillmentStatus;
  factory: string;
  carrier: string;
  items: { name: string; sku: string; quantity: number; shipped: number }[];
  issue?: { category: IssueCategory; refund: number; replacement: number };
};

const samples: SampleSeed[] = [
  { reference: "#10482", customer: "Olivia Bennett", email: "olivia.bennett@example.com", daysAgo: 1, status: "in_transit", factory: "Northstar Fulfilment", carrier: "Royal Mail", items: [{ name: "Everyday ceramic mug", sku: "MUG-01", quantity: 2, shipped: 2 }] },
  { reference: "#10481", customer: "James Wilson", email: "j.wilson@example.com", daysAgo: 2, status: "delivered", factory: "Northstar Fulfilment", carrier: "DPD", items: [{ name: "Linen cushion cover", sku: "LIN-04", quantity: 1, shipped: 1 }, { name: "Woven throw", sku: "WOV-02", quantity: 1, shipped: 1 }] },
  { reference: "#10480", customer: "Amara Patel", email: "amara.patel@example.com", daysAgo: 3, status: "delayed", factory: "Meadow & Mill", carrier: "Evri", items: [{ name: "Oak serving board", sku: "OAK-03", quantity: 1, shipped: 0 }], issue: { category: "not_dispatched", refund: 0, replacement: 0 } },
  { reference: "#10479", customer: "Charlotte Hughes", email: "charlotte.hughes@example.com", daysAgo: 4, status: "delivered", factory: "Meadow & Mill", carrier: "Royal Mail", items: [{ name: "Linen tea towel set", sku: "LIN-08", quantity: 2, shipped: 1 }], issue: { category: "missing_item", refund: 1200, replacement: 0 } },
  { reference: "#10478", customer: "Noah Williams", email: "noah.w@example.com", daysAgo: 5, status: "delivered", factory: "Northstar Fulfilment", carrier: "DPD", items: [{ name: "Stoneware vase", sku: "STN-12", quantity: 1, shipped: 1 }] },
  { reference: "#10477", customer: "Isla Thompson", email: "isla.t@example.com", daysAgo: 6, status: "processing", factory: "Meadow & Mill", carrier: "Evri", items: [{ name: "Woven throw", sku: "WOV-02", quantity: 1, shipped: 0 }] },
  { reference: "#10476", customer: "Ethan Clarke", email: "ethan.clarke@example.com", daysAgo: 8, status: "delivered", factory: "Northstar Fulfilment", carrier: "Royal Mail", items: [{ name: "Everyday ceramic mug", sku: "MUG-01", quantity: 1, shipped: 1 }], issue: { category: "late_delivery", refund: 800, replacement: 0 } },
  { reference: "#10475", customer: "Maya Robinson", email: "maya.robinson@example.com", daysAgo: 10, status: "delivered", factory: "Meadow & Mill", carrier: "DPD", items: [{ name: "Oak serving board", sku: "OAK-03", quantity: 1, shipped: 1 }] },
  { reference: "#10474", customer: "Freddie Cooper", email: "freddie.cooper@example.com", daysAgo: 12, status: "delivered", factory: "Northstar Fulfilment", carrier: "Evri", items: [{ name: "Stoneware vase", sku: "STN-12", quantity: 1, shipped: 1 }] },
  { reference: "#10473", customer: "Grace Morgan", email: "grace.morgan@example.com", daysAgo: 15, status: "delivered", factory: "Meadow & Mill", carrier: "Royal Mail", items: [{ name: "Linen cushion cover", sku: "LIN-04", quantity: 2, shipped: 2 }], issue: { category: "damaged", refund: 0, replacement: 1800 } },
  { reference: "#10472", customer: "Leo Foster", email: "leo.foster@example.com", daysAgo: 19, status: "delivered", factory: "Northstar Fulfilment", carrier: "DPD", items: [{ name: "Woven throw", sku: "WOV-02", quantity: 1, shipped: 1 }] },
  { reference: "#10471", customer: "Zara Edwards", email: "zara.edwards@example.com", daysAgo: 25, status: "delivered", factory: "Meadow & Mill", carrier: "Evri", items: [{ name: "Everyday ceramic mug", sku: "MUG-01", quantity: 1, shipped: 1 }] },
];

const dateAt = (daysAgo: number, daysAfterOrder: number) =>
  new Date(now - (daysAgo - daysAfterOrder) * day);

export const demoOrders: OrderSummary[] = samples.map((sample, index) => {
  const orderDate = dateAt(sample.daysAgo, 0);
  const factoryReceivedAt = dateAt(sample.daysAgo, 0.2);
  const pickedAt = sample.status === "placed" || sample.status === "delayed" ? null : dateAt(sample.daysAgo, 0.8);
  const packedAt = pickedAt ? dateAt(sample.daysAgo, 1.1) : null;
  const carrierCollectedAt =
    sample.status === "placed" || sample.status === "processing" || sample.status === "delayed"
      ? null
      : dateAt(sample.daysAgo, 1.8);
  const deliveredAt = sample.status === "delivered"
    ? dateAt(sample.daysAgo, Math.min(index === 5 || index === 9 ? 7 : 4.4, sample.daysAgo - 0.1))
    : null;
  const events: OrderSummary["events"] = [
    { id: `${sample.reference}-order`, source: "shopify", eventType: "Order placed", details: "Order received from Shopify", occurredAt: orderDate },
    { id: `${sample.reference}-factory`, source: "factory", eventType: "Received by factory", details: sample.factory, occurredAt: factoryReceivedAt },
  ];
  if (pickedAt && packedAt) events.push({ id: `${sample.reference}-picked`, source: "factory", eventType: "Picked and packed", details: "Items checked and packed for dispatch", occurredAt: packedAt });
  if (carrierCollectedAt) events.push({ id: `${sample.reference}-carrier`, source: "carrier", eventType: "Collected by carrier", details: `${sample.carrier} · tracked service`, occurredAt: carrierCollectedAt });
  if (deliveredAt) events.push({ id: `${sample.reference}-delivered`, source: "carrier", eventType: "Delivered", details: "Proof of delivery received", occurredAt: deliveredAt });
  if (sample.issue) events.push({ id: `${sample.reference}-support`, source: "support", eventType: "Customer contacted support", details: sample.issue.category.replaceAll("_", " "), occurredAt: dateAt(sample.daysAgo, Math.min(4.8, sample.daysAgo - 0.1)) });

  return {
    id: `sample-${sample.reference.slice(1)}`,
    shopifyOrderId: sample.reference,
    customerName: sample.customer,
    customerEmail: sample.email,
    market: "UK",
    currency: "GBP",
    factoryName: sample.factory,
    carrier: sample.carrier,
    shippingService: "Standard",
    orderDate,
    dispatchDueAt: dateAt(sample.daysAgo, 2),
    deliveryDueAt: dateAt(sample.daysAgo, 6),
    factoryReceivedAt,
    pickedAt,
    packedAt,
    carrierCollectedAt,
    deliveredAt,
    status: sample.status,
    isSampleData: true,
    requiresShipping: true,
    store: null,
    items: sample.items.map((item, itemIndex) => ({ id: `${sample.reference}-item-${itemIndex}`, sku: item.sku, name: item.name, quantity: item.quantity, shippedQuantity: item.shipped, unitPriceCents: 2400 })),
    contacts: sample.issue ? [{
      id: `${sample.reference}-contact`,
      category: sample.issue.category,
      resolution: "resolved",
      channel: "email",
      contactedAt: dateAt(sample.daysAgo, Math.min(4.8, sample.daysAgo - 0.1)),
      refundAmountCents: sample.issue.refund,
      replacementCostCents: sample.issue.replacement,
      handlingMinutes: 12,
    }] : [],
    events: events.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime()),
  };
});
