import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Stack, useRouter, useLocalSearchParams } from "expo-router";
import { Colors } from "@/constants/colors";
import { verifyPaystackWithRetry } from "@/lib/payments/verifyPaystackWithRetry";
import {
  isReferenceProcessing,
  clearReferenceProcessing,
  markReferenceProcessing,
} from "@/lib/paystack-verify-guard";

/**
 * Generic Paystack return target — default `returnUrl` for
 * `useInAppPaystackCheckout`. Used when:
 *  - A caller did not pass a flow-specific returnUrl, or
 *  - The app was killed during checkout and the OS relaunched on the deep link.
 *
 * Cold-start path: parse reference, verify-with-retry, route based on the
 * metadata in the verify payload (booking / order / wallet / gift card /
 * membership / custom offer / subscription / ad), with bookings tab as the
 * ultimate fallback.
 */

type ReturnMode = "verifying" | "success" | "pending" | "failed" | "cancelled" | "returning";

function pickStr(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0].trim() : "";
  return "";
}

function pickRef(params: Record<string, string | string[] | undefined>): string {
  return pickStr(params.reference) || pickStr(params.trxref);
}

type RouteTarget = { pathname: string; params?: Record<string, string> };

function unwrap(body: unknown, depth = 0): Record<string, unknown> | null {
  if (!body || typeof body !== "object" || depth > 5) return null;
  return body as Record<string, unknown>;
}

function resolveRouteFromVerifyPayload(body: unknown): RouteTarget | null {
  let cur: Record<string, unknown> | null = unwrap(body);
  for (let depth = 0; depth < 5 && cur; depth += 1) {
    const bookingId = pickStr(cur.bookingId) || pickStr(cur.booking_id);
    if (bookingId) {
      return { pathname: "/(app)/booking-detail", params: { id: bookingId } };
    }
    const orderId = pickStr(cur.productOrderId) || pickStr(cur.product_order_id);
    if (orderId) {
      return { pathname: "/(app)/product-order-detail", params: { id: orderId } };
    }
    const giftCardId = pickStr(cur.giftCardId) || pickStr(cur.gift_card_id);
    if (giftCardId) {
      return { pathname: "/(app)/account-settings/payments" };
    }
    const type = pickStr(cur.type) || pickStr(cur.payment_type);
    if (type === "wallet_topup") {
      return { pathname: "/(app)/account-settings/wallet" };
    }
    if (type === "membership") {
      return { pathname: "/(app)/(tabs)/explore" };
    }
    cur = unwrap(cur.data, depth + 1);
  }
  return null;
}

export default function PaystackCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const reference = useMemo(
    () => pickRef(params as Record<string, string | string[] | undefined>),
    [params],
  );
  const cancelled = useMemo(
    () => pickStr((params as Record<string, string | string[] | undefined>).cancelled),
    [params],
  );
  const [mode, setMode] = useState<ReturnMode>(reference ? "verifying" : "returning");

  useEffect(() => {
    let aborted = false;
    const fallback = "/(app)/(tabs)/bookings" as const;
    const routeOrFallback = (target: RouteTarget | null) => {
      if (target) {
        router.replace(target as never);
      } else {
        router.replace(fallback as never);
      }
    };

    if (cancelled === "1") {
      setMode("cancelled");
      const t = setTimeout(() => {
        if (!aborted) router.replace(fallback as never);
      }, 800);
      return () => {
        aborted = true;
        clearTimeout(t);
      };
    }

    if (reference && isReferenceProcessing(reference)) {
      clearReferenceProcessing(reference);
      const t = setTimeout(() => {
        if (!aborted) router.replace(fallback as never);
      }, 5000);
      return () => {
        aborted = true;
        clearTimeout(t);
      };
    }

    (async () => {
      if (!reference) {
        const t = setTimeout(() => {
          if (!aborted) router.replace(fallback as never);
        }, 200);
        return () => clearTimeout(t);
      }
      markReferenceProcessing(reference);
      const verifyResult = await verifyPaystackWithRetry(reference);
      if (aborted) return;
      const target = resolveRouteFromVerifyPayload(verifyResult.data);

      if (verifyResult.status === "success") {
        setMode("success");
        routeOrFallback(target);
        return;
      }
      if (verifyResult.status === "failed") {
        setMode("failed");
        const t = setTimeout(() => {
          if (!aborted) router.replace(fallback as never);
        }, 2000);
        return () => clearTimeout(t);
      }
      setMode("pending");
      const t = setTimeout(() => {
        if (!aborted) routeOrFallback(target);
      }, 1500);
      return () => clearTimeout(t);
    })();

    return () => {
      aborted = true;
    };
  }, [reference, cancelled, router]);

  const headline =
    mode === "success"
      ? "Payment confirmed"
      : mode === "failed"
        ? "Payment could not be confirmed"
        : mode === "pending"
          ? "Your payment is being confirmed"
          : mode === "cancelled"
            ? "Payment cancelled"
            : reference
              ? "Finalizing payment…"
              : "Returning to the app…";
  const subtext =
    mode === "pending"
      ? "We'll update your account within a few minutes. You can keep using the app while we confirm with your bank."
      : mode === "failed"
        ? "If you were charged, your purchase will still be confirmed once the payment lands."
        : null;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "#fff" }}>
        {mode === "verifying" || mode === "returning" ? (
          <ActivityIndicator size="large" color={Colors.primary} />
        ) : null}
        <Text style={{ marginTop: 16, color: "#111827", fontSize: 16, fontWeight: "600", textAlign: "center" }}>
          {headline}
        </Text>
        {subtext ? (
          <Text style={{ marginTop: 8, color: "#6B7280", textAlign: "center", lineHeight: 20 }}>{subtext}</Text>
        ) : null}
      </View>
    </>
  );
}
