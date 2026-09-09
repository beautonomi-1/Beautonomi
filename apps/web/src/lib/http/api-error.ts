import { FetchError } from "./fetcher";
import { isPlanGateErrorCode } from "@/lib/subscriptions/subscription-upgrade-copy";

/** User-facing message from fetch/API failures (works with FetchError from the shared fetcher). */
export function formatApiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof FetchError) return error.message || fallback;
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return fallback;
}

/** Loose UUID check aligned with common API `z.string().uuid()` expectations. */
export function isLikelyUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id.trim());
}

/** Suffix for toasts when the API returned a plan gate. Skipped if the body already mentions upgrade. */
export function subscriptionUpgradeHint(error: unknown): string {
  if (!(error instanceof FetchError) || !isPlanGateErrorCode(error.code)) return "";
  const msg = (error.message || "").toLowerCase();
  if (msg.includes("upgrade") || msg.includes("subscription") || msg.includes("view plans")) {
    return "";
  }
  return " Open Subscription to view plans.";
}
