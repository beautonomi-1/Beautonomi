/**
 * Decode and verify Apple signed transaction / notification JWS payloads.
 *
 * Verification anchors the x5c chain in the JWS header to Apple Root CA - G3 and
 * checks the ES256 signature over the signing input. It is on by default and can
 * only be turned off with APPLE_IAP_VERIFY_JWS=false, which is required for Xcode
 * StoreKit configuration files because those sign with a local test certificate
 * rather than an Apple-issued one. Sandbox and production both use real chains.
 */

import { X509Certificate, createVerify } from "crypto";
import {
  APPLE_ROOT_CA_G3_PEM,
  APPLE_ROOT_CA_G3_SHA256,
} from "@/lib/iap/apple/apple-root-ca";
import { createHash } from "crypto";

export type AppleTransactionPayload = {
  transactionId: string;
  originalTransactionId: string;
  productId: string;
  purchaseDate: number;
  expiresDate?: number;
  gracePeriodExpiresDate?: number;
  revocationDate?: number;
  revocationReason?: number;
  type?: string;
  environment?: "Sandbox" | "Production";
  appAccountToken?: string;
  price?: number;
  currency?: string;
  offerType?: number;
  offerIdentifier?: string;
  inAppOwnershipType?: string;
  storefront?: string;
  bundleId?: string;
  subscriptionGroupIdentifier?: string;
};

export type AppleNotificationPayload = {
  notificationType: string;
  subtype?: string;
  notificationUUID: string;
  data?: {
    signedTransactionInfo?: string;
    signedRenewalInfo?: string;
    environment?: string;
    bundleId?: string;
  };
};

function decodeBase64Url(segment: string): string {
  const padded = segment.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? padded : padded + "=".repeat(4 - (padded.length % 4));
  return Buffer.from(pad, "base64").toString("utf8");
}

export function decodeAppleJwsPayload<T = Record<string, unknown>>(signed: string): T {
  const parts = signed.split(".");
  if (parts.length < 2) {
    throw new Error("Invalid JWS: expected header.payload.signature");
  }
  const json = decodeBase64Url(parts[1]!);
  return JSON.parse(json) as T;
}

export function appleJwsVerificationEnabled(): boolean {
  const raw = (process.env.APPLE_IAP_VERIFY_JWS ?? "").trim().toLowerCase();
  return raw !== "false" && raw !== "0" && raw !== "off";
}

function derFingerprint(cert: X509Certificate): string {
  return createHash("sha256")
    .update(cert.raw)
    .digest("hex")
    .toUpperCase()
    .replace(/(.{2})(?=.)/g, "$1:");
}

/**
 * Verifies the ES256 signature and certificate chain of an Apple JWS.
 * Throws when the payload is not genuinely signed by Apple.
 */
export function verifyAppleJwsSignature(signed: string, now: Date = new Date()): void {
  const parts = signed.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid Apple JWS: expected three segments");
  }
  const [headerSegment, payloadSegment, signatureSegment] = parts as [
    string,
    string,
    string,
  ];

  let header: { alg?: unknown; x5c?: unknown };
  try {
    header = JSON.parse(decodeBase64Url(headerSegment)) as typeof header;
  } catch {
    throw new Error("Invalid Apple JWS: unreadable header");
  }

  if (header.alg !== "ES256") {
    throw new Error(`Invalid Apple JWS: unsupported alg ${String(header.alg)}`);
  }
  if (!Array.isArray(header.x5c) || header.x5c.length < 2) {
    throw new Error("Invalid Apple JWS: missing x5c certificate chain");
  }

  const chain = header.x5c.map((entry, index) => {
    try {
      return new X509Certificate(Buffer.from(String(entry), "base64"));
    } catch {
      throw new Error(`Invalid Apple JWS: unparsable certificate at x5c[${index}]`);
    }
  });

  for (const [index, cert] of chain.entries()) {
    const from = new Date(cert.validFrom).getTime();
    const to = new Date(cert.validTo).getTime();
    if (!Number.isFinite(from) || !Number.isFinite(to)) {
      throw new Error(`Invalid Apple JWS: certificate at x5c[${index}] has no validity window`);
    }
    if (now.getTime() < from || now.getTime() > to) {
      throw new Error(`Invalid Apple JWS: certificate at x5c[${index}] is outside its validity window`);
    }
  }

  // Each certificate must be signed by the next one up the chain.
  for (let i = 0; i < chain.length - 1; i += 1) {
    if (!chain[i]!.verify(chain[i + 1]!.publicKey)) {
      throw new Error(`Invalid Apple JWS: x5c[${i}] is not signed by x5c[${i + 1}]`);
    }
  }

  const verifier = createVerify("SHA256");
  verifier.update(`${headerSegment}.${payloadSegment}`);
  verifier.end();
  const signatureValid = verifier.verify(
    { key: chain[0]!.publicKey, dsaEncoding: "ieee-p1363" },
    Buffer.from(signatureSegment, "base64url"),
  );
  if (!signatureValid) {
    throw new Error("Invalid Apple JWS: signature does not match the signing certificate");
  }

  // The chain must terminate at Apple Root CA - G3, either because Apple
  // included the root itself or because the topmost intermediate is signed by it.
  // Everything above is satisfiable by any self-made chain, so this pin is what
  // actually proves Apple issued the payload.
  const appleRoot = new X509Certificate(APPLE_ROOT_CA_G3_PEM);
  const top = chain[chain.length - 1]!;
  const anchored =
    derFingerprint(top) === APPLE_ROOT_CA_G3_SHA256 || top.verify(appleRoot.publicKey);
  if (!anchored) {
    throw new Error("Invalid Apple JWS: chain is not anchored to Apple Root CA - G3");
  }
}

