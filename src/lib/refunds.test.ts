// Run: npx tsx --test src/lib/refunds.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { refundStats } from "./refunds";

test("refund totals convert to euros, skip missing rates and count orders once", () => {
  const stats = refundStats([
    { amountCents: 1000, note: "Damaged", orderId: "a", order: { eurRate: 1.5 } },
    { amountCents: 2000, note: null, orderId: "a", order: { eurRate: 1 } },
    { amountCents: 500, note: "", orderId: "b", order: { eurRate: null } },
  ]);
  assert.deepEqual(stats, { orders: 2, refundedCents: 3500, averageCents: 1750, missingRate: 1, withoutNote: 2 });
});

test("no rated refunds averages to zero", () => {
  assert.equal(refundStats([]).averageCents, 0);
});
