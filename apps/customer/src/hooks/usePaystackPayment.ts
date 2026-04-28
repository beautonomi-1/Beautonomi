/**
 * Paystack payment flow for native app.
 *
 * Supports two flows:
 * 1. New card: Initialize -> open hosted checkout in WebBrowser -> webhook saves card if requested
 * 2. Saved card: Charge authorization directly via API (no redirect needed)
 */
import { useState, useCallback } from "react";
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

export function usePaystackPayment() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

        const browserResult = await WebBrowser.openAuthSessionAsync(data.authorization_url, returnUrl);
        let reference = data.reference;
        if (browserResult.type === "success" && browserResult.url) {
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

        if (reference) {
          await api.get(`/api/paystack/verify?reference=${encodeURIComponent(reference)}`).catch(() => {});
        }

        let paymentConfirmed = false;
        if (params.booking_id) {
          const MAX_POLL = 8;
          for (let i = 0; i < MAX_POLL; i++) {
            await new Promise((r) => setTimeout(r, 2000));
            try {
              const check = await api.get<{ status?: string; payment_status?: string }>(
                `/api/me/bookings/${encodeURIComponent(params.booking_id)}`,
              );
              const ps = (check.data as { payment_status?: string } | null)?.payment_status;
              if (ps && ps !== "pending") { paymentConfirmed = true; break; }
            } catch { /* ignore poll error */ }
          }
        }

        return {
          success: paymentConfirmed,
          dismissed: true,
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
