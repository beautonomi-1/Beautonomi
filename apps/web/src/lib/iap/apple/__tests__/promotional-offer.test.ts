import { describe, expect, it } from "vitest";
import { promotionalOfferSigningPayload, signApplePromotionalOffer } from "../promotional-offer";
import type { AppleIapConfig } from "../config";
import { TEST_LEAF_PRIVATE_KEY_PEM } from "./fixtures/test-chain";

describe("promotionalOfferSigningPayload", () => {
  it("joins Apple's promotional-offer fields with the invisible separator", () => {
    const payload = promotionalOfferSigningPayload({
      bundleId: "com.beautonomi.partner",
      keyId: "KEYID123",
      productId: "com.beautonomi.partner.sub.growth.monthly",
      offerId: "WINBACK_GROWTH",
      appAccountToken: "provider-uuid",
      nonce: "nonce-1",
      timestamp: 1_700_000_000_000,
    });
    expect(payload.split("\u2063")).toEqual([
      "com.beautonomi.partner",
      "KEYID123",
      "com.beautonomi.partner.sub.growth.monthly",
      "WINBACK_GROWTH",
      "provider-uuid",
      "nonce-1",
      "1700000000000",
    ]);
  });
});

describe("signApplePromotionalOffer", () => {
  it("returns the StoreKit DiscountOffer fields", () => {
    const config: AppleIapConfig = {
      issuerId: "ISSUER",
      keyId: "KEYID123",
      privateKeyPem: TEST_LEAF_PRIVATE_KEY_PEM,
      bundleId: "com.beautonomi.partner",
      commissionRate: 0.15,
      enabled: true,
    };
    const signed = signApplePromotionalOffer(config, {
      productId: "com.beautonomi.partner.sub.growth.monthly",
      offerId: "WINBACK_GROWTH",
      appAccountToken: "provider-uuid",
      nonce: "11111111-1111-1111-1111-111111111111",
      timestamp: 1_700_000_000_000,
    });
    expect(signed).toMatchObject({
      identifier: "WINBACK_GROWTH",
      keyIdentifier: "KEYID123",
      nonce: "11111111-1111-1111-1111-111111111111",
      timestamp: 1_700_000_000_000,
    });
    expect(signed.signature.length).toBeGreaterThan(20);
  });
});
