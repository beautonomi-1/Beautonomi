/**
 * Paystack payment flow for native app.
 *
 * Supports two flows:
 * 1. New card: Initialize -> in-app WebView hosted checkout -> verify + poll
 * 2. Saved card: Charge authorization directly via API (no redirect needed)
 */
import { useState, useCallback } from "react";
import * as ExpoLinking from "expo-linking";
import { api } from "@/lib/api-client";
import { verifyPaystackWithRetry } from "@/lib/payments/verifyPaystackWithRetry";
import { getAnalyticsClient } from "@/lib/analytics-rn";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";
import { useInAppPaystackCheckout } from "@/hooks/useInAppPaystackCheckout";
import {
  extractPaystackReferenceFromUrl,
  isCancelledPaystackUrl,
  matchesExpoReturnUrl,
} from "@/lib/paystack-webview-utils";

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
  const checkout = useInAppPaystackCheckout();

  const pay = useCallback(
    async (params: PayParams) => {
      setLoading(true);
      setError(null);

      try {
        // Unified callback route for all in-app Paystack flows.
        const returnUrl = ExpoLinking.createURL("paystack-callback");
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

        const pr = await checkout.waitForCheckout(data.authorization_url, {
          title: "Pay booking",
          returnUrl,
          matchSuccess: (u) => matchesExpoReturnUrl(u, returnUrl) && !isCancelledPaystackUrl(u),
          matchCancel: (u) => isCancelledPaystackUrl(u),
        });

        let reference = data.reference;

        if (pr.outcome === "cancel") {
          getAnalyticsClient()?.track("payment_cancelled", {
            booking_id: params.booking_id,
            reason: "cancel_action",
            source: "customer_mobile",
          });
          return { success: false, cancelled: true };
        }

        if (pr.outcome === "closed") {
          getAnalyticsClient()?.track("payment_dismissed", {
            booking_id: params.booking_id,
            source: "customer_mobile",
          });
          // Still verify + poll — user may have completed payment then dismissed quickly,
          // or Paystack may have settled via webhook while the sheet was open.
        }

        if (pr.outcome === "success" && pr.url) {
          if (isCancelledPaystackUrl(pr.url)) {
            getAnalyticsClient()?.track("payment_cancelled", {
              booking_id: params.booking_id,
              reason: "cancel_action",
              source: "customer_mobile",
            });
            return { success: false, cancelled: true };
          }

          if (isPaystackCloseUrl(pr.url)) {
            // Webhook may have already processed — fall through to polling
          } else {
            const extracted = extractPaystackReferenceFromUrl(pr.url);
            if (extracted) reference = extracted;
          }
        }

        let paymentConfirmed = false;
        if (reference) {
          const verifyResult = await verifyPaystackWithRetry(reference);
          if (verifyResult.status === "success") paymentConfirmed = true;
        }

        if (!paymentConfirmed && params.booking_id) {
          paymentConfirmed = await pollBookingPaymentSettled(params.booking_id, (url) => api.get(url));
        }

        const dismissed = pr.outcome === "closed";

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
    [checkout],
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

        if (txStatus === "send_otp" || txStatus === "requires_authorization") {
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
    [],
  );

  return { pay, payWithSavedCard, loading, error, paystackModal: checkout.modal };
}
