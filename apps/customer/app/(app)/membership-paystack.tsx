import { useEffect, useMemo } from "react";
import { View, ActivityIndicator, Text } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "@beautonomi/i18n";
import { Colors } from "@/constants/colors";
import { api } from "@/lib/api-client";

function pickRef(params: Record<string, string | string[] | undefined>): string {
  const raw = params.reference ?? params.trxref;
  const v = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "";
  return typeof v === "string" ? v.trim() : "";
}

function unwrapVerifyStatus(body: unknown): string | null {
  let cur: unknown = body;
  for (let depth = 0; depth < 5 && cur && typeof cur === "object"; depth++) {
    const o = cur as Record<string, unknown>;
    const st = o.status;
    if (typeof st === "string" && st.trim()) return st.trim();
    cur = o.data;
  }
  return null;
}

/**
 * Paystack return URL target (`ExpoLinking.createURL("membership-paystack")`).
 * Cold start / universal link: verify Paystack reference, then return to Explore.
 */
export default function MembershipPaystackReturnScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams();
  const reference = useMemo(() => pickRef(params as Record<string, string | string[] | undefined>), [params]);
  const confirming = t("customer.mobile.screens.partnerProfile.membershipPaystackConfirming") as string;
  const returning = t("customer.mobile.screens.partnerProfile.membershipPaystackReturning") as string;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!reference) {
        router.replace("/(app)/(tabs)/explore" as never);
        return;
      }
      try {
        const res = await api.get<unknown>(`/api/paystack/verify?reference=${encodeURIComponent(reference)}`);
        if (cancelled) return;
        const status = unwrapVerifyStatus(res.data);
        if (status === "success") {
          router.replace("/(app)/(tabs)/explore" as never);
          return;
        }
      } catch {
        /* fall through */
      }
      if (!cancelled) router.replace("/(app)/(tabs)/explore" as never);
    })();
    return () => {
      cancelled = true;
    };
  }, [reference]);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: "#fff" }}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={{ marginTop: 16, color: "#6B7280", textAlign: "center" }}>
          {reference ? confirming : returning}
        </Text>
      </View>
    </>
  );
}
