// Run: npx tsx --test src/lib/failure.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { computeFailure, type FailureInput } from "./failure";

const now = new Date("2026-10-17T12:00:00Z");
const order = (overrides: Partial<FailureInput> = {}): FailureInput => ({
  status: "delivered", cancelReason: null, totalCents: 50000, refundedCents: 0, eurRate: 0.1, // 500 SEK = €50
  chargebacks: 0, chargebacksLost: 0, carrierCollectedAt: new Date("2026-10-02"), dispatchDueAt: new Date("2026-10-03"),
  deliveredAt: new Date("2026-10-06"), deliveryDueAt: new Date("2026-10-08"), replacements: 0, tickets: [],
  costs: { reshipCostCents: 1000, chargebackFeeCents: 1500, ticketCostCents: 200 }, ...overrides,
});

test("a clean order costs nothing and has no cause", () => {
  assert.deepEqual(computeFailure(order(), now), { failureCause: null, refundCostCents: 0, chargebackCostCents: 0, reshipCostCents: 0, supportCostCents: 0, lostRevenueCents: 0, failureCostCents: 0 });
});

test("wrong item: refund + reship + tickets, filed under the ticket's category, converted to EUR", () => {
  const result = computeFailure(order({ refundedCents: 20000, tickets: [{ category: null, labels: [] }, { category: "wrong_item", labels: ["reshipment-follow-up"] }] }), now);
  assert.equal(result.failureCause, "wrong_item");
  assert.equal(result.refundCostCents, 2000);
  assert.equal(result.reshipCostCents, 1000); // label counts as one reship when Shopify has no replacement order
  assert.equal(result.supportCostCents, 400);
  assert.equal(result.failureCostCents, 3400);
  assert.equal(computeFailure(order({ replacements: 2, tickets: [{ category: null, labels: ["reshipment-follow-up"] }] }), now).reshipCostCents, 2000);
});

test("cancelled: the order value is lost revenue, its refund isn't counted twice", () => {
  const result = computeFailure(order({ status: "cancelled", cancelReason: "INVENTORY", refundedCents: 50000, carrierCollectedAt: null }), now);
  assert.equal(result.failureCause, "out_of_stock");
  assert.equal(result.lostRevenueCents, 5000);
  assert.equal(result.refundCostCents, 0);
  assert.equal(computeFailure(order({ status: "cancelled", cancelReason: "STAFF" }), now).failureCause, "cancelled_other");
});

test("chargebacks: fee always, unrefunded value when lost", () => {
  assert.equal(computeFailure(order({ chargebacks: 1 }), now).chargebackCostCents, 1500);
  const lost = computeFailure(order({ chargebacks: 1, chargebacksLost: 1, refundedCents: 10000 }), now);
  assert.equal(lost.chargebackCostCents, 1500 + 4000);
  assert.equal(lost.failureCause, "chargeback");
});

test("refunds without a ticket fall back to what the fulfilment data shows", () => {
  assert.equal(computeFailure(order({ refundedCents: 100, carrierCollectedAt: null, deliveredAt: null }), now).failureCause, "not_dispatched");
  assert.equal(computeFailure(order({ refundedCents: 100, deliveredAt: new Date("2026-10-12") }), now).failureCause, "late_delivery");
  assert.equal(computeFailure(order({ refundedCents: 100 }), now).failureCause, "refund_unexplained");
  assert.equal(computeFailure(order({ tickets: [{ category: null, labels: [] }] }), now).failureCause, "enquiry");
});
