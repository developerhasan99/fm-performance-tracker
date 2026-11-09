// Run: npx tsx --test src/lib/inventory.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { matchesFilters } from "./inventory";

const row = (levels: Record<string, [number, boolean]>) => ({ byStore: new Map(Object.entries(levels).map(([id, [quantity, active]]) => [id, { quantity, active }])) });
const stores = ["a", "b"];

test("status filter: active everywhere by default, at least one store, or all", () => {
  const partly = row({ a: [5, true], b: [5, false] });
  assert.equal(matchesFilters(partly, stores, "everywhere", undefined), false);
  assert.equal(matchesFilters(partly, stores, "any", undefined), true);
  assert.equal(matchesFilters(row({ a: [5, false] }), stores, "any", undefined), false);
  assert.equal(matchesFilters(row({ a: [5, false] }), stores, "all", undefined), true);
});

test("stock filter: a missing store or 0 or less is out of stock", () => {
  const both = row({ a: [3, true], b: [1, true] });
  const oneOut = row({ a: [3, true], b: [-2, true] });
  const missing = row({ a: [3, true] });
  const none = row({ a: [0, true], b: [0, true] });
  assert.equal(matchesFilters(both, stores, "all", "in"), true);
  assert.equal(matchesFilters(oneOut, stores, "all", "in"), false);
  assert.equal(matchesFilters(oneOut, stores, "all", "some"), true);
  assert.equal(matchesFilters(missing, stores, "all", "some"), true);
  assert.equal(matchesFilters(none, stores, "all", "some"), false);
  assert.equal(matchesFilters(none, stores, "all", "out"), true);
  assert.equal(matchesFilters(both, stores, "all", "out"), false);
});
