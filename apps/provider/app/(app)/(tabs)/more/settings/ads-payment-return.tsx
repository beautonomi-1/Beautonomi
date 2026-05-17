/**
 * §Ads-mobile-audit 2026-05: aesthetic polish on the Paystack return screen.
 * §Provider-paystack-audit 2026-05: cold-start verify-with-retry.
 *
 * Foreground path: ads.tsx -> openAdsPaystack already verifies. This screen
 * handles cold-start (app killed during 3DS) by parsing the reference from
 * the deep link, calling verifyPaystackWithRetry, and upgrading the initial
 * `?success=1` chrome based on the verified outcome instead of trusting the
 * flag alone.
 */
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { twStyle } from "@/lib/twStyle";
import { verifyPaystackWithRetry } from "@/lib/payments/verifyPaystackWithRetry";

type ReturnStatus = "verifying" | "success" | "pending" | "failed" | "cancel";

function pickStr(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0].trim() : "";
  return "";
}

export default function AdsPaymentReturnScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    success?: string;
    cancelled?: string;
    reference?: string;
    trxref?: string;
  }>();
  const reference = useMemo(() => pickStr(params.reference) || pickStr(params.trxref), [params]);
  const successFlag = pickStr(params.success);
  const cancelFlag = pickStr(params.cancelled);

  // Initial chrome: cancel wins, otherwise verifying when we have a ref to
  // check, otherwise pending while we settle.
  const initialStatus: ReturnStatus =
    cancelFlag === "1" ? "cancel" : reference ? "verifying" : successFlag === "1" ? "success" : "pending";
  const [status, setStatus] = useState<ReturnStatus>(initialStatus);

  useEffect(() => {
    let aborted = false;
    if (cancelFlag === "1") {
      const t = setTimeout(() => {
        if (!aborted) router.replace("/(app)/(tabs)/more/settings/ads");
      }, 700);
      return () => {
        aborted = true;
        clearTimeout(t);
      };
    }
    if (!reference) {
      const delay = successFlag === "1" ? 700 : 200;
      const t = setTimeout(() => {
        if (!aborted) router.replace("/(app)/(tabs)/more/settings/ads");
      }, delay);
      return () => {
        aborted = true;
        clearTimeout(t);
      };
    }
    (async () => {
      const verifyResult = await verifyPaystackWithRetry(reference);
      if (aborted) return;
      if (verifyResult.status === "success") setStatus("success");
      else if (verifyResult.status === "failed") setStatus("failed");
      else setStatus("pending");
      const delay = verifyResult.status === "success" ? 700 : 1500;
      setTimeout(() => {
        if (!aborted) router.replace("/(app)/(tabs)/more/settings/ads");
      }, delay);
    })();
    return () => {
      aborted = true;
    };
  }, [reference, cancelFlag, successFlag, router]);

  const isSuccess = status === "success";
  const isCancel = status === "cancel";
  const isFailed = status === "failed";
  const isPending = status === "pending";
  const isVerifying = status === "verifying";

  return (
    <ScreenContainer scrollable={false}>
      <View style={twStyle("flex-1 items-center justify-center px-6")}>
        <View
          style={twStyle(
            `w-full max-w-sm items-center rounded-3xl border p-8 ${
              isSuccess
                ? "border-emerald-200 bg-emerald-50"
                : isFailed
                  ? "border-rose-200 bg-rose-50"
                  : isCancel
                    ? "border-amber-200 bg-amber-50"
                    : "border-gray-200 bg-white"
            }`,
          )}
        >
          {isSuccess ? (
            <Ionicons name="checkmark-circle" size={56} color="#047857" />
          ) : isFailed ? (
            <Ionicons name="close-circle" size={56} color="#b91c1c" />
          ) : isCancel ? (
            <Ionicons name="close-circle-outline" size={56} color="#b45309" />
          ) : (
            <ActivityIndicator size="large" color="#4f46e5" />
          )}
          <Text style={twStyle("mt-4 text-lg font-bold text-gray-900 text-center")}>
            {isSuccess
              ? "Payment confirmed"
              : isFailed
                ? "Payment could not be confirmed"
                : isPending
                  ? "Your payment is being confirmed"
                  : isCancel
                    ? "Payment cancelled"
                    : isVerifying
                      ? "Confirming with Paystack…"
                      : "Finishing ad payment…"}
          </Text>
          <Text style={twStyle("mt-2 text-sm text-gray-600 text-center leading-5")}>
            {isSuccess
              ? "Returning you to your campaigns. Your ad will activate as soon as Paystack confirms funding."
              : isFailed
                ? "If you were charged, your campaign will activate once the payment lands. Otherwise please try again."
                : isPending
                  ? "Your ad will activate within a few minutes once Paystack confirms with your bank."
                  : isCancel
                    ? "No charge was made. You can try again from the ads dashboard."
                    : "Hang tight while we hand you back to your campaigns."}
          </Text>
        </View>
      </View>
    </ScreenContainer>
  );
}
