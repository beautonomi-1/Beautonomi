import { describe, expect, it } from "vitest";
import {
  buildSignString,
  signWithPrivateKey,
  verifyWithPublicKey,
  formatPublicKeyPem,
} from "@/lib/payments/paycloud-sign";
import { PAYCLOUD_SANDBOX_FIXTURES } from "@/lib/payments/paycloud-sandbox-fixtures";

describe("paycloud-sign key formats", () => {
  const payload = { app_id: PAYCLOUD_SANDBOX_FIXTURES.app_id, method: "order.query", timestamp: 1 };

  it("signs with PKCS#8 sandbox private key", () => {
    const signString = buildSignString(payload);
    const signature = signWithPrivateKey(signString, PAYCLOUD_SANDBOX_FIXTURES.app_rsa_private_key_pkcs8);
    expect(signature.length).toBeGreaterThan(20);
  });

  it("round-trips a bare-base64 key pair through PEM assembly", () => {
    const signString = buildSignString(payload);
    const signature = signWithPrivateKey(signString, PAYCLOUD_SANDBOX_FIXTURES.app_rsa_private_key_pkcs8);

    expect(
      verifyWithPublicKey(
        signString,
        signature,
        formatPublicKeyPem(PAYCLOUD_SANDBOX_FIXTURES.app_rsa_public_key),
      ),
    ).toBe(true);
  });

  it("wraps long PEM bodies at 64 characters", () => {
    const pem = formatPublicKeyPem(PAYCLOUD_SANDBOX_FIXTURES.app_rsa_public_key);
    const bodyLines = pem.split("\n").slice(1, -1);
    expect(bodyLines.length).toBeGreaterThan(1);
    expect(bodyLines.every((line) => line.length <= 64)).toBe(true);
  });
});
