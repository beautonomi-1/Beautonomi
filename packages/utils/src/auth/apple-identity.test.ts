import { describe, expect, it } from "vitest";
import { appleDisplayNameFallback, isApplePrimaryIdentity } from "./apple-identity";

describe("isApplePrimaryIdentity", () => {
  it("detects apple from identities", () => {
    expect(
      isApplePrimaryIdentity({
        identities: [{ provider: "apple" }],
      } as never),
    ).toBe(true);
  });

  it("detects apple from app_metadata.provider", () => {
    expect(
      isApplePrimaryIdentity({
        app_metadata: { provider: "apple" },
      } as never),
    ).toBe(true);
  });

  it("returns false for google", () => {
    expect(
      isApplePrimaryIdentity({
        identities: [{ provider: "google" }],
        app_metadata: { provider: "google" },
      } as never),
    ).toBe(false);
  });
});

describe("appleDisplayNameFallback", () => {
  it("uses metadata full_name first", () => {
    expect(
      appleDisplayNameFallback({
        user_metadata: { full_name: "Ada Lovelace" },
        email: "ada@privaterelay.appleid.com",
      } as never),
    ).toBe("Ada Lovelace");
  });

  it("falls back to email local-part", () => {
    expect(
      appleDisplayNameFallback({
        email: "reviewer@privaterelay.appleid.com",
      } as never),
    ).toBe("reviewer");
  });
});