/** Verifies the signature unless verification is explicitly disabled. */
export function assertAppleJwsSignature(signed: string): void {
  if (!appleJwsVerificationEnabled()) return;
  verifyAppleJwsSignature(signed);
}

export function parseAppleTransactionJws(signedTransaction: string): AppleTransactionPayload {
  const raw = decodeAppleJwsPayload<Record<string, unknown>>(signedTransaction);
  const transactionId = String(raw.transactionId ?? raw.transaction_id ?? "").trim();
  const originalTransactionId = String(
    raw.originalTransactionId ?? raw.original_transaction_id ?? transactionId,
  ).trim();
  const productId = String(raw.productId ?? raw.product_id ?? "").trim();
  if (!transactionId || !productId) {
    throw new Error("Apple transaction JWS missing transactionId or productId");
  }
  return {
    transactionId,
    originalTransactionId,
    productId,
    purchaseDate: Number(raw.purchaseDate ?? raw.purchase_date ?? Date.now()),
    expiresDate: raw.expiresDate != null ? Number(raw.expiresDate) : undefined,
    gracePeriodExpiresDate:
      raw.gracePeriodExpiresDate != null ? Number(raw.gracePeriodExpiresDate) : undefined,
    revocationDate: raw.revocationDate != null ? Number(raw.revocationDate) : undefined,
    revocationReason:
      raw.revocationReason != null ? Number(raw.revocationReason) : undefined,
    type: raw.type != null ? String(raw.type) : undefined,
    environment:
      raw.environment === "Sandbox" || raw.environment === "Production"
        ? raw.environment
        : undefined,
    appAccountToken:
      raw.appAccountToken != null ? String(raw.appAccountToken) : undefined,
    price: raw.price != null ? Number(raw.price) : undefined,
    currency: raw.currency != null ? String(raw.currency) : undefined,
    offerType: raw.offerType != null ? Number(raw.offerType) : undefined,
    offerIdentifier:
      raw.offerIdentifier != null ? String(raw.offerIdentifier) : undefined,
    inAppOwnershipType:
      raw.inAppOwnershipType != null ? String(raw.inAppOwnershipType) : undefined,
    storefront: raw.storefront != null ? String(raw.storefront) : undefined,
    bundleId: raw.bundleId != null ? String(raw.bundleId) : undefined,
    subscriptionGroupIdentifier:
      raw.subscriptionGroupIdentifier != null
        ? String(raw.subscriptionGroupIdentifier)
        : undefined,
  };
}

export function parseAppleNotificationJws(signedPayload: string): AppleNotificationPayload {
  const raw = decodeAppleJwsPayload<Record<string, unknown>>(signedPayload);
  return {
    notificationType: String(raw.notificationType ?? ""),
    subtype: raw.subtype != null ? String(raw.subtype) : undefined,
    notificationUUID: String(raw.notificationUUID ?? raw.notification_uuid ?? ""),
    data: raw.data as AppleNotificationPayload["data"],
  };
}

