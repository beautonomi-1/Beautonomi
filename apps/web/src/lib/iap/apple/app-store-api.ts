/**
 * App Store Server API client (JWT auth).
 *
 * Factual surface we use:
 * - subscription status / transaction info / order lookup / history
 * - consumption information (refund decision signal — not a refund)
 * - extend renewal date (complimentary days; Apple remains merchant of record)
 * - refund history (what Apple already refunded)
 *
 * Apple does not offer a developer-initiated IAP refund. The customer refunds
 * via Report a Problem; we answer CONSUMPTION_REQUEST and reverse entitlements
 * when Apple sends REFUND / REVOKE.
 */

import { createSign, randomUUID } from "crypto";
import type { AppleIapConfig } from "@/lib/iap/apple/config";

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64url");
}

function storeKitBase(environment: "Production" | "Sandbox"): string {
  return environment === "Sandbox"
    ? "https://api.storekit-sandbox.itunes.apple.com"
    : "https://api.storekit.itunes.apple.com";
}

export function createAppStoreServerJwt(config: AppleIapConfig, ttlSeconds = 1200): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", kid: config.keyId, typ: "JWT" };
  const payload = {
    iss: config.issuerId,
    iat: now,
    exp: now + ttlSeconds,
    aud: "appstoreconnect-v1",
    bid: config.bundleId,
  };
  const unsigned = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`;
  const sign = createSign("SHA256");
  sign.update(unsigned);
  sign.end();
  const signature = sign.sign({ key: config.privateKeyPem, dsaEncoding: "ieee-p1363" });
  return `${unsigned}.${base64UrlEncode(signature)}`;
}

async function storeKitFetch(
  config: AppleIapConfig,
  path: string,
  environment: "Production" | "Sandbox",
  init?: RequestInit,
): Promise<Response> {
  const token = createAppStoreServerJwt(config);
  return fetch(`${storeKitBase(environment)}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
}

async function readError(res: Response): Promise<string> {
  const text = await res.text();
  return text.slice(0, 400);
}

export async function fetchAppleSubscriptionStatuses(
  config: AppleIapConfig,
  originalTransactionId: string,
  environment: "Production" | "Sandbox" = "Production",
): Promise<unknown> {
  const res = await storeKitFetch(
    config,
    `/inApps/v1/subscriptions/${encodeURIComponent(originalTransactionId)}`,
    environment,
  );
  if (!res.ok) {
    throw new Error(`App Store Server API ${res.status}: ${await readError(res)}`);
  }
  return res.json();
}

export async function fetchAppleTransactionInfo(
  config: AppleIapConfig,
  transactionId: string,
  environment: "Production" | "Sandbox" = "Production",
): Promise<{ signedTransactionInfo?: string }> {
  const res = await storeKitFetch(
    config,
    `/inApps/v1/transactions/${encodeURIComponent(transactionId)}`,
    environment,
  );
  if (!res.ok) {
    throw new Error(`App Store transaction lookup ${res.status}: ${await readError(res)}`);
  }
  return res.json() as Promise<{ signedTransactionInfo?: string }>;
}

export async function lookupAppleOrder(
  config: AppleIapConfig,
  orderId: string,
  environment: "Production" | "Sandbox" = "Production",
): Promise<{ status?: number; signedTransactions?: string[] }> {
  const res = await storeKitFetch(
    config,
    `/inApps/v1/lookup/${encodeURIComponent(orderId)}`,
    environment,
  );
  if (!res.ok) {
    throw new Error(`App Store order lookup ${res.status}: ${await readError(res)}`);
  }
  return res.json() as Promise<{ status?: number; signedTransactions?: string[] }>;
}

export async function fetchAppleTransactionHistory(
  config: AppleIapConfig,
  originalTransactionId: string,
  environment: "Production" | "Sandbox" = "Production",
): Promise<{ signedTransactions?: string[]; hasMore?: boolean; revision?: string }> {
  const res = await storeKitFetch(
    config,
    `/inApps/v2/history/${encodeURIComponent(originalTransactionId)}`,
    environment,
  );
  if (!res.ok) {
    throw new Error(`App Store history ${res.status}: ${await readError(res)}`);
  }
  return res.json() as Promise<{ signedTransactions?: string[]; hasMore?: boolean; revision?: string }>;
}

export async function fetchAppleRefundHistory(
  config: AppleIapConfig,
  originalTransactionId: string,
  environment: "Production" | "Sandbox" = "Production",
): Promise<{ signedTransactions?: string[]; hasMore?: boolean }> {
  const res = await storeKitFetch(
    config,
    `/inApps/v2/refund/lookup/${encodeURIComponent(originalTransactionId)}`,
    environment,
  );
  if (!res.ok) {
    throw new Error(`App Store refund history ${res.status}: ${await readError(res)}`);
  }
  return res.json() as Promise<{ signedTransactions?: string[]; hasMore?: boolean }>;
}

export type ExtendAppleSubscriptionInput = {
  originalTransactionId: string;
  extendByDays: number;
  extendReasonCode: 0 | 1 | 2 | 3;
  requestIdentifier?: string;
  environment?: "Production" | "Sandbox";
};

export async function extendAppleSubscriptionRenewal(
  config: AppleIapConfig,
  input: ExtendAppleSubscriptionInput,
): Promise<{ success?: boolean; effectiveDate?: number }> {
  const days = Math.min(90, Math.max(1, Math.floor(input.extendByDays)));
  const res = await storeKitFetch(
    config,
    `/inApps/v1/subscriptions/extend/${encodeURIComponent(input.originalTransactionId)}`,
    input.environment ?? "Production",
    {
      method: "PUT",
      body: JSON.stringify({
        extendByDays: days,
        extendReasonCode: input.extendReasonCode,
        requestIdentifier: input.requestIdentifier ?? randomUUID(),
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`App Store extend ${res.status}: ${await readError(res)}`);
  }
  return res.json() as Promise<{ success?: boolean; effectiveDate?: number }>;
}

export async function sendAppleConsumptionInformation(
  config: AppleIapConfig,
  transactionId: string,
  body: Record<string, unknown>,
  environment: "Production" | "Sandbox" = "Production",
): Promise<void> {
  const res = await storeKitFetch(
    config,
    `/inApps/v1/transactions/consumption/${encodeURIComponent(transactionId)}`,
    environment,
    {
      method: "PUT",
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    throw new Error(`Apple consumption API ${res.status}: ${await readError(res)}`);
  }
}

export async function tryEnvironments<T>(
  run: (environment: "Production" | "Sandbox") => Promise<T>,
  preferred: "Production" | "Sandbox" = "Production",
): Promise<{ environment: "Production" | "Sandbox"; result: T }> {
  const order: Array<"Production" | "Sandbox"> =
    preferred === "Sandbox" ? ["Sandbox", "Production"] : ["Production", "Sandbox"];
  let lastError: unknown;
  for (const environment of order) {
    try {
      const result = await run(environment);
      return { environment, result };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("App Store lookup failed in both environments");
}
