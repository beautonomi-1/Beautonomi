import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildSignString,
  signWithPrivateKey,
  verifyWithPublicKey,
  formatPrivateKeyPem,
  formatPublicKeyPem,
} from "@/lib/payments/paycloud-sign";
import { PAYCLOUD_SANDBOX_FIXTURES } from "@/lib/payments/paycloud-sandbox-fixtures";

describe("paycloud-sign key formats", () => {
  const payload = { app_id: PAYCLOUD_SANDBOX_FIXTURES.app_id, method: "order.query", timestamp: 1 };

  it("signs with PKCS#8 sandbox private key", () => {
    const signString = buildSignString(payload);
    const signature = signWithPrivateKey(signString, PAYCLOUD_SANDBOX_FIXTURES.app_rsa_private_key_pkcs8);
    expect(signature.length).toBeGreaterThan(20);
    const ok = verifyWithPublicKey(
      signString,
      signature,
      formatPublicKeyPem(PAYCLOUD_SANDBOX_FIXTURES.gateway_rsa_public_key),
    );
    expect(ok).toBe(false);
  });

  it("signs with PKCS#1 sandbox private key", () => {
    const signString = buildSignString(payload);
    const signature = signWithPrivateKey(signString, PAYCLOUD_SANDBOX_FIXTURES.app_rsa_private_key_pkcs1);
    expect(signature.length).toBeGreaterThan(20);
  });

  it("round-trips a bare-base64 key pair through PEM assembly", () => {
    const signString = buildSignString(payload);
    const signature = signWithPrivateKey(signString, PAYCLOUD_SANDBOX_FIXTURES.app_rsa_private_key_pkcs8);

    // Bare base64 SPKI derived from the same private key, i.e. the shape PayCloud publishes.
    const derivedPublicKey = crypto
      .createPublicKey(crypto.createPrivateKey(formatPrivateKeyPem(PAYCLOUD_SANDBOX_FIXTURES.app_rsa_private_key_pkcs8)))
      .export({ type: "spki", format: "der" })
      .toString("base64");

    expect(verifyWithPublicKey(signString, signature, formatPublicKeyPem(derivedPublicKey))).toBe(true);
  });

  it("wraps long PEM bodies at 64 characters", () => {
    const pem = formatPublicKeyPem(PAYCLOUD_SANDBOX_FIXTURES.gateway_rsa_public_key);
    const bodyLines = pem.split("\n").slice(1, -1);
    expect(bodyLines.length).toBeGreaterThan(1);
    expect(bodyLines.every((line) => line.length <= 64)).toBe(true);
  });
});
