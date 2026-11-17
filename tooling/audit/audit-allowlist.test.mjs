import assert from "node:assert/strict";
import test from "node:test";
import {
  findExpiredAllowlistEntries,
  isPackageAllowlisted,
  loadAllowlist,
} from "./audit-allowlist.mjs";

test("loadAllowlist returns braces, http-cache-semantics, and picomatch", () => {
  const entries = loadAllowlist();
  assert.ok(isPackageAllowlisted(entries, "braces"));
  assert.ok(isPackageAllowlisted(entries, "http-cache-semantics"));
  assert.ok(isPackageAllowlisted(entries, "picomatch"));
});

test("findExpiredAllowlistEntries flags past dates", () => {
  const entries = [{ package: "x", reason: "test", expires: "2020-01-01" }];
  const expired = findExpiredAllowlistEntries(entries, new Date("2026-01-01"));
  assert.equal(expired.length, 1);
});

test("findExpiredAllowlistEntries accepts future expiry", () => {
  const entries = loadAllowlist();
  const expired = findExpiredAllowlistEntries(entries, new Date("2026-01-01"));
  assert.equal(expired.length, 0);
});