export type AppleRenewalInfoPayload = {
  originalTransactionId: string;
  autoRenewStatus?: number;
  autoRenewProductId?: string;
  productId?: string;
  expirationIntent?: number;
  gracePeriodExpiresDate?: number;
  isInBillingRetryPeriod?: boolean;
  renewalDate?: number;
  environment?: "Sandbox" | "Production";
  /** 0 none, 1 pending customer consent, 2 consented */
  priceIncreaseStatus?: number;
  offerIdentifier?: string;
  offerType?: number;
};

export function parseAppleRenewalInfoJws(signedRenewalInfo: string): AppleRenewalInfoPayload {
  const raw = decodeAppleJwsPayload<Record<string, unknown>>(signedRenewalInfo);
  return {
    originalTransactionId: String(raw.originalTransactionId ?? "").trim(),
    autoRenewStatus: raw.autoRenewStatus != null ? Number(raw.autoRenewStatus) : undefined,
    autoRenewProductId:
      raw.autoRenewProductId != null ? String(raw.autoRenewProductId) : undefined,
    productId: raw.productId != null ? String(raw.productId) : undefined,
    expirationIntent:
      raw.expirationIntent != null ? Number(raw.expirationIntent) : undefined,
    gracePeriodExpiresDate:
      raw.gracePeriodExpiresDate != null ? Number(raw.gracePeriodExpiresDate) : undefined,
    isInBillingRetryPeriod:
      raw.isInBillingRetryPeriod != null ? Boolean(raw.isInBillingRetryPeriod) : undefined,
    renewalDate: raw.renewalDate != null ? Number(raw.renewalDate) : undefined,
    environment:
      raw.environment === "Sandbox" || raw.environment === "Production"
        ? raw.environment
        : undefined,
    priceIncreaseStatus:
      raw.priceIncreaseStatus != null ? Number(raw.priceIncreaseStatus) : undefined,
    offerIdentifier: raw.offerIdentifier != null ? String(raw.offerIdentifier) : undefined,
    offerType: raw.offerType != null ? Number(raw.offerType) : undefined,
  };
}

/** Verifies the Apple signature, then parses nested signedRenewalInfo. */
export function verifyAndParseAppleRenewalInfoJws(
  signedRenewalInfo: string,
): AppleRenewalInfoPayload {
  assertAppleJwsSignature(signedRenewalInfo);
  return parseAppleRenewalInfoJws(signedRenewalInfo);
}

/**
 * Verifies the Apple signature, then parses the transaction and confirms it was
 * issued for our bundle so a signed payload from another app cannot be replayed.
 */
export function verifyAndParseAppleTransactionJws(
  signedTransaction: string,
  options: { expectedBundleId?: string } = {},
): AppleTransactionPayload {
  assertAppleJwsSignature(signedTransaction);
  const tx = parseAppleTransactionJws(signedTransaction);
  const expected = options.expectedBundleId?.trim();
  if (expected && tx.bundleId && tx.bundleId !== expected) {
    throw new Error(
      `Apple transaction bundleId mismatch: expected ${expected}, received ${tx.bundleId}`,
    );
  }
  return tx;
}

/** Verifies the Apple signature, then parses a server notification envelope. */
export function verifyAndParseAppleNotificationJws(
  signedPayload: string,
  options: { expectedBundleId?: string } = {},
): AppleNotificationPayload {
  assertAppleJwsSignature(signedPayload);
  const notification = parseAppleNotificationJws(signedPayload);
  const expected = options.expectedBundleId?.trim();
  const received = notification.data?.bundleId;
  if (expected && received && received !== expected) {
    throw new Error(
      `Apple notification bundleId mismatch: expected ${expected}, received ${received}`,
    );
  }
  return notification;
}

export function appleMillisToIso(ms: number | undefined): string | null {
  if (ms == null || !Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

export function applePriceToMajor(priceMilli: number | undefined, currency?: string): number {
  if (priceMilli == null || !Number.isFinite(priceMilli)) return 0;
  // Apple StoreKit price is in milli-units of currency
  const major = priceMilli / 1000;
  if (currency?.toUpperCase() === "ZAR") {
    return Math.round(major * 100) / 100;
  }
  return Math.round(major * 100) / 100;
}
