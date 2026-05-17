import { useEffect, useMemo, useState } from "react";
import { View, ActivityIndicator, Text } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { Colors } from "@/constants/colors";
import { verifyPaystackWithRetry } from "@/lib/payments/verifyPaystackWithRetry";
import {
  isReferenceProcessing,
  clearReferenceProcessing,
  markReferenceProcessing,
} from "@/lib/paystack-verify-guard";

function pickRef(params: Record<string, string | string[] | undefined>): string {
  const raw = params.reference ?? params.trxref;
  const v = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "";
  return typeof v === "string" ? v.trim() : "";
}

function pickParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
): string {
  const raw = params[key];
  const v = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "";
  return typeof v === "string" ? v.trim() : "";
}

/** Unwrap nested `{ data: { bookingId } }` from verify helpers */
function extractBookingIdFromVerify(body: unknown): string | null {
  let cur: unknown = body;
  for (let depth = 0; depth < 4 && cur && typeof cur === "object"; depth++) {
    const o = cur as Record<string, unknown>;
    const bid = o.bookingId ?? o.booking_id;
    if (typeof bid === "string" && bid.trim()) return bid.trim();
    cur = o.data;
  }
  return null;
}

/**
 * Paystack redirect target for custom-offer payments
 * (`ExpoLinking.createURL("custom-offer-paystack")`).
 *
 * On cold-start / universal-link return:
 *  1. Detect cancellation (`cancelled=1`) — navigate back to offers tab.
 *  2. Verify reference with `/api/paystack/verify`.
 *  3. Navigate to `booking-detail` when `bookingId` resolves.
 *  4. Fall back to bookings tab on any error or missing ID.
 */
type ReturnMode = "verifying" | "success" | "pending" | "failed" | "cancelled" | "returning";

export default function CustomOfferPaystackReturnScreen() {
  const params = useLocalSearchParams();
  const reference = useMemo(
    () => pickRef(params as Record<string, string | string[] | undefined>),
    [params],
  );
  const cancelled = useMemo(
    () => pickParam(params as Record<string, string | string[] | undefined>, "cancelled"),
    [params],
  );
  const [mode, setMode] = useState<ReturnMode>(reference ? "verifying" : "returning");

  useEffect(() => {
    let aborted = false;

    if (cancelled === "1") {
      setMode("cancelled");
      const t = setTimeout(() => {
        if (!aborted) router.replace("/(app)/(tabs)/bookings" as never);
      }, 800);
      return () => {
        aborted = true;
        clearTimeout(t);
      };
    }

    if (reference && isReferenceProcessing(reference)) {
      clearReferenceProcessing(reference);
      const t = setTimeout(() => {
        if (!aborted) router.replace("/(app)/(tabs)/bookings" as never);
      }, 5000);
      return () => {
        aborted = true;
        clearTimeout(t);
      };
    }

    (async () => {
      if (!reference) {
        router.replace("/(app)/(tabs)/bookings" as never);
        return;
      }
      markReferenceProcessing(reference);
      const verifyResult = await verifyPaystackWithRetry(reference);
      if (aborted) return;
      const bookingId = extractBookingIdFromVerify(verifyResult.data);

      if (verifyResult.status === "success") {
        setMode("success");
        if (bookingId) {
          router.replace({
            pathname: "/(app)/booking-detail",
            params: { id: bookingId },
          } as never);
        } else {
          router.replace("/(app)/(tabs)/bookings" as never);
        }
        return;
      }
      if (verifyResult.status === "failed") {
        setMode("failed");
        const t = setTimeout(() => {
          if (!aborted) router.replace("/(app)/(tabs)/bookings" as never);
        }, 2000);
        return () => clearTimeout(t);
      }
      setMode("pending");
      const t = setTimeout(() => {
        if (aborted) return;
        if (bookingId) {
          router.replace({
            pathname: "/(app)/booking-detail",
            params: { id: bookingId },
          } as never);
        } else {
          router.replace("/(app)/(tabs)/bookings" as never);
        }
      }, 1500);
      return () => clearTimeout(t);
    })();

    return () => {
      aborted = true;
    };
  }, [reference, cancelled]);

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
              ? "Confirming your payment…"
              : "Returning to bookings…";
  const subtext =
    mode === "pending"
      ? "We'll update your booking within a few minutes. You can track it on the Bookings tab."
      : mode === "failed"
        ? "If you were charged, your booking will still be confirmed once the payment lands."
        : null;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          padding: 24,
          backgroundColor: "#fff",
        }}
      >
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
