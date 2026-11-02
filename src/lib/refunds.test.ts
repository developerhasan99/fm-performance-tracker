// Run: npx tsx --test src/lib/refunds.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { refundStats } from "./refunds";

test("refund totals convert to euros, skip missing rates and count orders once", () => {
  const stats = refundStats([
    { amountCents: 1000, note: "Damaged", orderId: "a", order: { eurRate: 1.5, store: { id: "s1", name: "One" } } },
    { amountCents: 2000, note: null, orderId: "a", order: { eurRate: 1, store: { id: "s2", name: "Two" } } },
    { amountCents: 400, note: "", orderId: "c", order: { eurRate: 1, store: null } },
    { amountCents: 500, note: "", orderId: "b", order: { eurRate: null, store: { id: "s1", name: "One" } } },
  ]);
  const { byStore, ...totals } = stats;
  assert.deepEqual(totals, { orders: 3, refundedCents: 3900, averageCents: 1300, missingRate: 1, withoutNote: 3 });
  assert.deepEqual(byStore, [{ id: "s2", name: "Two", cents: 2000 }, { id: "s1", name: "One", cents: 1500 }, { id: null, name: "No store", cents: 400 }]);
});

test("no rated refunds averages to zero", () => {
  assert.equal(refundStats([]).averageCents, 0);
});
