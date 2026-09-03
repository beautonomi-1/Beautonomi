import { describe, expect, it } from "vitest";
import {
  detectAccountLinkMethods,
  primaryAccountLinkOffer,
  shouldOfferSetPassword,
} from "../account-link";

describe("detectAccountLinkMethods", () => {
  it("offers Google when a google identity exists", () => {
    expect(detectAccountLinkMethods([{ provider: "google" }])).toEqual(["google"]);
    expect(primaryAccountLinkOffer(["google"])).toBe("google");
  });

  it("offers email code (and password) for email identities", () => {
    expect(detectAccountLinkMethods([{ provider: "email" }])).toEqual(["email", "password"]);
    expect(primaryAccountLinkOffer(["email", "password"])).toBe("email");
  });

  it("detects mixed google + email identities", () => {
    expect(
      detectAccountLinkMethods([{ provider: "google" }, { provider: "email" }]),
    ).toEqual(["google", "email", "password"]);
  });

  it("returns empty methods for missing identities", () => {
    expect(detectAccountLinkMethods(null)).toEqual([]);
    expect(detectAccountLinkMethods([])).toEqual([]);
  });
});

describe("shouldOfferSetPassword", () => {
  it("is true when there is no email/password identity", () => {
    expect(shouldOfferSetPassword([{ provider: "google" }])).toBe(true);
    expect(shouldOfferSetPassword([{ provider: "apple" }])).toBe(true);
  });

  it("is false when an email identity exists", () => {
    expect(shouldOfferSetPassword([{ provider: "email" }])).toBe(false);
    expect(shouldOfferSetPassword([{ provider: "google" }, { provider: "email" }])).toBe(false);
  });
});
