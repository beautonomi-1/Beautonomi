import { describe, expect, it } from "vitest";
import { parseAppleTransactionJws } from "../jws";

function buildSampleTransactionJws(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "ES256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = Buffer.from("sample-signature").toString("base64url");
  return `${header}.${body}.${signature}`;
}

describe("parseAppleTransactionJws", () => {
  it("decodes a sample base64url payload without verifying the signature", () => {
    const signed = buildSampleTransactionJws({
      transactionId: "2000000123456789",
      originalTransactionId: "2000000123456789",
      productId: "com.beautonomi.partner.sub.growth.monthly",
      purchaseDate: 1_700_000_000_000,
      expiresDate: 1_702_592_000_000,
      environment: "Sandbox",
      currency: "ZAR",
      price: 119990,
      bundleId: "com.beautonomi.partner",
    });

    expect(parseAppleTransactionJws(signed)).toEqual({
      transactionId: "2000000123456789",
      originalTransactionId: "2000000123456789",
      productId: "com.beautonomi.partner.sub.growth.monthly",
      purchaseDate: 1_700_000_000_000,
      expiresDate: 1_702_592_000_000,
      gracePeriodExpiresDate: undefined,
      revocationDate: undefined,
      revocationReason: undefined,
      type: undefined,
      environment: "Sandbox",
      appAccountToken: undefined,
      price: 119990,
      currency: "ZAR",
      offerType: undefined,
      offerIdentifier: undefined,
      inAppOwnershipType: undefined,
      storefront: undefined,
      bundleId: "com.beautonomi.partner",
      subscriptionGroupIdentifier: undefined,
    });
  });

  it("accepts snake_case Apple payload keys", () => {
    const signed = buildSampleTransactionJws({
      transaction_id: "tx-snake",
      original_transaction_id: "orig-snake",
      product_id: "com.beautonomi.partner.ads.time.7d",
      purchase_date: 1_700_000_000_000,
    });

    expect(parseAppleTransactionJws(signed).transactionId).toBe("tx-snake");
    expect(parseAppleTransactionJws(signed).originalTransactionId).toBe("orig-snake");
    expect(parseAppleTransactionJws(signed).productId).toBe("com.beautonomi.partner.ads.time.7d");
  });

  it("throws when required identifiers are missing", () => {
    const signed = buildSampleTransactionJws({ productId: "com.beautonomi.partner.sub.growth.monthly" });
    expect(() => parseAppleTransactionJws(signed)).toThrow(
      "Apple transaction JWS missing transactionId or productId",
    );
  });
});
