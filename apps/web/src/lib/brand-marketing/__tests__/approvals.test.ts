import { describe, expect, it } from "vitest";
import { hashContent, hashGuestToken } from "../approvals";

describe("approvals hashing", () => {
  it("hashContent is stable", () => {
    expect(hashContent({ a: 1 })).toBe(hashContent({ a: 1 }));
  });

  it("hashGuestToken differs per token", () => {
    expect(hashGuestToken("a")).not.toBe(hashGuestToken("b"));
  });
});
