import type { FulfillmentStatus, IssueCategory, Prisma } from "@prisma/client";
import { issueLabels } from "@/lib/dashboard";
import { demoOrders } from "@/lib/demo-data";
import { getPrisma } from "@/lib/prisma";

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
export const PERIODS = [7, 30, 90] as const;
export type Period = (typeof PERIODS)[number];

/** The order columns the overview needs (no events/contacts), so large periods stay light. */
export type MetricOrder = {
  id: string;
  shopifyOrderId: string;
  customerName: string;
  orderDate: Date;
  dispatchDueAt: Date;
  deliveryDueAt: Date;
  carrierCollectedAt: Date | null;
  deliveredAt: Date | null;
  status: FulfillmentStatus;
  carrier: string;
  trackingNumber: string | null;
  storeId: string | null;
  isSampleData: boolean;
  store: { name: string } | null;
  items: { quantity: number; shippedQuantity: number }[];
};

const metricSelect = {
  id: true, shopifyOrderId: true, customerName: true, orderDate: true, dispatchDueAt: true, deliveryDueAt: true,
  carrierCollectedAt: true, deliveredAt: true, status: true, carrier: true, trackingNumber: true, storeId: true, isSampleData: true,
  store: { select: { name: true } },
  items: { select: { quantity: true, shippedQuantity: true } },
} satisfies Prisma.OrderSelect;

// ---- Pure calculations (tested in overview.test.ts) -------------------------------------

export const percent = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : null);

export function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

const inFull = (order: MetricOrder) => order.items.length > 0 && order.items.every((item) => item.shippedQuantity >= item.quantity);
const dispatchHours = (order: MetricOrder) => (order.carrierCollectedAt!.getTime() - order.orderDate.getTime()) / HOUR;

export const DISPATCH_BUCKETS = ["Under 24 h", "1–2 days", "2–3 days", "3–5 days", "Over 5 days", "Overdue, not dispatched"] as const;

/** Fulfilment metrics for one slice of orders (cancelled orders are left out). */
export function orderMetrics(all: MetricOrder[], now = new Date()) {
  const orders = all.filter((order) => order.status !== "cancelled");
  const shipped = orders.filter((order) => order.carrierCollectedAt);
  const due = orders.filter((order) => order.carrierCollectedAt || order.dispatchDueAt <= now);
  const onTime = due.filter((order) => order.carrierCollectedAt && order.carrierCollectedAt <= order.dispatchDueAt);
  const delivered = shipped.filter((order) => order.deliveredAt);
  const deliveredOnTime = delivered.filter((order) => order.deliveredAt! <= order.deliveryDueAt);
  const otif = deliveredOnTime.filter(inFull);

  const buckets = new Map<(typeof DISPATCH_BUCKETS)[number], number>(DISPATCH_BUCKETS.map((label) => [label, 0]));
  for (const order of due) {
    if (!order.carrierCollectedAt) { buckets.set("Overdue, not dispatched", buckets.get("Overdue, not dispatched")! + 1); continue; }
    const hours = dispatchHours(order);
    const label = hours < 24 ? "Under 24 h" : hours < 48 ? "1–2 days" : hours < 72 ? "2–3 days" : hours < 120 ? "3–5 days" : "Over 5 days";
    buckets.set(label, buckets.get(label)! + 1);
  }

  return {
    orders: orders.length,
    cancelled: all.length - orders.length,
    dispatchDue: due.length,
    dispatchOnTime: onTime.length,
    dispatchRate: percent(onTime.length, due.length),
    medianDispatchHours: median(shipped.map(dispatchHours)),
    // Due for dispatch but not handed to a carrier. More reliable than the "delayed" status, which also flags
    // shipped orders whose delivery was never confirmed.
    overdueDispatch: due.filter((order) => !order.carrierCollectedAt).length,
    shipped: shipped.length,
    trackingRate: percent(shipped.filter((order) => order.trackingNumber).length, shipped.length),
    deliveryConfirmed: delivered.length,
    deliveryCoverage: percent(delivered.length, shipped.length),
    onTimeDeliveryRate: percent(deliveredOnTime.length, delivered.length),
    otifRate: percent(otif.length, delivered.length),
    medianTransitDays: median(delivered.map((order) => (order.deliveredAt!.getTime() - order.carrierCollectedAt!.getTime()) / DAY)),
    stages: [
      { label: "Placed", count: orders.length },
      { label: "Dispatched", count: shipped.length },
      { label: "With tracking", count: shipped.filter((order) => order.trackingNumber).length },
      { label: "Delivery confirmed", count: delivered.length },
    ],
    dispatchBuckets: DISPATCH_BUCKETS.map((label) => ({ label, count: buckets.get(label)! })),
  };
}

