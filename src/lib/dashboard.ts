import { FulfillmentStatus, IssueCategory, Prisma } from "@prisma/client";
import { demoOrders, type OrderSummary } from "@/lib/demo-data";
import { getPrisma } from "@/lib/prisma";

const orderInclude = {
  items: true,
  contacts: true,
  events: { orderBy: { occurredAt: "asc" as const } },
} satisfies Prisma.OrderInclude;

const isDemoMode = () => process.env.DASHBOARD_DEMO_MODE === "true";

async function allOrders(): Promise<OrderSummary[]> {
  if (isDemoMode()) return demoOrders;
  return getPrisma().order.findMany({
    where: {
      orderDate: {
        gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      },
    },
    include: orderInclude,
    orderBy: { orderDate: "desc" },
  });
}

export const statusLabels: Record<FulfillmentStatus, string> = {
  placed: "Order placed",
  processing: "Processing",
  in_transit: "In transit",
  delivered: "Delivered",
  delayed: "Delayed",
  cancelled: "Cancelled",
};

export const issueLabels: Record<IssueCategory, string> = {
  late_delivery: "Late delivery",
  not_dispatched: "Not dispatched",
  lost_in_transit: "Lost in transit",
  missing_item: "Missing item",
  wrong_item: "Wrong item",
  damaged: "Damaged",
  address_error: "Address / customer error",
  cancellation: "Cancellation",
  other: "Other",
};

export function formatCurrency(amountCents: number, currency = "GBP") {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amountCents / 100);
}

