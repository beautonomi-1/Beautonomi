/**
 * Promotional-offer signature for StoreKit (intro offers and win-back offers
 * that require a server signature). Introductory offers configured on the
 * product in App Store Connect are applied by StoreKit without this.
 *
 * Payload format: Apple "Generating a signature for promotional offers".
 */

import { createSign, randomUUID } from "crypto";
import type { AppleIapConfig } from "@/lib/iap/apple/config";

export type ApplePromotionalOfferSignature = {
  identifier: string;
  keyIdentifier: string;
  nonce: string;
  signature: string;
  timestamp: number;
};

const INVISIBLE_SEPARATOR = "\u2063";

export function promotionalOfferSigningPayload(params: {
  bundleId: string;
  keyId: string;
  productId: string;
  offerId: string;
  appAccountToken: string;
  nonce: string;
  timestamp: number;
}): string {
  return [
    params.bundleId,
    params.keyId,
    params.productId,
    params.offerId,
    params.appAccountToken,
    params.nonce,
    String(params.timestamp),
  ].join(INVISIBLE_SEPARATOR);
}

export function signApplePromotionalOffer(
  config: AppleIapConfig,
  params: {
    productId: string;
    offerId: string;
    appAccountToken: string;
    nonce?: string;
    timestamp?: number;
  },
): ApplePromotionalOfferSignature {
  const nonce = (params.nonce ?? randomUUID()).toLowerCase();
  const timestamp = params.timestamp ?? Date.now();
  const payload = promotionalOfferSigningPayload({
    bundleId: config.bundleId,
    keyId: config.keyId,
    productId: params.productId,
    offerId: params.offerId,
    appAccountToken: params.appAccountToken,
    nonce,
    timestamp,
  });
  const sign = createSign("SHA256");
  sign.update(payload, "utf8");
  sign.end();
  const signature = sign.sign({ key: config.privateKeyPem, dsaEncoding: "ieee-p1363" });
  return {
    identifier: params.offerId,
    keyIdentifier: config.keyId,
    nonce,
    signature: signature.toString("base64"),
    timestamp,
  };
}
