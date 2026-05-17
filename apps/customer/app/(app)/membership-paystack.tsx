import { useEffect, useMemo, useState } from "react";
import { View, ActivityIndicator, Text } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "@beautonomi/i18n";
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

type ReturnMode = "verifying" | "success" | "pending" | "failed" | "cancelled" | "returning";

/**
 * Paystack return URL target (`ExpoLinking.createURL("membership-paystack")`).
 * Cold start / universal link: verify Paystack reference with retry-and-backoff,
 * then return to Explore with a soft-success fallback when the webhook is slow.
 */
export default function MembershipPaystackReturnScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams();
  const reference = useMemo(() => pickRef(params as Record<string, string | string[] | undefined>), [params]);
  const cancelledFlag = useMemo(
    () => pickParam(params as Record<string, string | string[] | undefined>, "cancelled"),
    [params],
  );
  const [mode, setMode] = useState<ReturnMode>(reference ? "verifying" : "returning");
  const confirming = t("customer.mobile.screens.partnerProfile.membershipPaystackConfirming") as string;
  const returning = t("customer.mobile.screens.partnerProfile.membershipPaystackReturning") as string;

  useEffect(() => {
    let aborted = false;

    if (cancelledFlag === "1") {
      setMode("cancelled");
      const t = setTimeout(() => {
        if (!aborted) router.replace("/(app)/(tabs)/explore" as never);
      }, 800);
      return () => {
        aborted = true;
        clearTimeout(t);
      };
    }

    if (reference && isReferenceProcessing(reference)) {
      clearReferenceProcessing(reference);
      const t = setTimeout(() => {
        if (!aborted) router.replace("/(app)/(tabs)/explore" as never);
      }, 5000);
      return () => {
        aborted = true;
        clearTimeout(t);
      };
    }

    (async () => {
      if (!reference) {
        router.replace("/(app)/(tabs)/explore" as never);
        return;
      }
      markReferenceProcessing(reference);
      const verifyResult = await verifyPaystackWithRetry(reference);
      if (aborted) return;
      if (verifyResult.status === "success") {
        setMode("success");
        router.replace("/(app)/(tabs)/explore" as never);
        return;
      }
      if (verifyResult.status === "failed") {
        setMode("failed");
        const t = setTimeout(() => {
          if (!aborted) router.replace("/(app)/(tabs)/explore" as never);
        }, 2000);
        return () => clearTimeout(t);
      }
      setMode("pending");
      const t = setTimeout(() => {
        if (!aborted) router.replace("/(app)/(tabs)/explore" as never);
      }, 1500);
      return () => clearTimeout(t);
    })();
    return () => {
      aborted = true;
    };
  }, [reference, cancelledFlag]);

  const headline =
    mode === "success"
      ? "Membership activated"
      : mode === "failed"
        ? "Payment could not be confirmed"
        : mode === "pending"
          ? "Your payment is being confirmed"
          : mode === "cancelled"
            ? "Payment cancelled"
            : reference
              ? confirming
              : returning;
  const subtext =
    mode === "pending"
      ? "Your membership will activate within a few minutes. Refresh the partner profile if it doesn't appear right away."
      : mode === "failed"
        ? "If you were charged, your membership will activate once the payment lands."
        : null;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: "#fff" }}>
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
