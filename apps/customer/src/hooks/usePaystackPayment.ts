/**
 * Paystack payment flow for native app.
 *
 * Supports two flows:
 * 1. New card: Initialize -> open hosted checkout in WebBrowser -> webhook saves card if requested
 * 2. Saved card: Charge authorization directly via API (no redirect needed)
 */
import { useState, useCallback, useEffect, useRef } from "react";
import * as WebBrowser from "expo-web-browser";
import * as ExpoLinking from "expo-linking";
import { api } from "@/lib/api-client";
import { getAnalyticsClient } from "@/lib/analytics-rn";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";

interface PaystackInitResponse {
  authorization_url: string;
  reference: string;
  access_code?: string;
}

interface ChargeResponse {
  transaction: { status: string; reference: string };
  reference: string;
  status: string;
  message: string;
}

interface PayParams {
  booking_id: string;
  amount: number;
  email: string;
  currency?: string;
  save_card?: boolean;
  customer_id?: string;
}

interface PayWithSavedCardParams {
  payment_method_id: string;
  amount: number;
  email: string;
  currency?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Poll `/api/me/bookings/:id` until payment is confirmed or max attempts exhausted.
 *
 * Criteria (strongest version — handles `pending_payment` post-595 trigger):
 *   - `payment_status` is `paid` or `partially_paid`
 *   - OR `status` is not `pending` and not `pending_payment`
 */
export async function pollBookingPaymentSettled(
  bookingId: string,
  fetchFn: (url: string) => Promise<{ data: unknown; error?: { message?: string } | null }>,
  opts?: { maxAttempts?: number; intervalMs?: number },
): Promise<boolean> {
  const MAX_ATTEMPTS = opts?.maxAttempts ?? 10;
  const INTERVAL_MS = opts?.intervalMs ?? 2000;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
    try {
      const check = await fetchFn(`/api/me/bookings/${encodeURIComponent(bookingId)}`);
      const d = (check.data ?? null) as { status?: string; payment_status?: string } | null;
      const paidByGateway = d?.payment_status === "paid" || d?.payment_status === "partially_paid";
      const statusConfirmed = !!d?.status && d.status !== "pending" && d.status !== "pending_payment";
      if (paidByGateway || statusConfirmed) return true;
    } catch {
      /* ignore transient poll errors */
    }
  }
  return false;
}

/** Returns true if the deep-link return URL signals the user cancelled on Paystack. */
function isCancelledUrl(url: string): boolean {
  try {
    const parsed = ExpoLinking.parse(url);
    return parsed.queryParams?.cancelled === "1";
  } catch {
    return false;
  }
}

/** Returns true if the returned URL is a Paystack internal close URL (3DS stranded). */
function isPaystackCloseUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    return hostname === "standard.paystack.co" || hostname === "checkout.paystack.com";
  } catch {
    return false;
  }
}

