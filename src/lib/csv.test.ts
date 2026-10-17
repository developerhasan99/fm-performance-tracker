// Run: npx tsx --test src/lib/csv.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { toCsv } from "./csv";

test("quotes, escapes and neutralises formulas", () => {
  assert.equal(toCsv([["a,b", 'say "hi"', "line\nbreak", "=HYPERLINK(1)", -5, null, true]]), '"a,b","say ""hi""","line\nbreak",\'=HYPERLINK(1),-5,,true');
  assert.equal(toCsv([[new Date("2026-10-17T09:05:30Z")], ["x"]]), "2026-10-17 09:05\r\nx");
});