/** Per-day counts for the last `days` days, oldest first (UTC days). */
export function dailyCounts(dates: Date[], days: number, now = new Date()) {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const counts = Array.from({ length: days }, (_, index) => ({ date: new Date(today - (days - 1 - index) * DAY), count: 0 }));
  for (const date of dates) {
    const index = days - 1 - Math.floor((today - Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())) / DAY);
    if (index >= 0 && index < days) counts[index].count++;
  }
  return counts;
}

/** Change vs the previous period; null when there's nothing to compare. */
export const change = (current: number | null, previous: number | null) =>
  current === null || previous === null ? null : current - previous;
export const changePercent = (current: number, previous: number) => (previous ? Math.round(((current - previous) / previous) * 100) : null);
// Below this, a previous period is too small to compare against (e.g. it falls before the import start date).
const MIN_COMPARABLE = 10;

// ---- Data -----------------------------------------------------------------------------

export type OverviewFilters = { days: Period; storeId?: string };

export async function getOverview({ days, storeId }: OverviewFilters) {
  const now = new Date();
  const start = new Date(now.getTime() - days * DAY);
  const previousStart = new Date(start.getTime() - days * DAY);

  if (process.env.DASHBOARD_DEMO_MODE === "true") {
    const current = demoOrders.filter((order) => order.orderDate >= start);
    const previous = demoOrders.filter((order) => order.orderDate >= previousStart && order.orderDate < start);
    const overdue = overdueOf(demoOrders, now);
    const dispatchedAt = demoOrders.map((order) => order.carrierCollectedAt).filter((date): date is Date => !!date && date >= start);
    return build({ days, now, current, previous, dispatchedAt, overdue: overdue.slice(0, 8), overdueCount: overdue.length, support: null, stores: [], storeId });
  }

  const prisma = getPrisma();
  const scope = storeId ? { storeId } : {};
  const orderWhere = (from: Date, to: Date): Prisma.OrderWhereInput => ({ requiresShipping: true, orderDate: { gte: from, lt: to }, ...scope });
  const overdueWhere: Prisma.OrderWhereInput = { requiresShipping: true, carrierCollectedAt: null, dispatchDueAt: { lt: now }, status: { not: "cancelled" }, ...scope };
  const [current, previous, dispatched, overdue, overdueCount, stores, support] = await Promise.all([
    prisma.order.findMany({ where: orderWhere(start, now), select: metricSelect }),
    prisma.order.findMany({ where: orderWhere(previousStart, start), select: metricSelect }),
    // Warehouse throughput counts hand-overs in the period, whatever the order date.
    prisma.order.findMany({ where: { requiresShipping: true, carrierCollectedAt: { gte: start, lt: now }, ...scope }, select: { carrierCollectedAt: true } }),
    prisma.order.findMany({ where: overdueWhere, select: metricSelect, orderBy: { dispatchDueAt: "asc" }, take: 8 }),
    prisma.order.count({ where: overdueWhere }),
    prisma.shopifyStore.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    supportStats({ start, previousStart, now, storeId }),
  ]);
  const dispatchedAt = dispatched.map((order) => order.carrierCollectedAt!);
  return build({ days, now, current, previous, dispatchedAt, overdue, overdueCount, support, stores, storeId });
}

function overdueOf(orders: MetricOrder[], now: Date) {
  return orders.filter((order) => !order.carrierCollectedAt && order.dispatchDueAt < now && order.status !== "cancelled").sort((a, b) => a.dispatchDueAt.getTime() - b.dispatchDueAt.getTime());
}

async function supportStats({ start, previousStart, now, storeId }: { start: Date; previousStart: Date; now: Date; storeId?: string }) {
  const prisma = getPrisma();
  if (!(await prisma.supportAccount.count())) return null;
  const base = (from: Date, to: Date): Prisma.SupportTicketWhereInput => ({ excluded: false, ticketCreatedAt: { gte: from, lt: to }, ...(storeId && { storeId }) });
  const where = base(start, now);
  const [tickets, previousTotal, byCategory] = await Promise.all([
    prisma.supportTicket.findMany({
      where,
      select: { ticketCreatedAt: true, lastActivityAt: true, refundRequested: true, wismo: true, orderId: true, status: true, order: { select: { carrier: true } } },
    }),
    prisma.supportTicket.count({ where: base(previousStart, start) }),
    prisma.supportTicket.groupBy({ by: ["category"], where, _count: true }),
  ]);
  return { tickets, previousTotal, byCategory };
}

