// Run: npx tsx --test src/lib/fx.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { rateOn } from "./fx";

test("uses the latest ECB day on or before the date", () => {
  const series = new Map([["2026-10-09", { SEK: 11 }], ["2026-10-12", { SEK: 10 }]]);
  assert.equal(rateOn(series, "EUR", new Date("2026-10-11")), 1);
  assert.equal(rateOn(series, "SEK", new Date("2026-10-11T15:00:00Z")), 1 / 11); // Sunday → Friday's rate
  assert.equal(rateOn(series, "SEK", new Date("2026-10-12")), 1 / 10);
  assert.equal(rateOn(series, "SEK", new Date("2026-10-30")), null); // over a week without a rate
});
