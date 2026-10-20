// Run: npx tsx --test src/lib/failure.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { computeFailure, type FailureInput } from "./failure";

const now = new Date("2026-10-17T12:00:00Z");
const order = (overrides: Partial<FailureInput> = {}): FailureInput => ({
  status: "delivered", totalCents: 50000, refundedCents: 0, eurRate: 0.1, // 500 SEK = €50
  chargebacks: 0, chargebacksLost: 0, carrierCollectedAt: new Date("2026-10-02"), dispatchDueAt: new Date("2026-10-03"),
  deliveredAt: new Date("2026-10-06"), deliveryDueAt: new Date("2026-10-08"), replacements: 0, tickets: [],
  costs: { reshipCostCents: 1000, chargebackFeeCents: 1500 }, ...overrides,
});

test("a clean order costs nothing and has no cause; tickets alone cost nothing", () => {
  const clean = { failureCause: null, refundCostCents: 0, chargebackCostCents: 0, reshipCostCents: 0, failureCostCents: 0 };
  assert.deepEqual(computeFailure(order(), now), clean);
  assert.deepEqual(computeFailure(order({ tickets: [{ category: "wrong_item", labels: [] }] }), now), clean);
});

test("wrong item: refund + reship, filed under the ticket's category, converted to EUR", () => {
  const result = computeFailure(order({ refundedCents: 20000, tickets: [{ category: null, labels: [] }, { category: "wrong_item", labels: ["reshipment-follow-up"] }] }), now);
  assert.equal(result.failureCause, "wrong_item");
  assert.equal(result.refundCostCents, 2000);
  assert.equal(result.reshipCostCents, 1000); // label counts as one reship when Shopify has no replacement order
  assert.equal(result.failureCostCents, 3000);
  assert.equal(computeFailure(order({ replacements: 2, tickets: [{ category: null, labels: ["reshipment-follow-up"] }] }), now).reshipCostCents, 2000);
});

test("cancelled orders cost nothing, even when refunded", () => {
  assert.equal(computeFailure(order({ status: "cancelled", refundedCents: 50000, carrierCollectedAt: null }), now).failureCostCents, 0);
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
  assert.equal(computeFailure(order({ refundedCents: 100, deliveredAt: null }), now).failureCause, "refund_unexplained"); // shipped, never confirmed: not "late"
});
