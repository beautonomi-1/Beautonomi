/**
 * §Ads-mobile-audit 2026-05: aesthetic polish on the Paystack return screen.
 * Previously a bare `<View>` with an ActivityIndicator; now uses the shared
 * `ScreenContainer` chrome, distinguishes success vs cancel based on the
 * `?success=1` / `?cancelled=1` query string, and shows a branded confirmation
 * card so providers see proof the redirect closed cleanly before being
 * bounced back to the ads dashboard.
 */
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { twStyle } from "@/lib/twStyle";

type ReturnStatus = "success" | "cancel" | "pending";

export default function AdsPaymentReturnScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ success?: string; cancelled?: string }>();
  const [status, setStatus] = useState<ReturnStatus>("pending");

  useEffect(() => {
    const successFlag = String(params.success ?? "");
    const cancelFlag = String(params.cancelled ?? "");
    if (successFlag === "1") setStatus("success");
    else if (cancelFlag === "1") setStatus("cancel");
    else setStatus("pending");
  }, [params.success, params.cancelled]);

  useEffect(() => {
    // Give the user ~600ms to register the confirmation card, then bounce
    // them back to the ads dashboard which will pick up the updated state.
    const delay = status === "pending" ? 200 : 700;
    const timer = setTimeout(() => {
      router.replace("/(app)/(tabs)/more/settings/ads");
    }, delay);
    return () => clearTimeout(timer);
  }, [router, status]);

  const isSuccess = status === "success";
  const isCancel = status === "cancel";

  return (
    <ScreenContainer scrollable={false}>
      <View style={twStyle("flex-1 items-center justify-center px-6")}>
        <View
          style={twStyle(
            `w-full max-w-sm items-center rounded-3xl border p-8 ${
              isSuccess
                ? "border-emerald-200 bg-emerald-50"
                : isCancel
                  ? "border-amber-200 bg-amber-50"
                  : "border-gray-200 bg-white"
            }`,
          )}
        >
          {isSuccess ? (
            <Ionicons name="checkmark-circle" size={56} color="#047857" />
          ) : isCancel ? (
            <Ionicons name="close-circle-outline" size={56} color="#b45309" />
          ) : (
            <ActivityIndicator size="large" color="#4f46e5" />
          )}
          <Text style={twStyle("mt-4 text-lg font-bold text-gray-900 text-center")}>
            {isSuccess
              ? "Payment confirmed"
              : isCancel
                ? "Payment cancelled"
                : "Finishing ad payment…"}
          </Text>
          <Text style={twStyle("mt-2 text-sm text-gray-600 text-center leading-5")}>
            {isSuccess
              ? "Returning you to your campaigns. Your ad will activate as soon as Paystack confirms funding."
              : isCancel
                ? "No charge was made. You can try again from the ads dashboard."
                : "Hang tight while we hand you back to your campaigns."}
          </Text>
        </View>
      </View>
    </ScreenContainer>
  );
}
