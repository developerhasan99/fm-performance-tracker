import type { Prisma } from "@prisma/client";
import { parseDay } from "@/lib/dashboard";

// The reporting period asked for; earlier dates can still be picked in the filter.
const DEFAULT_FROM = "2026-09-14";

export type RefundParams = { q?: string; store?: string; from?: string; to?: string };

/** "gid://shopify/Order/123" → "123", the ID the fulfilment partner looks orders up by. */
export const shopifyNumericId = (gid: string | null) => gid?.split("/").pop() ?? null;

/** Validated filters from the refunds URL, shared by the list and its CSV export. `search` holds them without the page. */
export function parseRefundParams(params: RefundParams, stores: { id: string }[]) {
  const query = params.q?.trim() ?? "";
  const storeId = stores.find((store) => store.id === params.store)?.id;
  const from = parseDay(params.from) ?? DEFAULT_FROM;
  const to = parseDay(params.to);
  const where: Prisma.RefundWhereInput = {
    refundedAt: { gte: new Date(`${from}T00:00:00Z`), ...(to && { lt: new Date(Date.parse(`${to}T00:00:00Z`) + 24 * 60 * 60 * 1000) }) },
    ...(storeId && { order: { storeId } }),
    ...(query && { OR: [
      { order: { shopifyOrderId: { contains: query, mode: "insensitive" } } },
      { order: { shopifyGid: { endsWith: `/${query}` } } },
      { refundedBy: { contains: query, mode: "insensitive" } },
      { note: { contains: query, mode: "insensitive" } },
    ] }),
  };
  const search = new URLSearchParams({ ...(query && { q: query }), ...(storeId && { store: storeId }), ...(from !== DEFAULT_FROM && { from }), ...(to && { to }) });
  return { query, storeId, from, to, where, search };
}

export const refundSelect = {
  id: true, amountCents: true, note: true, refundedBy: true, refundedAt: true,
  order: { select: { id: true, shopifyOrderId: true, shopifyGid: true, currency: true, store: { select: { name: true } } } },
} satisfies Prisma.RefundSelect;

export const refundStatsSelect = { amountCents: true, note: true, orderId: true, refundedAt: true, order: { select: { eurRate: true, store: { select: { id: true, name: true } } } } } satisfies Prisma.RefundSelect;

type StatsRefund = { amountCents: number; note: string | null; orderId: string; order: { eurRate: number | null; store: { id: string; name: string } | null } };

export function refundStats(refunds: StatsRefund[]) {
  const rated = refunds.filter((refund) => refund.order.eurRate !== null);
  const refundedCents = rated.reduce((sum, refund) => sum + refund.amountCents * refund.order.eurRate!, 0);
  const stores = new Map<string, { id: string | null; name: string; cents: number }>();
  for (const refund of rated) {
    const store = refund.order.store;
    const row = stores.get(store?.id ?? "") ?? { id: store?.id ?? null, name: store?.name ?? "No store", cents: 0 };
    row.cents += refund.amountCents * refund.order.eurRate!;
    stores.set(row.id ?? "", row);
  }
  return {
    orders: new Set(refunds.map((refund) => refund.orderId)).size,
    refundedCents,
    averageCents: rated.length ? refundedCents / rated.length : 0,
    missingRate: refunds.length - rated.length,
    withoutNote: refunds.filter((refund) => !refund.note).length,
    /** Euros refunded per store, largest first. */
    byStore: [...stores.values()].sort((a, b) => b.cents - a.cents),
  };
}
