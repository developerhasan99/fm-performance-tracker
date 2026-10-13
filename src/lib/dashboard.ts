import { FulfillmentStatus, IssueCategory, Prisma } from "@prisma/client";
import { demoOrders, type OrderSummary } from "@/lib/demo-data";
import { getPrisma } from "@/lib/prisma";

const orderInclude = {
  items: true,
  contacts: true,
  store: { select: { name: true, shopDomain: true, customDomain: true } },
  events: { orderBy: { occurredAt: "asc" as const } },
} satisfies Prisma.OrderInclude;

const isDemoMode = () => process.env.DASHBOARD_DEMO_MODE === "true";

async function allOrders(): Promise<OrderSummary[]> {
  if (isDemoMode()) return demoOrders;
  return getPrisma().order.findMany({
    where: {
      requiresShipping: true,
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
  completed: "Completed",
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
  // Fulfilment metrics cover physical orders only; cancelled and no-shipping orders are left out.
  const current = orders.filter((order) => order.orderDate >= cutoff && order.status !== "cancelled" && order.requiresShipping);
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

export const ORDERS_PAGE_SIZE = 50;

export type OrderFilters = {
  search: string;
  status?: FulfillmentStatus;
  storeId?: string;
  /** Include orders with nothing to ship (hidden by default). */
  includeNoShipping?: boolean;
  /** Order date range: from is inclusive, before is exclusive. */
  from?: Date;
  before?: Date;
  page: number;
};

/** One page of orders (1-based) plus the total match count. */
export async function getOrders({ search, status, storeId, includeNoShipping, from, before, page }: OrderFilters) {
  const skip = (page - 1) * ORDERS_PAGE_SIZE;
  if (isDemoMode()) {
    const query = search.trim().toLowerCase();
    const matches = demoOrders.filter((order) => {
      const matchesSearch = !query || [
        order.shopifyOrderId, order.customerName, order.customerEmail, order.factoryName, order.carrier,
      ].some((value) => value.toLowerCase().includes(query));
      return matchesSearch && (!status || order.status === status) && !storeId && (includeNoShipping || order.requiresShipping) && (!from || order.orderDate >= from) && (!before || order.orderDate < before);
    });
    return { orders: matches.slice(skip, skip + ORDERS_PAGE_SIZE), total: matches.length };
  }

  const query = search.trim();
  const where: Prisma.OrderWhereInput = {
    ...(status ? { status } : {}),
    ...(storeId ? { storeId } : {}),
    ...(includeNoShipping ? {} : { requiresShipping: true }),
    ...(from || before ? { orderDate: { ...(from && { gte: from }), ...(before && { lt: before }) } } : {}),
    ...(query ? { OR: [
      { shopifyOrderId: { contains: query, mode: "insensitive" } },
      { customerName: { contains: query, mode: "insensitive" } },
      { customerEmail: { contains: query, mode: "insensitive" } },
      { factoryName: { contains: query, mode: "insensitive" } },
      { carrier: { contains: query, mode: "insensitive" } },
      { store: { name: { contains: query, mode: "insensitive" } } },
    ] } : {}),
  };
  const prisma = getPrisma();
  const [orders, total] = await Promise.all([
    prisma.order.findMany({ where, include: orderInclude, orderBy: [{ orderDate: "desc" }, { id: "desc" }], skip, take: ORDERS_PAGE_SIZE }),
    prisma.order.count({ where }),
  ]);
  return { orders, total };
}

export async function getStoreOptions() {
  if (isDemoMode()) return [];
  return getPrisma().shopifyStore.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
}

export async function getOrderById(id: string) {
  if (isDemoMode()) return demoOrders.find((order) => order.id === id) ?? null;
  return getPrisma().order.findUnique({
    where: { id },
    include: orderInclude,
  });
}
