import { EventSource, FulfillmentStatus, IssueCategory, IssueResolution, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required to seed the database.");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const day = 24 * 60 * 60 * 1000;

const samples = [
  { status: FulfillmentStatus.delivered, factory: "Northstar Fulfilment", carrier: "Royal Mail", item: "Everyday ceramic mug", sku: "MUG-01", quantity: 2, shipped: 2 },
  { status: FulfillmentStatus.delivered, factory: "Northstar Fulfilment", carrier: "DPD", item: "Linen cushion cover", sku: "LIN-04", quantity: 1, shipped: 1 },
  { status: FulfillmentStatus.delivered, factory: "Meadow & Mill", carrier: "Evri", item: "Oak serving board", sku: "OAK-03", quantity: 1, shipped: 1 },
  { status: FulfillmentStatus.delivered, factory: "Meadow & Mill", carrier: "Royal Mail", item: "Linen tea towel set", sku: "LIN-08", quantity: 2, shipped: 1 },
  { status: FulfillmentStatus.delivered, factory: "Northstar Fulfilment", carrier: "DPD", item: "Stoneware vase", sku: "STN-12", quantity: 1, shipped: 1 },
  { status: FulfillmentStatus.processing, factory: "Meadow & Mill", carrier: "Evri", item: "Woven throw", sku: "WOV-02", quantity: 1, shipped: 0 },
  { status: FulfillmentStatus.delivered, factory: "Northstar Fulfilment", carrier: "Royal Mail", item: "Everyday ceramic mug", sku: "MUG-01", quantity: 1, shipped: 1 },
  { status: FulfillmentStatus.delivered, factory: "Meadow & Mill", carrier: "DPD", item: "Oak serving board", sku: "OAK-03", quantity: 1, shipped: 1 },
  { status: FulfillmentStatus.delayed, factory: "Meadow & Mill", carrier: "Evri", item: "Linen cushion cover", sku: "LIN-04", quantity: 2, shipped: 0 },
  { status: FulfillmentStatus.delivered, factory: "Northstar Fulfilment", carrier: "DPD", item: "Woven throw", sku: "WOV-02", quantity: 1, shipped: 1 },
  { status: FulfillmentStatus.in_transit, factory: "Northstar Fulfilment", carrier: "Evri", item: "Stoneware vase", sku: "STN-12", quantity: 1, shipped: 1 },
  { status: FulfillmentStatus.delivered, factory: "Meadow & Mill", carrier: "Royal Mail", item: "Everyday ceramic mug", sku: "MUG-01", quantity: 1, shipped: 1 },
] as const;

const customers = [
  ["Olivia Bennett", "olivia.bennett@example.com"],
  ["James Wilson", "j.wilson@example.com"],
  ["Amara Patel", "amara.patel@example.com"],
  ["Charlotte Hughes", "charlotte.hughes@example.com"],
  ["Noah Williams", "noah.w@example.com"],
  ["Isla Thompson", "isla.t@example.com"],
  ["Ethan Clarke", "ethan.clarke@example.com"],
  ["Maya Robinson", "maya.robinson@example.com"],
  ["Freddie Cooper", "freddie.cooper@example.com"],
  ["Grace Morgan", "grace.morgan@example.com"],
  ["Leo Foster", "leo.foster@example.com"],
  ["Zara Edwards", "zara.edwards@example.com"],
] as const;

function orderTime(daysAgo: number, daysAfterOrder = 0) {
  return new Date(Date.now() - (daysAgo - daysAfterOrder) * day);
}

function eventTime(daysAgo: number, daysAfterOrder: number) {
  const elapsed = Math.min(daysAfterOrder, Math.max(0.1, daysAgo - 0.1));
  return orderTime(daysAgo, elapsed);
}

async function main() {
  const existingOrders = await prisma.order.count();
  if (existingOrders > 0) {
    throw new Error(`Refusing to seed a database that already contains ${existingOrders} orders.`);
  }

  for (let index = 0; index < 48; index++) {
    const sample = samples[index % samples.length];
    const customer = customers[(index * 5 + 2) % customers.length];
    const daysAgo = 5.5 + ((index * 7) % 24);
    const placedAt = orderTime(daysAgo);
    const receivedAt = eventTime(daysAgo, 0.2);
    const hasCarrier = sample.status === FulfillmentStatus.delivered || sample.status === FulfillmentStatus.in_transit;
    const pickedAt = sample.shipped > 0 ? eventTime(daysAgo, 0.9) : null;
    const packedAt = pickedAt ? eventTime(daysAgo, 1.1) : null;
    const carrierCollectedAt = hasCarrier ? eventTime(daysAgo, 1.8) : null;
    const isLate = index % 7 === 0 && daysAgo > 7.1;
    const deliveredAt = sample.status === FulfillmentStatus.delivered
      ? eventTime(daysAgo, isLate && daysAgo > 7 ? 7 : Math.min(4.5, daysAgo - 0.1))
      : null;
    const hasIssue = [3, 6, 8, 13, 18, 22, 29, 34, 39, 45].includes(index);
    const issueCategory =
      index % 3 === 0 ? IssueCategory.missing_item :
      index % 3 === 1 ? IssueCategory.late_delivery : IssueCategory.damaged;

    await prisma.order.create({
      data: {
        id: `seed-order-${index}`,
        shopifyOrderId: `#${10400 + index}`,
        customerName: customer[0],
        customerEmail: customer[1],
        factoryName: sample.factory,
        carrier: sample.carrier,
        shippingService: "Standard",
        orderDate: placedAt,
        dispatchDueAt: orderTime(daysAgo, 2),
        deliveryDueAt: orderTime(daysAgo, 6),
        factoryReceivedAt: receivedAt,
        pickedAt,
        packedAt,
        carrierCollectedAt,
        deliveredAt,
        status: sample.status,
        isSampleData: true,
        items: {
          create: {
            sku: sample.sku,
            name: sample.item,
            quantity: sample.quantity,
            shippedQuantity: sample.shipped,
            unitPriceCents: 2400 + (index % 4) * 500,
          },
        },
        events: {
          create: [
            { source: EventSource.shopify, eventType: "Order placed", details: "Order received from Shopify", occurredAt: placedAt },
            { source: EventSource.factory, eventType: "Received by factory", details: sample.factory, occurredAt: receivedAt },
            ...(pickedAt && packedAt ? [{ source: EventSource.factory, eventType: "Picked and packed", details: "Items checked and packed for dispatch", occurredAt: packedAt }] : []),
            ...(carrierCollectedAt ? [{ source: EventSource.carrier, eventType: "Collected by carrier", details: `${sample.carrier} · tracked service`, occurredAt: carrierCollectedAt }] : []),
            ...(deliveredAt ? [{ source: EventSource.carrier, eventType: "Delivered", details: "Proof of delivery received", occurredAt: deliveredAt }] : []),
            ...(hasIssue ? [{ source: EventSource.support, eventType: "Customer contacted support", details: issueCategory.replaceAll("_", " "), occurredAt: eventTime(daysAgo, 5) }] : []),
          ],
        },
        ...(hasIssue ? {
          contacts: {
            create: {
              category: issueCategory,
              resolution: IssueResolution.resolved,
              channel: "email",
              contactedAt: eventTime(daysAgo, 5),
              refundAmountCents: index % 2 === 0 ? 1200 : 0,
              replacementCostCents: index % 2 === 0 ? 0 : 1800,
              handlingMinutes: 12 + (index % 3) * 4,
            },
          },
        } : {}),
      },
    });
  }
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error("Database seeding failed:", error);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