type BuildInput = {
  days: Period;
  now: Date;
  current: MetricOrder[];
  previous: MetricOrder[];
  dispatchedAt: Date[];
  overdue: MetricOrder[];
  overdueCount: number;
  support: Awaited<ReturnType<typeof supportStats>>;
  stores: { id: string; name: string }[];
  storeId?: string;
};

function build({ days, now, current, previous, dispatchedAt, overdue, overdueCount, support, stores, storeId }: BuildInput) {
  const metrics = orderMetrics(current, now);
  const before = orderMetrics(previous, now);
  const tickets = support?.tickets ?? [];

  // Carriers: shipped orders this period, plus "where is my order" tickets linked to their orders.
  const wismoByCarrier = new Map<string, number>();
  for (const ticket of tickets) {
    if (ticket.wismo && ticket.order) wismoByCarrier.set(ticket.order.carrier, (wismoByCarrier.get(ticket.order.carrier) ?? 0) + 1);
  }
  const carriers = [...new Set(current.filter((order) => order.carrierCollectedAt && order.status !== "cancelled").map((order) => order.carrier))];
  const carrierRows = carriers.map((carrier) => {
    const m = orderMetrics(current.filter((order) => order.carrier === carrier), now);
    const wismo = support ? wismoByCarrier.get(carrier) ?? 0 : null;
    return {
      name: carrier,
      shipped: m.shipped,
      trackingRate: m.trackingRate,
      deliveryCoverage: m.deliveryCoverage,
      onTimeDeliveryRate: m.onTimeDeliveryRate,
      medianTransitDays: m.medianTransitDays,
      wismoPer100: wismo !== null && m.shipped ? Math.round((wismo / m.shipped) * 1000) / 10 : null,
    };
  }).sort((a, b) => b.shipped - a.shipped);

  const resolved = tickets.filter((ticket) => ticket.status === "resolved");
  const supportSummary = support && {
    total: tickets.length,
    totalChange: support.previousTotal < MIN_COMPARABLE ? null : changePercent(tickets.length, support.previousTotal),
    open: tickets.filter((ticket) => ["open", "pending", "snoozed"].includes(ticket.status)).length,
    resolvedRate: percent(resolved.length, tickets.length),
    // Commslayer doesn't expose a resolved-at time; last activity on a resolved ticket is the closest proxy.
    medianResolutionHours: median(resolved.filter((ticket) => ticket.lastActivityAt).map((ticket) => (ticket.lastActivityAt!.getTime() - ticket.ticketCreatedAt.getTime()) / HOUR)),
    // Contact rate: only tickets linked to this period's orders, so unimported stores' tickets don't inflate it.
    per100Orders: metrics.orders ? Math.round((tickets.filter((ticket) => ticket.orderId).length / metrics.orders) * 1000) / 10 : null,
    refund: tickets.filter((ticket) => ticket.refundRequested).length,
    wismo: tickets.filter((ticket) => ticket.wismo).length,
    linkedRate: percent(tickets.filter((ticket) => ticket.orderId).length, tickets.length),
    categories: support.byCategory
      .map((row) => ({ label: row.category ? issueLabels[row.category as IssueCategory] : "General enquiry", count: row._count }))
      .sort((a, b) => b.count - a.count),
    daily: dailyCounts(tickets.map((ticket) => ticket.ticketCreatedAt), days, now),
  };

  const comparable = before.orders >= MIN_COMPARABLE;
  return {
    days,
    storeId,
    stores,
    hasSampleData: current.some((order) => order.isSampleData),
    metrics,
    dispatchedCount: dispatchedAt.length,
    changes: {
      dispatchRate: comparable ? change(metrics.dispatchRate, before.dispatchRate) : null,
      medianDispatchHours: comparable ? change(metrics.medianDispatchHours, before.medianDispatchHours) : null,
    },
    dailyDispatched: dailyCounts(dispatchedAt, days, now),
    carrierRows,
    overdue: overdue.map((order) => ({ ...order, overdueHours: (now.getTime() - order.dispatchDueAt.getTime()) / HOUR })),
    overdueCount,
    support: supportSummary,
  };
}

export type Overview = Awaited<ReturnType<typeof getOverview>>;
