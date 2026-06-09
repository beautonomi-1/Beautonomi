import { useCallback, useEffect, useMemo, useRef } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { twStyle } from "@/lib/twStyle";

/** Auto-return delay so the user lands back in the app like the booking success flow. */
const AUTO_RETURN_MS = 3200;

function pickStr(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0].trim() : "";
  return "";
}

export default function AdsPaymentSuccessScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    campaign_id?: string;
    title?: string;
    body?: string;
  }>();
  const campaignId = pickStr(params.campaign_id);
  const title = pickStr(params.title) || "Your ad is live";
  const body =
    pickStr(params.body) ||
    "Payment successful. Your sponsored placement is now active and ready to reach customers.";

  const adsParams = useMemo(() => {
    const query: Record<string, string> = { payment_success: "1" };
    if (campaignId) query.campaign_id = campaignId;
    return query;
  }, [campaignId]);

  const navigatedRef = useRef(false);

  const goToAds = useCallback(() => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    router.replace({
      pathname: "/(app)/(tabs)/more/settings/ads",
      params: adsParams,
    });
  }, [adsParams, router]);

  const goToDashboard = useCallback(() => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    router.replace({ pathname: "/(app)/(tabs)/dashboard" });
  }, [router]);

  const goToReceipts = useCallback(() => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    router.replace({ pathname: "/(app)/(tabs)/more/billing-history" });
  }, [router]);

  // Celebrate + auto-return into the app so the user is never stranded on a
  // dead-end success screen (mirrors the customer booking success overlay).
  useEffect(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const timer = setTimeout(goToAds, AUTO_RETURN_MS);
    return () => clearTimeout(timer);
  }, [goToAds]);

  return (
    <ScreenContainer scrollable={false}>
      <LinearGradient
        colors={["#ecfdf5", "#ffffff", "#f8fafc"]}
        style={twStyle("flex-1 items-center justify-center px-6")}
      >
        <View style={twStyle("w-full max-w-sm items-center rounded-3xl border border-emerald-100 bg-white p-7 shadow-sm")}>
          <View style={twStyle("mb-5 rounded-full bg-emerald-100 p-4")}>
            <Ionicons name="checkmark-circle" size={64} color="#047857" />
          </View>
          <Text style={twStyle("text-center text-2xl font-bold text-gray-950")}>{title}</Text>
          <Text style={twStyle("mt-3 text-center text-sm leading-6 text-gray-600")}>{body}</Text>
          <View style={twStyle("mt-5 rounded-2xl bg-emerald-50 px-4 py-3")}>
            <Text style={twStyle("text-center text-xs font-semibold uppercase tracking-wide text-emerald-700")}>
              Payment successful
            </Text>
            <Text style={twStyle("mt-1 text-center text-sm text-emerald-900")}>
              Customers can now discover your boosted listing.
            </Text>
          </View>
          <TouchableOpacity
            onPress={goToAds}
            style={twStyle("mt-7 w-full items-center rounded-2xl bg-emerald-600 px-5 py-4")}
            accessibilityRole="button"
            accessibilityLabel="View ads dashboard"
          >
            <Text style={twStyle("text-sm font-bold text-white")}>View ads dashboard</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={goToReceipts}
            style={twStyle("mt-3 w-full flex-row items-center justify-center gap-2 rounded-2xl border border-emerald-200 px-5 py-3.5")}
            accessibilityRole="button"
            accessibilityLabel="View receipt"
          >
            <Ionicons name="receipt-outline" size={16} color="#047857" />
            <Text style={twStyle("text-sm font-semibold text-emerald-700")}>View receipt</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={goToDashboard}
            style={twStyle("mt-3 w-full items-center rounded-2xl px-5 py-3")}
            accessibilityRole="button"
            accessibilityLabel="Go to dashboard"
          >
            <Text style={twStyle("text-sm font-semibold text-gray-500")}>Go to dashboard</Text>
          </TouchableOpacity>
          <Text style={twStyle("mt-5 text-center text-xs text-gray-400")}>
            Taking you to your campaigns…
          </Text>
        </View>
      </LinearGradient>
    </ScreenContainer>
  );
}
