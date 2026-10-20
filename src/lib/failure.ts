import type { FulfillmentStatus, IssueCategory } from "@prisma/client";
import { getPrisma, runInBatches } from "@/lib/prisma";

/**
 * Cost of failure: what an order cost us beyond a normal sale, in EUR cents, and the one root cause it's filed under.
 * Stored on the order (recomputeFailures) so the dashboard and order filters are plain queries.
 */

// Root causes, most specific first. Ticket categories win, because they say what actually went wrong.
export const CAUSES = {
  wrong_item: "Wrong item sent",
  missing_item: "Missing item",
  damaged: "Damaged item",
  lost_in_transit: "Lost in transit",
  not_dispatched: "Not dispatched in time",
  late_delivery: "Late delivery",
  address_error: "Address / customer error",
  customer_cancelled: "Customer cancelled",
  chargeback: "Chargeback, no ticket",
  refund_unexplained: "No reason found",
} as const;
export type Cause = keyof typeof CAUSES;
export const isCause = (value: unknown): value is Cause => typeof value === "string" && value in CAUSES;

export const COST_TYPES = {
  refund: { label: "Refunds", column: "refundCostCents" },
  chargeback: { label: "Chargebacks", column: "chargebackCostCents" },
  reship: { label: "Reshipping", column: "reshipCostCents" },
} as const;
export type CostType = keyof typeof COST_TYPES;
export const isCostType = (value: unknown): value is CostType => typeof value === "string" && value in COST_TYPES;

const TICKET_CAUSE: Partial<Record<IssueCategory, Cause>> = {
  wrong_item: "wrong_item", missing_item: "missing_item", damaged: "damaged", lost_in_transit: "lost_in_transit",
  not_dispatched: "not_dispatched", late_delivery: "late_delivery", address_error: "address_error", cancellation: "customer_cancelled",
};
const RESHIP_LABEL = /reship|resend|replacement/i;

export type FailureInput = {
  status: FulfillmentStatus;
  totalCents: number;
  refundedCents: number;
  eurRate: number | null;
  chargebacks: number;
  chargebacksLost: number;
  carrierCollectedAt: Date | null;
  dispatchDueAt: Date;
  deliveredAt: Date | null;
  deliveryDueAt: Date;
  replacements: number;
  tickets: { category: IssueCategory | null; labels: string[] }[];
  costs: { reshipCostCents: number; chargebackFeeCents: number };
};

export function computeFailure(order: FailureInput, now = new Date()) {
  const eur = (cents: number) => Math.round(cents * (order.eurRate ?? 0));
  // Cancellations and support handling aren't counted: a cancelled order's refund returns money for a sale that never happened.
  const refundCostCents = order.status === "cancelled" ? 0 : eur(order.refundedCents);
  // Lost chargebacks take what's left after refunds; every chargeback also costs the fee, won or lost.
  const chargebackCostCents = order.chargebacks * order.costs.chargebackFeeCents
    + (order.chargebacksLost ? eur(Math.max(0, order.totalCents - order.refundedCents)) : 0);
  // Replacement orders found in Shopify; otherwise a reship the support team labelled on a ticket.
  const reships = order.replacements || (order.tickets.some((ticket) => ticket.labels.some((label) => RESHIP_LABEL.test(label))) ? 1 : 0);
  const reshipCostCents = reships * order.costs.reshipCostCents;
  const failureCostCents = refundCostCents + chargebackCostCents + reshipCostCents;

  let cause: Cause | null = null;
  if (failureCostCents > 0) {
    const fromTickets = (Object.keys(TICKET_CAUSE) as IssueCategory[]).find((category) => order.tickets.some((ticket) => ticket.category === category));
    const missedDispatch = !order.carrierCollectedAt && order.dispatchDueAt < now;
    // Only a confirmed late delivery: most shipments never get a delivered date back, so "not confirmed" isn't "late".
    const lateDelivery = order.deliveredAt !== null && order.deliveredAt > order.deliveryDueAt;
    cause = fromTickets ? TICKET_CAUSE[fromTickets]!
      : order.chargebacks ? "chargeback"
      : missedDispatch ? "not_dispatched"
      : lateDelivery ? "late_delivery"
      : "refund_unexplained";
  }
  return { failureCause: cause, refundCostCents, chargebackCostCents, reshipCostCents, failureCostCents };
}

/** Recomputes orders' cost of failure (one store's, or all) and saves the ones that changed. Runs after each sync and cost change. */
export async function recomputeFailures(storeId?: string) {
  const prisma = getPrisma();
  const now = new Date();
  let cursor: string | undefined;
  let changed = 0;
  // Railway's proxy sometimes drops a connection mid-run; a batch is safe to redo, so retry it a few times.
  const retry = async <T>(run: () => Promise<T>): Promise<T> => {
    for (let attempt = 1; ; attempt++) {
      try { return await run(); } catch (error) {
        if (attempt >= 4) throw error;
        await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
      }
    }
  };
  for (;;) {
    const orders = await retry(() => prisma.order.findMany({
      take: 500,
      ...(storeId && { where: { storeId } }),
      ...(cursor && { skip: 1, cursor: { id: cursor } }),
      orderBy: { id: "asc" },
      select: {
        id: true, status: true, totalCents: true, refundedCents: true, eurRate: true, chargebacks: true, chargebacksLost: true,
        carrierCollectedAt: true, dispatchDueAt: true, deliveredAt: true, deliveryDueAt: true,
        failureCause: true, refundCostCents: true, chargebackCostCents: true, reshipCostCents: true, failureCostCents: true,
        store: { select: { reshipCostCents: true, chargebackFeeCents: true } },
        tickets: { where: { excluded: false }, select: { category: true, labels: true } },
        _count: { select: { replacements: true } },
      },
    }));
    if (!orders.length) break;
    cursor = orders[orders.length - 1].id;
    const updates = orders.flatMap((order) => {
      const next = computeFailure({ ...order, replacements: order._count.replacements, costs: order.store ?? { reshipCostCents: 0, chargebackFeeCents: 0 } }, now);
      const same = (Object.keys(next) as (keyof typeof next)[]).every((key) => next[key] === order[key]);
      return same ? [] : [{ id: order.id, data: next }];
    });
    changed += updates.length;
    await retry(() => runInBatches(updates, ({ id, data }) => prisma.order.update({ where: { id }, data })));
  }
  return { changed };
}
