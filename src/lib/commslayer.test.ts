// Run: npx tsx --test src/lib/commslayer.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { isPageBeforeCutoff, ticketFields, type CommslayerConversation } from "./commslayer";

const conversation = (createdAt: string): CommslayerConversation => ({ id: 1, status: "open", created_at: createdAt });
const cutoff = new Date("2026-09-14T00:00:00Z");

test("walk stops only when a whole page is older than the import date", () => {
  assert.equal(isPageBeforeCutoff([conversation("2026-09-13T10:00:00Z"), conversation("2026-09-01T10:00:00Z")], cutoff), true);
  // Mixed page (e.g. ordering by activity): keep going.
  assert.equal(isPageBeforeCutoff([conversation("2026-09-20T10:00:00Z"), conversation("2026-09-01T10:00:00Z")], cutoff), false);
  assert.equal(isPageBeforeCutoff([], cutoff), false);
});

test("ticket fields keep the raw response and tolerate missing optionals", () => {
  const raw: CommslayerConversation = {
    id: 95283687, display_id: 42, status: "open", subject: "Återbetalning", labels: ["refund"],
    contact_reason: { id: 7, name: "Return status", parent_id: null }, created_at: "2026-10-06T08:00:00Z",
  };
  const fields = ticketFields(raw);
  assert.equal(fields.subject, "Återbetalning");
  assert.equal(fields.contactReason, "Return status");
  assert.equal(fields.ticketUpdatedAt, null);
  assert.deepEqual(fields.raw, raw);
  assert.deepEqual(ticketFields(conversation("2026-10-06T08:00:00Z")).labels, []);
});
