import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  decryptCredentialsPayload,
  encryptCredentialsPayload,
  maskSecretHint,
} from "@/lib/orders/shipping-credentials-crypto";

describe("shipping-credentials-crypto", () => {
  const prev = process.env.SHIPPING_CREDENTIALS_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.SHIPPING_CREDENTIALS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  });

  afterEach(() => {
    process.env.SHIPPING_CREDENTIALS_ENCRYPTION_KEY = prev;
  });

  it("round-trips encrypted payloads", () => {
    const payload = { apiKey: "secret-key-123" };
    const blob = encryptCredentialsPayload(payload);
    expect(decryptCredentialsPayload<{ apiKey: string }>(blob).apiKey).toBe("secret-key-123");
  });

  it("masks secret hints", () => {
    expect(maskSecretHint("abcdefghijklmnop")).toBe("abcd…mnop");
  });
});
