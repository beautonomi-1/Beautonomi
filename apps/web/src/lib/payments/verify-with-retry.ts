import { fetcher, FetchError } from "@/lib/http/fetcher";

export type VerifyWithRetryResult<T = Record<string, unknown>> = {
  attempts: number;
  data: T | null;
  status: "success" | "failed" | "pending" | "unknown";
  errorMessage: string | null;
};

type VerifyWithRetryOptions = {
  endpoint?: string;
  maxAttempts?: number;
  delayMs?: number;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readStatus(data: Record<string, unknown> | null): VerifyWithRetryResult["status"] {
  if (!data) return "unknown";
  const status = typeof data.status === "string" ? data.status : null;
  const paystackStatus =
    typeof data.paystackStatus === "string"
      ? data.paystackStatus
      : typeof data.paystack_status === "string"
        ? data.paystack_status
        : null;
  const verified = typeof data.verified === "boolean" ? data.verified : null;

  if (status === "success" || verified === true) return "success";
  if (status === "failed" || paystackStatus === "failed" || verified === false) return "failed";
  if (status === "pending" || paystackStatus === "pending") return "pending";
  return "unknown";
}

function readMessage(data: Record<string, unknown> | null): string | null {
  if (!data) return null;
  return typeof data.message === "string" ? data.message : null;
}

/**
 * Retry wrapper for Paystack callback verification pages.
 * Handles temporary auth/cookie drift after 3DS redirects and webhook race windows.
 */
export async function verifyWithRetry<T = Record<string, unknown>>(
  reference: string,
  options: VerifyWithRetryOptions = {},
): Promise<VerifyWithRetryResult<T>> {
  const endpoint = options.endpoint ?? "/api/paystack/verify";
  const maxAttempts = options.maxAttempts ?? 5;
  const delayMs = options.delayMs ?? 1500;

  let attempts = 0;
  let lastData: Record<string, unknown> | null = null;
  let lastErrorMessage: string | null = null;

  while (attempts < maxAttempts) {
    attempts += 1;
    try {
      const res = await fetcher.get<{ data?: T }>(
        `${endpoint}${endpoint.includes("?") ? "&" : "?"}reference=${encodeURIComponent(reference)}`,
        { staleTimeMs: 0 },
      );
      const payload = (res?.data ?? null) as Record<string, unknown> | null;
      lastData = payload;
      const status = readStatus(payload);
      const message = readMessage(payload);

      if (status === "success" || status === "failed") {
        return {
          attempts,
          data: (payload as T | null) ?? null,
          status,
          errorMessage: status === "failed" ? message : null,
        };
      }

      if (status === "unknown" && attempts >= maxAttempts) {
        return {
          attempts,
          data: (payload as T | null) ?? null,
          status: "unknown",
          errorMessage: message,
        };
      }
    } catch (error) {
      const message = error instanceof FetchError ? error.message : "Payment verification failed";
      lastErrorMessage = message;
      if (attempts >= maxAttempts) {
        return {
          attempts,
          data: (lastData as T | null) ?? null,
          status: "unknown",
          errorMessage: lastErrorMessage,
        };
      }
    }

    await sleep(delayMs);
  }

  return {
    attempts,
    data: (lastData as T | null) ?? null,
    status: readStatus(lastData),
    errorMessage: lastErrorMessage ?? readMessage(lastData),
  };
}

