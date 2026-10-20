import { describe, expect, it } from "vitest";
import { phoneIlikeClauses, sanitizeIlikeTerm } from "../phone-ilike";

describe("sanitizeIlikeTerm", () => {
  it("strips PostgREST reserved pattern chars", () => {
    expect(sanitizeIlikeTerm("jo(e)%")).toBe("joe");
  });
});

describe("phoneIlikeClauses", () => {
  it("adds ilike per column for unscoped needles", () => {
    expect(phoneIlikeClauses(["phone_e164"], "0821234567")).toEqual([
      "phone_e164.ilike.%0821234567%",
      "phone_e164.ilike.%821234567%",
    ]);
  });

  it("returns no clauses when fewer than 4 digits", () => {
    expect(phoneIlikeClauses(["phone"], "+27")).toEqual([]);
  });
});
