import { api } from "@/lib/api-client";
import { safeLog, safeWarn } from "@/lib/payments/safeLog";

/**
 * Mobile Paystack callback verification with retry-and-backoff.
 *
 * Mirrors the web helper at apps/web/src/lib/payments/verify-with-retry.ts.
 * Bridges the 1–5s Paystack-webhook race window so callback screens never
 * surface a misleading "Payment Not Confirmed" toast on the happy path, and
 * fall back to a soft-success "your payment is being confirmed" message when
 * the webhook is still pending after all attempts.
 *
 * Server-side both `/api/paystack/verify` and `/api/paystack/verify-reference`
 * use `optionalAuthInApi`, so this works even if the Supabase session expired
 * during a long 3DS / OTP challenge.
 */

export type VerifyStatus = "success" | "failed" | "pending" | "unknown";

export type VerifyResult<T> = {
  attempts: number;
  data: T | null;
  status: VerifyStatus;
  errorMessage: string | null;
};

type Options = {
  endpoint?: string;
  maxAttempts?: number;
  delayMs?: number;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function readStatus(d: Record<string, unknown> | null): VerifyStatus {
  if (!d) return "unknown";
  const s = typeof d.status === "string" ? d.status : null;
  const ps =
    typeof d.paystackStatus === "string"
      ? d.paystackStatus
      : typeof d.paystack_status === "string"
        ? (d.paystack_status as string)
        : null;
  const v = typeof d.verified === "boolean" ? d.verified : null;
  if (s === "success" || v === true) return "success";
  if (s === "failed" || ps === "failed" || v === false) return "failed";
  if (s === "pending" || ps === "pending") return "pending";
  return "unknown";
}

function readMessage(d: Record<string, unknown> | null): string | null {
  if (!d) return null;
  return typeof d.message === "string" ? d.message : null;
}

export async function verifyPaystackWithRetry<T = Record<string, unknown>>(
  reference: string,
  opts: Options = {},
): Promise<VerifyResult<T>> {
  const endpoint = opts.endpoint ?? "/api/paystack/verify";
  const maxAttempts = Math.max(1, opts.maxAttempts ?? 5);
  const delayMs = Math.max(0, opts.delayMs ?? 1500);
  const trimmedRef = reference.trim();

  if (!trimmedRef) {
    return {
      attempts: 0,
      data: null,
      status: "unknown",
      errorMessage: "Missing reference",
    };
  }

  let attempts = 0;
  let last: Record<string, unknown> | null = null;
  let lastErr: string | null = null;

  while (attempts < maxAttempts) {
    attempts += 1;
    try {
      const res = await api.get<T>(
        `${endpoint}${endpoint.includes("?") ? "&" : "?"}reference=${encodeURIComponent(trimmedRef)}`,
      );
      if (res.error) {
        lastErr = res.error.message ?? "Payment verification failed";
        safeWarn("verify attempt error", { attempts, error: res.error });
      } else {
        const payload = (res.data ?? null) as Record<string, unknown> | null;
        last = payload;
        const status = readStatus(payload);
        if (status === "success" || status === "failed") {
          safeLog("verify resolved", { attempts, status });
          return {
            attempts,
            data: (payload as T | null) ?? null,
            status,
            errorMessage: status === "failed" ? readMessage(payload) : null,
          };
        }
      }
    } catch (e) {
      lastErr = e instanceof Error ? e.message : "Payment verification failed";
      safeWarn("verify attempt threw", { attempts, error: lastErr });
    }
    if (attempts < maxAttempts) await sleep(delayMs);
  }

  const finalStatus = readStatus(last);
  safeLog("verify retries exhausted", {
    attempts,
    finalStatus,
  });
  return {
    attempts,
    data: (last as T | null) ?? null,
    status: finalStatus,
    errorMessage: lastErr ?? readMessage(last),
  };
}
