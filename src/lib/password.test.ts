// Run: npx tsx --test src/lib/password.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { hashPassword, passwordProblem, verifyPassword } from "./password";

test("hash round-trips and rejects wrong or malformed input", async () => {
  const stored = await hashPassword("correct horse battery");
  assert.notEqual(stored, await hashPassword("correct horse battery"), "salted");
  assert.equal(await verifyPassword("correct horse battery", stored), true);
  assert.equal(await verifyPassword("wrong password!", stored), false);
  assert.equal(await verifyPassword("anything", "garbage"), false);
  assert.ok(passwordProblem("short"));
  assert.equal(passwordProblem("long enough pw"), null);
});
