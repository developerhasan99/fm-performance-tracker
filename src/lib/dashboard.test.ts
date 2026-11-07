// Run: npx tsx --test src/lib/dashboard.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { orderStats } from "./dashboard";

const order = (overrides: Partial<Parameters<typeof orderStats>[0][number]> = {}) => ({
  status: "placed" as const, totalCents: 1000, eurRate: 1.5, failureCostCents: 0,
  deliveredAt: null, deliveryDueAt: new Date("2026-10-10T00:00:00Z"), ...overrides,
});

test("totals skip cancelled revenue and missing rates; on-time counts delivered only", () => {
  const stats = orderStats([
    order({ status: "delivered", deliveredAt: new Date("2026-10-09T00:00:00Z"), failureCostCents: 200 }),
    order({ status: "delivered", deliveredAt: new Date("2026-10-11T00:00:00Z") }),
    order({ status: "cancelled", failureCostCents: 300 }),
    order({ eurRate: null }),
  ]);
  assert.equal(stats.revenueCents, 3000);
  assert.equal(stats.missingRate, 1);
  assert.equal(stats.failureCostCents, 500);
  assert.deepEqual([stats.deliveredOnTime, stats.delivered], [1, 2]);
  assert.equal(stats.cancelled, 1);
});

test("fulfilment filter splits orders by whether every unit has shipped", async () => {
  process.env.DASHBOARD_DEMO_MODE = "true";
  const { getOrders } = await import("./dashboard");
  const sent = (order: { items: { quantity: number; shippedQuantity: number }[] }) => order.items.every((item) => item.shippedQuantity >= item.quantity);
  const fulfilled = (await getOrders({ search: "", fulfilment: "fulfilled", includeNoShipping: true })).orders;
  const unfulfilled = (await getOrders({ search: "", fulfilment: "unfulfilled", includeNoShipping: true })).orders;
  assert.ok(fulfilled.length && unfulfilled.length);
  assert.ok(fulfilled.every(sent));
  assert.ok(unfulfilled.every((order) => !sent(order) && order.status !== "cancelled"));
});
