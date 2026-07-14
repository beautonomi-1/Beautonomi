import { describe, expect, it } from "vitest";
import { isOptOutKeyword, leadIsDoNotContact } from "@/lib/provider-ops/do-not-contact";

describe("isOptOutKeyword", () => {
  it("detects STOP variants", () => {
    expect(isOptOutKeyword("STOP")).toBe(true);
    expect(isOptOutKeyword("stop")).toBe(true);
    expect(isOptOutKeyword("UNSUBSCRIBE")).toBe(true);
    expect(isOptOutKeyword("opt out")).toBe(true);
  });

  it("ignores normal messages", () => {
    expect(isOptOutKeyword("Thanks!")).toBe(false);
    expect(isOptOutKeyword("")).toBe(false);
  });
});

describe("leadIsDoNotContact", () => {
  it("returns true when flag set", () => {
    expect(leadIsDoNotContact({ do_not_contact: true })).toBe(true);
  });

  it("returns false when unset", () => {
    expect(leadIsDoNotContact({ do_not_contact: false })).toBe(false);
    expect(leadIsDoNotContact({})).toBe(false);
  });
});
