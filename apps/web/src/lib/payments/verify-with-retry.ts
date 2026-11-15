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
  /** Stripe Checkout success URL query param — enables verify before registry lookup. */
  sessionId?: string | null;
  /** Flutterwave redirect query param */
  transactionId?: string | null;
  /** Hosted-checkout redirect `status` (`failed` or `cancelled`). */
  redirectStatus?: string | null;
};

export function buildOnlineVerifyQuery(
  reference: string,
  sessionId?: string | null,
  transactionId?: string | null,
  redirectStatus?: string | null,
): string {
  const params = new URLSearchParams();
  params.set("reference", reference);
  const sid = sessionId?.trim();
  if (sid) params.set("session_id", sid);
  const tid = transactionId?.trim();
  if (tid) params.set("transaction_id", tid);
  const redirect = redirectStatus?.trim().toLowerCase();
  if (redirect === "failed" || redirect === "cancelled") params.set("status", redirect);
  return params.toString();
}

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

  const recordedPayment = typeof data.payment_status === "string" ? data.payment_status.toLowerCase() : "";
  const gateway = paystackStatus?.toLowerCase() ?? "";
  // Gateway success with the booking still unpaid means capture has not landed yet.
  if ((status === "success" || verified === true) && recordedPayment === "pending") return "pending";
  // An explicit pending status wins over verified:false (bank still processing).
  if (
    status === "pending" ||
    gateway === "pending" ||
    gateway === "ongoing" ||
    gateway === "processing" ||
    gateway === "queued"
  ) {
    return "pending";
  }
  if (status === "success" || verified === true) return "success";
  if (
    status === "failed" ||
    status === "cancelled" ||
    gateway === "failed" ||
    gateway === "abandoned" ||
    gateway === "reversed" ||
    verified === false
  ) {
    return "failed";
  }
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
  const sessionId = options.sessionId ?? null;
  const transactionId = options.transactionId ?? null;
  const redirectStatus = options.redirectStatus ?? null;

  let attempts = 0;
  let lastData: Record<string, unknown> | null = null;
  let lastErrorMessage: string | null = null;

  while (attempts < maxAttempts) {
    attempts += 1;
    try {
      const q = buildOnlineVerifyQuery(reference, sessionId, transactionId, redirectStatus);
      const sep = endpoint.includes("?") ? "&" : "?";
      const res = await fetcher.get<{ data?: T }>(`${endpoint}${sep}${q}`, { staleTimeMs: 0 });
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