export function usePaystackPayment() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const authSessionActiveRef = useRef(false);

  // Dismiss any lingering auth session when the calling component unmounts.
  useEffect(() => {
    return () => {
      if (authSessionActiveRef.current) {
        WebBrowser.dismissAuthSession();
        authSessionActiveRef.current = false;
      }
    };
  }, []);

  const pay = useCallback(
    async (params: PayParams) => {
      setLoading(true);
      setError(null);

      try {
        const returnUrl = ExpoLinking.createURL("book/paystack");
        const res = await api.post<PaystackInitResponse>("/api/payments/initialize", {
          booking_id: params.booking_id,
          amount: params.amount,
          email: params.email,
          currency: params.currency || getTenantDefaultCurrency(),
          callback_url: returnUrl,
          metadata: {
            save_card: params.save_card ?? false,
            customer_id: params.customer_id,
            set_as_default: params.save_card ?? false,
          },
        });

        if (res.error) {
          setError(res.error.message || "Failed to initialize payment");
          return { success: false };
        }

        const data = res.data;
        if (!data?.authorization_url) {
          setError("Invalid payment response");
          return { success: false };
        }

        getAnalyticsClient()?.track("payment_initiated", {
          booking_id: params.booking_id,
          amount: params.amount,
          currency: params.currency || getTenantDefaultCurrency(),
          source: "customer_mobile",
          save_card: params.save_card ?? false,
        });

        authSessionActiveRef.current = true;
        const browserResult = await WebBrowser.openAuthSessionAsync(data.authorization_url, returnUrl);
        authSessionActiveRef.current = false;

        let reference = data.reference;

        if (browserResult.type === "cancel" || browserResult.type === "dismiss") {
          getAnalyticsClient()?.track("payment_cancelled", {
            booking_id: params.booking_id,
            reason: browserResult.type,
            source: "customer_mobile",
          });
          return { success: false, cancelled: true };
        }

        if (browserResult.type === "success" && browserResult.url) {
          if (isCancelledUrl(browserResult.url)) {
            getAnalyticsClient()?.track("payment_cancelled", {
              booking_id: params.booking_id,
              reason: "cancel_action",
              source: "customer_mobile",
            });
            return { success: false, cancelled: true };
          }

          // 3DS-stranded: Paystack closed on its own domain without a reference
          if (isPaystackCloseUrl(browserResult.url)) {
            // Webhook may have already processed — fall through to polling
          } else {
            try {
              const parsed = ExpoLinking.parse(browserResult.url);
              const query = parsed.queryParams ?? {};
              const returnedRef = query.reference ?? query.trxref;
              reference = Array.isArray(returnedRef)
                ? returnedRef[0] ?? reference
                : typeof returnedRef === "string" && returnedRef.trim()
                  ? returnedRef.trim()
                  : reference;
            } catch {
              // Fall back to the reference returned by initialize.
            }
          }
        }

        let paymentConfirmed = false;
        if (reference) {
          const vr = await api.get<{ status?: string }>(
            `/api/paystack/verify?reference=${encodeURIComponent(reference)}`,
          );
          if (!vr.error && vr.data) {
            const raw = vr.data as Record<string, unknown>;
            const inner = raw?.data && typeof raw.data === "object" ? (raw.data as Record<string, unknown>) : raw;
            const st = typeof inner?.status === "string" ? inner.status : typeof raw?.status === "string" ? raw.status : "";
            if (st === "success") paymentConfirmed = true;
          }
        }

        // Poll booking status using the shared strongest-criteria helper.
        if (!paymentConfirmed && params.booking_id) {
          paymentConfirmed = await pollBookingPaymentSettled(
            params.booking_id,
            (url) => api.get(url),
          );
        }

        const dismissed =
          browserResult.type !== "success" || (browserResult.type === "success" && !browserResult.url);

        if (dismissed) {
          getAnalyticsClient()?.track("payment_dismissed", {
            booking_id: params.booking_id,
            source: "customer_mobile",
          });
        }

        return {
          success: paymentConfirmed,
          dismissed,
          reference,
        };
      } catch (e) {
        setError(e instanceof Error ? e.message : "Payment failed");
        return { success: false };
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const payWithSavedCard = useCallback(
    async (params: PayWithSavedCardParams) => {
      setLoading(true);
      setError(null);

      try {
        const res = await api.post<ChargeResponse>("/api/payments/charge-saved-card", {
          payment_method_id: params.payment_method_id,
          amount: params.amount,
          email: params.email,
          currency: params.currency || getTenantDefaultCurrency(),
          metadata: params.metadata,
        });

        if (res.error) {
          setError(res.error.message || "Failed to charge card");
          setLoading(false);
          return { success: false };
        }

        const data = res.data;
        const txStatus = data?.status || data?.transaction?.status;

        // 3DS required: bank returned send_otp or requires_authorization.
        // Fall back to the hosted checkout page so the user can complete the
        // 3DS challenge — same behaviour as the Paystack web SDK.
        if (txStatus === "send_otp" || txStatus === "requires_authorization") {
          // We need to re-initialize to get a fresh authorization_url.
          // The caller should surface this as a redirect — return a sentinel.
          setLoading(false);
          return { success: false, requires3ds: true };
        }

        getAnalyticsClient()?.track("payment_saved_card", {
          amount: params.amount,
          currency: params.currency || getTenantDefaultCurrency(),
          source: "customer_mobile",
          status: txStatus,
        });

        setLoading(false);
        return {
          success: txStatus === "success",
          reference: data?.reference,
          status: txStatus,
        };
      } catch (e) {
        setError(e instanceof Error ? e.message : "Payment failed");
        setLoading(false);
        return { success: false };
      }
    },
    []
  );

  return { pay, payWithSavedCard, loading, error };
}
