import { X509Certificate, createSign } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  APPLE_ROOT_CA_G3_PEM,
  APPLE_ROOT_CA_G3_SHA256,
} from "../apple-root-ca";
import { TEST_LEAF_PRIVATE_KEY_PEM, TEST_X5C_CHAIN } from "./fixtures/test-chain";
import {
  appleJwsVerificationEnabled,
  assertAppleJwsSignature,
  verifyAndParseAppleRenewalInfoJws,
  verifyAndParseAppleTransactionJws,
  verifyAppleJwsSignature,
} from "../jws";

const leafKey = TEST_LEAF_PRIVATE_KEY_PEM;
const testChain = TEST_X5C_CHAIN;

const SAMPLE_TX = {
  transactionId: "2000000123456789",
  originalTransactionId: "2000000123456789",
  productId: "com.beautonomi.partner.sub.growth.monthly",
  purchaseDate: 1_700_000_000_000,
  bundleId: "com.beautonomi.partner",
};

/** Builds a genuinely ES256-signed JWS using the throwaway test chain. */
function signWithTestChain(
  payload: Record<string, unknown>,
  options: { x5c?: unknown; alg?: string } = {},
): string {
  const header = {
    alg: options.alg ?? "ES256",
    x5c: options.x5c ?? testChain,
  };
  const headerSegment = Buffer.from(JSON.stringify(header)).toString("base64url");
  const payloadSegment = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signer = createSign("SHA256");
  signer.update(`${headerSegment}.${payloadSegment}`);
  signer.end();
  const signature = signer.sign({ key: leafKey, dsaEncoding: "ieee-p1363" });
  return `${headerSegment}.${payloadSegment}.${signature.toString("base64url")}`;
}

