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
  fraud: "Fraud",
  out_of_stock: "Out of stock",
  payment_declined: "Payment declined",
  cancelled_other: "Cancelled (other reason)",
  chargeback: "Chargeback, no ticket",
  refund_unexplained: "Refund, no reason found",
  enquiry: "Support questions only",
} as const;
export type Cause = keyof typeof CAUSES;
export const isCause = (value: unknown): value is Cause => typeof value === "string" && value in CAUSES;

export const COST_TYPES = {
  refund: { label: "Refunds", column: "refundCostCents" },
  chargeback: { label: "Chargebacks", column: "chargebackCostCents" },
  reship: { label: "Reshipping", column: "reshipCostCents" },
  support: { label: "Support handling", column: "supportCostCents" },
  lost: { label: "Lost revenue (cancelled)", column: "lostRevenueCents" },
} as const;
export type CostType = keyof typeof COST_TYPES;
export const isCostType = (value: unknown): value is CostType => typeof value === "string" && value in COST_TYPES;

const TICKET_CAUSE: Partial<Record<IssueCategory, Cause>> = {
  wrong_item: "wrong_item", missing_item: "missing_item", damaged: "damaged", lost_in_transit: "lost_in_transit",
  not_dispatched: "not_dispatched", late_delivery: "late_delivery", address_error: "address_error", cancellation: "customer_cancelled",
};
const CANCEL_CAUSE: Record<string, Cause> = { CUSTOMER: "customer_cancelled", FRAUD: "fraud", INVENTORY: "out_of_stock", DECLINED: "payment_declined" };
const RESHIP_LABEL = /reship|resend|replacement/i;

export type FailureInput = {
  status: FulfillmentStatus;
  cancelReason: string | null;
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
  costs: { reshipCostCents: number; chargebackFeeCents: number; ticketCostCents: number };
};

export function computeFailure(order: FailureInput, now = new Date()) {
  const eur = (cents: number) => Math.round(cents * (order.eurRate ?? 0));
  const cancelled = order.status === "cancelled";
  // A cancelled order's refund is the money going back for a sale that never happened: count it once, as lost revenue.
  const lostRevenueCents = cancelled ? eur(order.totalCents) : 0;
  const refundCostCents = cancelled ? 0 : eur(order.refundedCents);
  // Lost chargebacks take what's left after refunds; every chargeback also costs the fee, won or lost.
  const chargebackCostCents = order.chargebacks * order.costs.chargebackFeeCents
    + (order.chargebacksLost ? eur(Math.max(0, order.totalCents - order.refundedCents)) : 0);
  // Replacement orders found in Shopify; otherwise a reship the support team labelled on a ticket.
  const reships = order.replacements || (order.tickets.some((ticket) => ticket.labels.some((label) => RESHIP_LABEL.test(label))) ? 1 : 0);
  const reshipCostCents = reships * order.costs.reshipCostCents;
  const supportCostCents = order.tickets.length * order.costs.ticketCostCents;
  const failureCostCents = refundCostCents + chargebackCostCents + reshipCostCents + supportCostCents + lostRevenueCents;

  let cause: Cause | null = null;
  if (failureCostCents > 0) {
    const fromTickets = (Object.keys(TICKET_CAUSE) as IssueCategory[]).find((category) => order.tickets.some((ticket) => ticket.category === category));
    const missedDispatch = !order.carrierCollectedAt && order.dispatchDueAt < now;
    const lateDelivery = order.deliveredAt ? order.deliveredAt > order.deliveryDueAt : order.carrierCollectedAt !== null && order.deliveryDueAt < now;
    cause = fromTickets ? TICKET_CAUSE[fromTickets]!
      : cancelled ? CANCEL_CAUSE[order.cancelReason ?? ""] ?? "cancelled_other"
      : order.chargebacks ? "chargeback"
      : refundCostCents && missedDispatch ? "not_dispatched"
      : refundCostCents && lateDelivery ? "late_delivery"
      : refundCostCents || reshipCostCents ? "refund_unexplained"
      : "enquiry";
  }
  return { failureCause: cause, refundCostCents, chargebackCostCents, reshipCostCents, supportCostCents, lostRevenueCents, failureCostCents };
}

/** Recomputes orders' cost of failure (one store's, or all) and saves the ones that changed. Runs after each sync and cost change. */
export async function recomputeFailures(storeId?: string) {
  const prisma = getPrisma();
  const now = new Date();
  let cursor: string | undefined;
  let changed = 0;
  for (;;) {
    const orders = await prisma.order.findMany({
      take: 2000,
      ...(storeId && { where: { storeId } }),
      ...(cursor && { skip: 1, cursor: { id: cursor } }),
      orderBy: { id: "asc" },
      select: {
        id: true, status: true, cancelReason: true, totalCents: true, refundedCents: true, eurRate: true, chargebacks: true, chargebacksLost: true,
        carrierCollectedAt: true, dispatchDueAt: true, deliveredAt: true, deliveryDueAt: true,
        failureCause: true, refundCostCents: true, chargebackCostCents: true, reshipCostCents: true, supportCostCents: true, lostRevenueCents: true, failureCostCents: true,
        store: { select: { reshipCostCents: true, chargebackFeeCents: true, ticketCostCents: true } },
        tickets: { where: { excluded: false }, select: { category: true, labels: true } },
        _count: { select: { replacements: true } },
      },
    });
    if (!orders.length) break;
    cursor = orders[orders.length - 1].id;
    const updates = orders.flatMap((order) => {
      const next = computeFailure({ ...order, replacements: order._count.replacements, costs: order.store ?? { reshipCostCents: 0, chargebackFeeCents: 0, ticketCostCents: 0 } }, now);
      const same = (Object.keys(next) as (keyof typeof next)[]).every((key) => next[key] === order[key]);
      return same ? [] : [{ id: order.id, data: next }];
    });
    changed += updates.length;
    await runInBatches(updates, ({ id, data }) => prisma.order.update({ where: { id }, data }));
  }
  return { changed };
}
