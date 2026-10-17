import { FulfillmentStatus, IssueCategory, Prisma } from "@prisma/client";
import { demoOrders, type OrderSummary } from "@/lib/demo-data";
import { getPrisma } from "@/lib/prisma";

const orderInclude = {
  items: true,
  contacts: true,
  store: { select: { name: true, shopDomain: true, customDomain: true } },
  events: { orderBy: { occurredAt: "asc" as const } },
  tickets: {
    where: { excluded: false },
    select: { id: true, category: true, status: true, subject: true, wismo: true, refundRequested: true, ticketCreatedAt: true },
    orderBy: { ticketCreatedAt: "asc" as const },
  },
} satisfies Prisma.OrderInclude;

type OrderRow = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

/** Commslayer tickets count as support contacts everywhere contacts are used (metrics, tables, order page). */
function toSummary({ tickets, ...order }: OrderRow): OrderSummary {
  return {
    ...order,
    contacts: [
      ...order.contacts,
      ...tickets.map((ticket) => ({
        id: ticket.id,
        category: ticket.category ?? "other",
        resolution: ticket.status,
        channel: "commslayer",
        contactedAt: ticket.ticketCreatedAt,
        refundAmountCents: 0,
        replacementCostCents: 0,
        handlingMinutes: 0,
        subject: ticket.subject,
        wismo: ticket.wismo,
        refundRequested: ticket.refundRequested,
      })),
    ],
  };
}

const isDemoMode = () => process.env.DASHBOARD_DEMO_MODE === "true";

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
  /** 1-based; omit for every matching order (export). */
  page?: number;
};

export const orderStatuses: FulfillmentStatus[] = ["placed", "processing", "in_transit", "delivered", "completed", "delayed", "cancelled"];

// "YYYY-MM-DD" from <input type="date">, or undefined if missing/invalid.
// ponytail: days are UTC, so UK summer time shifts the boundary by an hour; use the shop's timezone if that matters.
const parseDay = (value?: string) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) ? value : undefined);

export type OrderParams = { q?: string; status?: string; store?: string; noShipping?: string; from?: string; to?: string };

/** Validated filters from the orders URL, shared by the list and its CSV export. `search` holds them without the page. */
export function parseOrderParams(params: OrderParams, stores: { id: string }[]) {
  const query = params.q?.trim() ?? "";
  const status = orderStatuses.find((candidate) => candidate === params.status);
  const storeId = stores.find((store) => store.id === params.store)?.id;
  const noShipping = params.noShipping === "1";
  const from = parseDay(params.from);
  const to = parseDay(params.to);
  return {
    query, status, storeId, noShipping, from, to,
    filters: {
      search: query,
      status,
      storeId,
      // "Completed" only exists for no-shipping orders, so choosing it implies showing them.
      includeNoShipping: noShipping || status === "completed",
      from: from ? new Date(`${from}T00:00:00Z`) : undefined,
      before: to ? new Date(Date.parse(`${to}T00:00:00Z`) + 24 * 60 * 60 * 1000) : undefined,
    } satisfies OrderFilters,
    search: new URLSearchParams({ ...(query && { q: query }), ...(status && { status }), ...(storeId && { store: storeId }), ...(noShipping && { noShipping: "1" }), ...(from && { from }), ...(to && { to }) }),
  };
}

/** One page of orders plus the total match count, or every match when no page is given. */
export async function getOrders({ search, status, storeId, includeNoShipping, from, before, page }: OrderFilters) {
  const skip = page ? (page - 1) * ORDERS_PAGE_SIZE : 0;
  const take = page ? ORDERS_PAGE_SIZE : undefined;
  if (isDemoMode()) {
    const query = search.trim().toLowerCase();
    const matches = demoOrders.filter((order) => {
      const matchesSearch = !query || [
        order.shopifyOrderId, order.customerName, order.customerEmail, order.factoryName, order.carrier,
      ].some((value) => value.toLowerCase().includes(query));
      return matchesSearch && (!status || order.status === status) && !storeId && (includeNoShipping || order.requiresShipping) && (!from || order.orderDate >= from) && (!before || order.orderDate < before);
    });
    return { orders: take ? matches.slice(skip, skip + take) : matches, total: matches.length };
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
      { trackingNumber: { contains: query, mode: "insensitive" } },
      { store: { name: { contains: query, mode: "insensitive" } } },
    ] } : {}),
  };
  const prisma = getPrisma();
  const [orders, total] = await Promise.all([
    prisma.order.findMany({ where, include: orderInclude, orderBy: [{ orderDate: "desc" }, { id: "desc" }], skip, take }),
    prisma.order.count({ where }),
  ]);
  return { orders: orders.map(toSummary), total };
}

export async function getStoreOptions() {
  if (isDemoMode()) return [];
  return getPrisma().shopifyStore.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
}

export async function getOrderById(id: string) {
  if (isDemoMode()) return demoOrders.find((order) => order.id === id) ?? null;
  const order = await getPrisma().order.findUnique({ where: { id }, include: orderInclude });
  return order && toSummary(order);
}
