import { describe, expect, it } from "vitest";
import { verifyFlutterwaveWebhookHash } from "@/lib/payments/flutterwave-server";

describe("verifyFlutterwaveWebhookHash", () => {
  it("accepts exact verif-hash secret match", () => {
    expect(verifyFlutterwaveWebhookHash("my-secret-hash", "my-secret-hash")).toBe(true);
  });

  it("rejects HMAC-style hex that is not the plain secret", () => {
    expect(
      verifyFlutterwaveWebhookHash(
        "a".repeat(64),
        "my-secret-hash",
      ),
    ).toBe(false);
  });
});
