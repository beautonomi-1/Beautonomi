import { FetchError } from "./fetcher";

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

/** Suffix for toasts when the API returned SUBSCRIPTION_REQUIRED. */
export function subscriptionUpgradeHint(error: unknown): string {
  if (error instanceof FetchError && error.code === "SUBSCRIPTION_REQUIRED") {
    return " Upgrade your plan to use this feature — open Provider → Subscription (View plans & billing).";
  }
  return "";
}
