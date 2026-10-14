// Run: npx tsx --test src/lib/commslayer.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyConversation, extractNumbers, isPageBeforeCutoff, ticketFields, type CommslayerConversation } from "./commslayer";
import { findOrderForTicket } from "./support-matching";

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

test("order numbers are found in real subjects; dates, times and prices are not", () => {
  assert.deepEqual(extractNumbers("Re: Bestellung #400130157 bestätigt"), ["400130157"]);
  assert.deepEqual(extractNumbers("Fehlender Artikel bei meiner Bestellung Nr. 400130882"), ["400130882"]);
  assert.deepEqual(extractNumbers("Problem+mit+dem+Kauf+von+Magic+Perfume.#400129421"), ["400129421"]);
  assert.deepEqual(extractNumbers("Neue Kundennachricht vom 13. Oktober 2026 um 20:00"), []);
  assert.deepEqual(extractNumbers("Refunded 333.99 on 06/10/2026"), []);
  assert.deepEqual(extractNumbers("<p>Tracking: <a href=\"x\">71600526813</a></p>"), ["71600526813"]);
});

test("classification uses labels first, then reason, then subject", () => {
  const base = { id: 1, status: "open", created_at: "2026-10-01T00:00:00Z" };
  assert.equal(classifyConversation({ ...base, labels: ["auto-incorrect-bottles"] }).category, "wrong_item");
  assert.equal(classifyConversation({ ...base, contact_reason: { id: 1, name: "Lost package", parent_id: null } }).category, "lost_in_transit");
  assert.equal(classifyConversation({ ...base, subject: "Fehlende sprühkopf" }).category, "missing_item");
  const refund = classifyConversation({ ...base, subject: "Återbetalning" });
  assert.equal(refund.refundRequested, true);
  assert.equal(refund.category, null);
  assert.equal(classifyConversation({ ...base, subject: "Nicht erhalten Parfüm" }).wismo, true);
  assert.equal(classifyConversation({ ...base, spam: true }).excluded, true);
  assert.equal(classifyConversation({ ...base, status: "merged" }).excluded, true);
  assert.equal(classifyConversation({ ...base, subject: "Renate Fuchs left a 1 star review for 'Mystery-Duft (50ml)'" }).excluded, true);
});

test("matching prefers order numbers, then tracking numbers, subject before messages", () => {
  const orderA = { id: "a", storeId: "magic" };
  const orderB = { id: "b", storeId: "tryscent" };
  const byOrder = new Map([["400130157", orderA]]);
  const byTracking = new Map([["71600526813", orderB]]);
  assert.equal(findOrderForTicket({ subjectNumbers: ["71600526813", "400130157"], messageNumbers: [] }, byOrder, byTracking)?.order.id, "a");
  assert.equal(findOrderForTicket({ subjectNumbers: ["71600526813"], messageNumbers: [] }, byOrder, byTracking)?.method, "Tracking number (subject)");
  assert.equal(findOrderForTicket({ subjectNumbers: [], messageNumbers: ["400130157"] }, byOrder, byTracking)?.method, "Order number (message)");
  assert.equal(findOrderForTicket({ subjectNumbers: ["999999"], messageNumbers: [] }, byOrder, byTracking), null);
});