/** A payload with no certificate chain at all, as a forger would produce. */
function unsignedJws(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "ES256", typ: "JWT" })).toString(
    "base64url",
  );
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.${Buffer.from("forged").toString("base64url")}`;
}

describe("Apple root CA anchor", () => {
  it("embeds the published Apple Root CA - G3", () => {
    const cert = new X509Certificate(APPLE_ROOT_CA_G3_PEM);
    expect(cert.subject).toContain("Apple Root CA - G3");
    expect(APPLE_ROOT_CA_G3_SHA256).toBe(
      "63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79",
    );
  });
});

describe("verifyAppleJwsSignature", () => {
  it("rejects a payload with no certificate chain", () => {
    expect(() => verifyAppleJwsSignature(unsignedJws(SAMPLE_TX))).toThrow(
      /missing x5c certificate chain/,
    );
  });

  it("rejects a chain that is valid on its own but not issued by Apple", () => {
    // The signature and every chain link verify here, so only the root pin
    // stands between a self-made chain and a free subscription.
    expect(() => verifyAppleJwsSignature(signWithTestChain(SAMPLE_TX))).toThrow(
      /not anchored to Apple Root CA - G3/,
    );
  });

  it("rejects a tampered payload even when the chain is well formed", () => {
    const signed = signWithTestChain(SAMPLE_TX);
    const [header, , signature] = signed.split(".");
    const swapped = Buffer.from(
      JSON.stringify({ ...SAMPLE_TX, productId: "com.beautonomi.partner.sub.pro.yearly" }),
    ).toString("base64url");
    expect(() => verifyAppleJwsSignature(`${header}.${swapped}.${signature}`)).toThrow(
      /signature does not match/,
    );
  });

  it("rejects an unexpected signing algorithm", () => {
    expect(() => verifyAppleJwsSignature(signWithTestChain(SAMPLE_TX, { alg: "none" }))).toThrow(
      /unsupported alg none/,
    );
  });

  it("rejects a single-certificate chain", () => {
    expect(() =>
      verifyAppleJwsSignature(signWithTestChain(SAMPLE_TX, { x5c: [testChain[0]] })),
    ).toThrow(/missing x5c certificate chain/);
  });

  it("rejects an unparsable certificate entry", () => {
    expect(() =>
      verifyAppleJwsSignature(signWithTestChain(SAMPLE_TX, { x5c: ["not-a-cert", testChain[1]] })),
    ).toThrow(/unparsable certificate at x5c\[0\]/);
  });

  it("rejects a chain whose links do not match", () => {
    // Leaf followed by the root skips the issuing intermediate.
    expect(() =>
      verifyAppleJwsSignature(signWithTestChain(SAMPLE_TX, { x5c: [testChain[0], testChain[2]] })),
    ).toThrow(/x5c\[0\] is not signed by x5c\[1\]/);
  });

  it("rejects a malformed token", () => {
    expect(() => verifyAppleJwsSignature("only.two")).toThrow(/expected three segments/);
  });

  it("rejects certificates outside their validity window", () => {
    const signed = signWithTestChain(SAMPLE_TX);
    expect(() => verifyAppleJwsSignature(signed, new Date("1999-01-01T00:00:00Z"))).toThrow(
      /outside its validity window/,
    );
  });
});

describe("verification kill switch", () => {
  const original = process.env.APPLE_IAP_VERIFY_JWS;
  afterEach(() => {
    if (original === undefined) delete process.env.APPLE_IAP_VERIFY_JWS;
    else process.env.APPLE_IAP_VERIFY_JWS = original;
  });

  it("verifies by default, including when the variable is unset", () => {
    delete process.env.APPLE_IAP_VERIFY_JWS;
    expect(appleJwsVerificationEnabled()).toBe(true);
    expect(() => assertAppleJwsSignature(unsignedJws(SAMPLE_TX))).toThrow();
  });

  it("stays on for any value other than an explicit off switch", () => {
    process.env.APPLE_IAP_VERIFY_JWS = "true";
    expect(appleJwsVerificationEnabled()).toBe(true);
    process.env.APPLE_IAP_VERIFY_JWS = "yes";
    expect(appleJwsVerificationEnabled()).toBe(true);
  });

  it("can be switched off for Xcode StoreKit configuration files", () => {
    for (const value of ["false", "0", "off", "OFF"]) {
      process.env.APPLE_IAP_VERIFY_JWS = value;
      expect(appleJwsVerificationEnabled()).toBe(false);
      expect(() => assertAppleJwsSignature(unsignedJws(SAMPLE_TX))).not.toThrow();
    }
  });
});

describe("verifyAndParseAppleTransactionJws", () => {
  const original = process.env.APPLE_IAP_VERIFY_JWS;
  afterEach(() => {
    if (original === undefined) delete process.env.APPLE_IAP_VERIFY_JWS;
    else process.env.APPLE_IAP_VERIFY_JWS = original;
  });

  it("rejects a transaction signed for a different app", () => {
    process.env.APPLE_IAP_VERIFY_JWS = "false";
    const signed = unsignedJws({ ...SAMPLE_TX, bundleId: "com.someoneelse.app" });
    expect(() =>
      verifyAndParseAppleTransactionJws(signed, { expectedBundleId: "com.beautonomi.partner" }),
    ).toThrow(/bundleId mismatch/);
  });

  it("accepts a transaction for our bundle", () => {
    process.env.APPLE_IAP_VERIFY_JWS = "false";
    const tx = verifyAndParseAppleTransactionJws(unsignedJws(SAMPLE_TX), {
      expectedBundleId: "com.beautonomi.partner",
    });
    expect(tx.productId).toBe("com.beautonomi.partner.sub.growth.monthly");
  });
});

describe("verifyAndParseAppleRenewalInfoJws", () => {
  const original = process.env.APPLE_IAP_VERIFY_JWS;
  afterEach(() => {
    if (original === undefined) delete process.env.APPLE_IAP_VERIFY_JWS;
    else process.env.APPLE_IAP_VERIFY_JWS = original;
  });

  it("rejects an unsigned nested renewal payload", () => {
    delete process.env.APPLE_IAP_VERIFY_JWS;
    expect(() =>
      verifyAndParseAppleRenewalInfoJws(
        unsignedJws({ originalTransactionId: "2000000123456789", autoRenewStatus: 1 }),
      ),
    ).toThrow(/missing x5c certificate chain/);
  });

  it("parses renewal info when verification is off for StoreKit files", () => {
    process.env.APPLE_IAP_VERIFY_JWS = "false";
    const renewal = verifyAndParseAppleRenewalInfoJws(
      unsignedJws({ originalTransactionId: "2000000123456789", autoRenewStatus: 0 }),
    );
    expect(renewal.originalTransactionId).toBe("2000000123456789");
    expect(renewal.autoRenewStatus).toBe(0);
  });
});
