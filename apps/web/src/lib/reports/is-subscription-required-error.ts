import { FetchError } from "@/lib/http/fetcher";

export function isSubscriptionRequiredError(err: unknown): boolean {
  return err instanceof FetchError && err.code === "SUBSCRIPTION_REQUIRED";
}

export function parseReportLoadError(err: unknown): {
  subscriptionRequired: boolean;
  message: string | null;
} {
  if (isSubscriptionRequiredError(err)) {
    return {
      subscriptionRequired: true,
      message: err instanceof FetchError ? err.message : "Subscription upgrade required",
    };
  }
  return {
    subscriptionRequired: false,
    message: err instanceof Error ? err.message : "Failed to load report",
  };
}
