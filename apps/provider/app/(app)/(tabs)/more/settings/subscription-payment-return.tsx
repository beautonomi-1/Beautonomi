/**
 * §Provider-paystack-audit 2026-05: branded cold-start return screen.
 *
 * Paystack appends `?reference=…&trxref=…` to our `provider://...` deep link
 * before redirecting back to the app. On a foreground return the initiator
 * (`settings/subscription.tsx` -> `openSubscriptionPaystack`) handles
 * verification itself; this screen handles the cold-start case where the OS
 * killed the app during 3DS / OTP and relaunched it on the deep link.
 *
 * The verify call retries with backoff to bridge the Paystack-webhook race
 * window, then falls back to a soft-success "Your payment is being confirmed"
 * card if the webhook hasn't landed yet — never to a misleading failure toast.
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

export default function SubscriptionPaymentReturnScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    reference?: string;
    trxref?: string;
    payment_success?: string;
    payment_cancelled?: string;
    order_id?: string;
  }>();
  const reference = useMemo(() => pickStr(params.reference) || pickStr(params.trxref), [params]);
  const cancelledFlag = pickStr(params.payment_cancelled);
  const orderId = pickStr(params.order_id);
  const [status, setStatus] = useState<ReturnStatus>(reference ? "verifying" : "pending");

  useEffect(() => {
    let aborted = false;

    /**
     * §Provider-paystack-audit 2026-05: forward the verified outcome back
     * to the Subscription screen so it surfaces the same outcome card as the
     * foreground flow. Includes `order_id` so the screen can poll the matching
     * subscription state instead of grabbing a stale snapshot.
     */
    const navigateBack = (
      flag: "payment_success" | "payment_failed" | "payment_pending" | null,
    ) => {
      const query: Record<string, string> = {};
      if (flag === "payment_success") query.payment_success = "1";
      if (flag === "payment_failed") query.payment_failed = "1";
      if (flag === "payment_pending") query.payment_pending = "1";
      if (orderId) query.order_id = orderId;
      router.replace({
        pathname: "/(app)/(tabs)/more/settings/subscription",
        params: query,
      });
    };

    if (cancelledFlag === "1") {
      setStatus("cancel");
      const t = setTimeout(() => {
        if (!aborted) navigateBack("payment_failed");
      }, 800);
      return () => {
        aborted = true;
        clearTimeout(t);
      };
    }
    if (!reference) {
      const t = setTimeout(() => {
        if (!aborted) navigateBack(null);
      }, 200);
      return () => {
        aborted = true;
        clearTimeout(t);
      };
    }
    (async () => {
      const verifyResult = await verifyPaystackWithRetry(reference);
      if (aborted) return;
      if (verifyResult.status === "success") {
        setStatus("success");
      } else if (verifyResult.status === "failed") {
        setStatus("failed");
      } else {
        setStatus("pending");
      }
      const delay = verifyResult.status === "success" ? 700 : 1500;
      setTimeout(() => {
        if (aborted) return;
        if (verifyResult.status === "success") navigateBack("payment_success");
        else if (verifyResult.status === "failed") navigateBack("payment_failed");
        else navigateBack("payment_pending");
      }, delay);
    })();
    return () => {
      aborted = true;
    };
  }, [reference, cancelledFlag, orderId, router]);

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
              ? "Plan activated"
              : isFailed
                ? "Payment could not be confirmed"
                : isPending
                  ? "Your payment is being confirmed"
                  : isCancel
                    ? "Payment cancelled"
                    : "Finishing subscription payment…"}
          </Text>
          <Text style={twStyle("mt-2 text-sm text-gray-600 text-center leading-5")}>
            {isSuccess
              ? "Returning you to your subscription settings."
              : isFailed
                ? "If you were charged, your plan will activate once the payment lands. Otherwise please try again."
                : isPending
                  ? "We'll activate your plan within a few minutes once Paystack confirms with your bank."
                  : isCancel
                    ? "No charge was made. You can try again from the subscription dashboard."
                    : isVerifying
                      ? "Confirming your payment with Paystack…"
                      : "Returning to your subscription settings."}
          </Text>
        </View>
      </View>
    </ScreenContainer>
  );
}