export function formatDate(date: Date, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-GB", options ?? {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

const isInFull = (order: OrderSummary) =>
  order.items.length > 0 && order.items.every((item) => item.shippedQuantity >= item.quantity);
const isOnTime = (order: OrderSummary) =>
  order.deliveredAt !== null && order.deliveredAt.getTime() <= order.deliveryDueAt.getTime();

export async function getDashboardSnapshot() {
  const orders = await allOrders();
  const now = new Date();
  const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const current = orders.filter((order) => order.orderDate >= cutoff && order.status !== "cancelled");
  const delivered = current.filter((order) => order.deliveredAt);
  const otif = delivered.filter((order) => isOnTime(order) && isInFull(order));
  const dispatchEligible = current.filter(
    (order) => order.carrierCollectedAt || order.dispatchDueAt <= now,
  );
  const dispatchOnTime = dispatchEligible.filter(
    (order) => order.carrierCollectedAt && order.carrierCollectedAt.getTime() <= order.dispatchDueAt.getTime(),
  );
  const contacted = current.filter((order) => order.contacts.length > 0);
  const transitDays = delivered.filter((order) => order.carrierCollectedAt).map(
    (order) => (order.deliveredAt!.getTime() - order.carrierCollectedAt!.getTime()) / 86_400_000,
  );

  const dailyDeliveries = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now);
    date.setDate(now.getDate() - (6 - index));
    date.setHours(0, 0, 0, 0);
    const nextDay = new Date(date);
    nextDay.setDate(date.getDate() + 1);
    const dayOrders = delivered.filter((order) => order.deliveredAt! >= date && order.deliveredAt! < nextDay);
    return {
      day: new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(date),
      date: new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(date),
      total: dayOrders.length,
      late: dayOrders.filter((order) => !isOnTime(order)).length,
    };
  });

  const issueCounts = new Map<IssueCategory, number>();
  const failureCosts = new Map<string, number>();
  let totalHandlingMinutes = 0;
  for (const order of current) {
    for (const contact of order.contacts) {
      issueCounts.set(contact.category, (issueCounts.get(contact.category) ?? 0) + 1);
      failureCosts.set(
        order.currency,
        (failureCosts.get(order.currency) ?? 0) +
          contact.refundAmountCents +
          contact.replacementCostCents,
      );
      totalHandlingMinutes += contact.handlingMinutes;
    }
  }
  const issueBreakdown = [...issueCounts.entries()]
    .map(([category, count]) => ({ category, label: issueLabels[category], count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);

  const factories = new Map<string, { dispatched: OrderSummary[]; dispatchEligible: OrderSummary[]; picked: OrderSummary[] }>();
  const carriers = new Map<string, { delivered: OrderSummary[]; onTime: number }>();
  for (const order of current) {
    const factory = factories.get(order.factoryName) ?? { dispatched: [], dispatchEligible: [], picked: [] };
    if (order.carrierCollectedAt) factory.dispatched.push(order);
    if (order.carrierCollectedAt || order.dispatchDueAt <= now) factory.dispatchEligible.push(order);
    if (order.packedAt) factory.picked.push(order);
    factories.set(order.factoryName, factory);
    if (order.deliveredAt) {
      const carrier = carriers.get(order.carrier) ?? { delivered: [], onTime: 0 };
      carrier.delivered.push(order);
      if (isOnTime(order)) carrier.onTime++;
      carriers.set(order.carrier, carrier);
    }
  }

  return {
    hasSampleData: isDemoMode() || current.some((order) => order.isSampleData),
    totalOrders: current.length,
    deliveredCount: delivered.length,
    otifRate: delivered.length ? Math.round((otif.length / delivered.length) * 100) : 0,
    otifNumerator: otif.length,
    dispatchRate: dispatchEligible.length ? Math.round((dispatchOnTime.length / dispatchEligible.length) * 100) : 0,
    dispatchNumerator: dispatchOnTime.length,
    dispatchEligibleCount: dispatchEligible.length,
    issueRate: current.length ? Math.round((contacted.length / current.length) * 100) : 0,
    issueOrders: contacted.length,
    avgTransitDays: transitDays.length ? transitDays.reduce((sum, value) => sum + value, 0) / transitDays.length : 0,
    failureCosts: [...failureCosts.entries()].map(([currency, amount]) => ({
      currency,
      amount,
      formatted: formatCurrency(amount, currency),
    })),
    totalHandlingMinutes,
    dailyDeliveries,
    stages: [
      { label: "Orders placed", count: current.length },
      { label: "Picked & packed", count: current.filter((order) => order.pickedAt && order.packedAt).length },
      { label: "With carrier", count: current.filter((order) => order.carrierCollectedAt).length },
      { label: "Delivered", count: delivered.length },
    ],
    issueBreakdown,
    factoryScorecards: [...factories.entries()].map(([name, score]) => ({
      name,
      dispatchRate: score.dispatchEligible.length
        ? Math.round((score.dispatched.filter((order) => order.carrierCollectedAt!.getTime() <= order.dispatchDueAt.getTime()).length / score.dispatchEligible.length) * 100)
        : null,
      pickAccuracy: score.picked.length
        ? Math.round((score.picked.filter(isInFull).length / score.picked.length) * 100)
        : null,
    })),
    carrierScorecards: [...carriers.entries()].map(([name, score]) => ({
      name,
      onTimeRate: score.delivered.length ? Math.round((score.onTime / score.delivered.length) * 100) : 0,
    })),
    recentOrders: current.slice(0, 6),
  };
}

export async function getOrders(search: string, status?: FulfillmentStatus) {
  if (isDemoMode()) {
    const query = search.trim().toLowerCase();
    return demoOrders.filter((order) => {
      const matchesSearch = !query || [
        order.shopifyOrderId, order.customerName, order.customerEmail, order.factoryName, order.carrier,
      ].some((value) => value.toLowerCase().includes(query));
      return matchesSearch && (!status || order.status === status);
    });
  }

  const query = search.trim();
  return getPrisma().order.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(query ? { OR: [
        { shopifyOrderId: { contains: query, mode: "insensitive" } },
        { customerName: { contains: query, mode: "insensitive" } },
        { customerEmail: { contains: query, mode: "insensitive" } },
        { factoryName: { contains: query, mode: "insensitive" } },
        { carrier: { contains: query, mode: "insensitive" } },
      ] } : {}),
    },
    include: orderInclude,
    orderBy: { orderDate: "desc" },
  });
}

export async function getOrderByReference(reference: string) {
  if (isDemoMode()) return demoOrders.find((order) => order.shopifyOrderId === reference) ?? null;
  return getPrisma().order.findUnique({
    where: { shopifyOrderId: reference },
    include: orderInclude,
  });
}
