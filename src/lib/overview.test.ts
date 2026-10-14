// Run: npx tsx --test src/lib/overview.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { changePercent, dailyCounts, median, orderMetrics, type MetricOrder } from "./overview";

const now = new Date("2026-10-15T12:00:00Z");
const order = (overrides: Partial<MetricOrder>): MetricOrder => ({
  id: Math.random().toString(), shopifyOrderId: "#1", customerName: "A", orderDate: new Date("2026-10-10T08:00:00Z"),
  dispatchDueAt: new Date("2026-10-12T08:00:00Z"), deliveryDueAt: new Date("2026-10-15T08:00:00Z"),
  carrierCollectedAt: null, deliveredAt: null, status: "placed", carrier: "DPD", trackingNumber: null, storeId: null,
  isSampleData: false, store: null, items: [{ quantity: 1, shippedQuantity: 1 }], ...overrides,
});

test("dispatch SLA, median and buckets", () => {
  const m = orderMetrics([
    order({ carrierCollectedAt: new Date("2026-10-10T20:00:00Z"), trackingNumber: "1", status: "in_transit" }), // 12 h, on time
    order({ carrierCollectedAt: new Date("2026-10-13T08:00:00Z"), status: "in_transit" }), // 72 h, late
    order({ status: "delayed" }), // due, not dispatched
    order({ dispatchDueAt: new Date("2026-10-20T08:00:00Z") }), // not due yet: not counted
    order({ status: "cancelled" }), // excluded
  ], now);
  assert.equal(m.orders, 4);
  assert.equal(m.cancelled, 1);
  assert.equal(m.dispatchDue, 3);
  assert.equal(m.dispatchOnTime, 1);
  assert.equal(m.dispatchRate, 33);
  assert.equal(m.medianDispatchHours, 42);
  assert.equal(m.trackingRate, 50);
  assert.equal(m.overdueDispatch, 1);
  assert.deepEqual(m.dispatchBuckets.filter((b) => b.count).map((b) => b.label), ["Under 24 h", "3–5 days", "Overdue, not dispatched"]);
  assert.equal(m.deliveryCoverage, 0);
  assert.equal(m.otifRate, null); // nothing confirmed delivered: no rate, not 0%
});

test("OTIF only counts confirmed, on-time, in-full deliveries", () => {
  const shipped = { carrierCollectedAt: new Date("2026-10-11T08:00:00Z"), status: "delivered" as const };
  const m = orderMetrics([
    order({ ...shipped, deliveredAt: new Date("2026-10-14T08:00:00Z") }),
    order({ ...shipped, deliveredAt: new Date("2026-10-14T08:00:00Z"), items: [{ quantity: 2, shippedQuantity: 1 }] }),
    order({ ...shipped, deliveredAt: new Date("2026-10-16T08:00:00Z") }),
  ], now);
  assert.equal(m.onTimeDeliveryRate, 67);
  assert.equal(m.otifRate, 33);
  assert.equal(m.medianTransitDays, 3);
});

test("helpers", () => {
  assert.equal(median([]), null);
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(changePercent(120, 100), 20);
  assert.equal(changePercent(5, 0), null);
  const days = dailyCounts([new Date("2026-10-15T01:00:00Z"), new Date("2026-10-13T23:00:00Z"), new Date("2026-09-01T00:00:00Z")], 3, now);
  assert.deepEqual(days.map((d) => d.count), [1, 0, 1]);
  assert.equal(days[2].date.toISOString(), "2026-10-15T00:00:00.000Z");
});
