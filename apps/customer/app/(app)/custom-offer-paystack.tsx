import { useEffect, useMemo } from "react";
import { View, ActivityIndicator, Text } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { Colors } from "@/constants/colors";
import { api } from "@/lib/api-client";
import { isReferenceProcessing, clearReferenceProcessing } from "@/lib/paystack-verify-guard";

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

  useEffect(() => {
    let aborted = false;

    if (cancelled === "1") {
      router.replace("/(app)/(tabs)/bookings" as never);
      return;
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
      try {
        const res = await api.get<unknown>(
          `/api/paystack/verify?reference=${encodeURIComponent(reference)}`,
        );
        if (aborted) return;
        const bookingId = extractBookingIdFromVerify(res.data as unknown);
        if (bookingId) {
          router.replace({
            pathname: "/(app)/booking-detail",
            params: { id: bookingId },
          } as never);
          return;
        }
      } catch {
        // Fall through to bookings tab
      }
      if (!aborted) router.replace("/(app)/(tabs)/bookings" as never);
    })();

    return () => {
      aborted = true;
    };
  }, [reference, cancelled]);

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
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={{ marginTop: 16, color: "#6B7280", textAlign: "center" }}>
          {reference ? "Confirming your payment…" : "Returning to bookings…"}
        </Text>
      </View>
    </>
  );
}
