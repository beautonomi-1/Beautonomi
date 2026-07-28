/**
 * Cold-start / deep-link handler for terminal order Paystack returns.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { twStyle } from "@/lib/twStyle";
import { verifyPaystackWithRetry } from "@/lib/payments/verifyPaystackWithRetry";
import {
  pollTerminalOrderPaid,
  terminalOrderFailedCopy,
  terminalOrderPendingCopy,
  terminalOrderSuccessCopy,
} from "@/lib/payments/providerPaystackReturn";

type ReturnStatus = "verifying" | "success" | "pending" | "failed" | "cancel";

function pickStr(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0].trim() : "";
  return "";
}

export default function TerminalPaymentReturnScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    payment_success?: string;
    payment_cancelled?: string;
    reference?: string;
    trxref?: string;
    order_id?: string;
  }>();
  const reference = useMemo(() => pickStr(params.reference) || pickStr(params.trxref), [params]);
  const successFlag = pickStr(params.payment_success);
  const cancelFlag = pickStr(params.payment_cancelled);
  const orderId = pickStr(params.order_id);

  const initialStatus: ReturnStatus =
    cancelFlag === "1" ? "cancel" : reference || successFlag === "1" ? "verifying" : "pending";
  const [status, setStatus] = useState<ReturnStatus>(initialStatus);
  const navigatedRef = useRef(false);

  const navigateBack = useCallback(
    (flag: "payment_success" | "payment_failed" | "payment_pending" | "payment_cancelled" | null) => {
      if (navigatedRef.current) return;
      navigatedRef.current = true;
      const query: Record<string, string> = {};
      if (flag === "payment_success") query.payment_success = "1";
      if (flag === "payment_failed") query.payment_failed = "1";
      if (flag === "payment_pending") query.payment_pending = "1";
      if (flag === "payment_cancelled") query.payment_cancelled = "1";
      if (orderId) query.order_id = orderId;
      router.replace({
        pathname: "/(app)/(tabs)/more/terminal-shop",
        params: query,
      });
    },
    [orderId, router],
  );

  useEffect(() => {
    if (status === "cancel") {
      navigateBack("payment_cancelled");
      return;
    }
    if (status !== "verifying" || !reference) {
      if (status === "pending") navigateBack("payment_pending");
      return;
    }

    let cancelled = false;
    const run = async () => {
      const verifyResult = await verifyPaystackWithRetry(reference);
      if (cancelled) return;
      if (verifyResult.status === "failed") {
        setStatus("failed");
        navigateBack("payment_failed");
        return;
      }
      if (orderId) {
        const provisioned = await pollTerminalOrderPaid(orderId);
        if (cancelled) return;
        if (provisioned.state === "provisioned") {
          setStatus("success");
          navigateBack("payment_success");
          return;
        }
      }
      if (verifyResult.status === "success") {
        setStatus("success");
        navigateBack("payment_success");
        return;
      }
      setStatus("pending");
      navigateBack("payment_pending");
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [navigateBack, orderId, reference, status]);

  const copy =
    status === "cancel"
      ? terminalOrderFailedCopy("Payment wasn't completed.")
      : status === "failed"
        ? terminalOrderFailedCopy(null)
        : status === "success"
          ? terminalOrderSuccessCopy()
          : status === "pending"
            ? terminalOrderPendingCopy()
            : { title: "Confirming payment", body: "Please wait while we verify your terminal order payment." };

  return (
    <ScreenContainer scrollable={false}>
      <View style={twStyle("flex-1 items-center justify-center px-6")}>
        {status === "verifying" ? (
          <ActivityIndicator size="large" color="#6366f1" />
        ) : (
          <Ionicons
            name={
              status === "success"
                ? "checkmark-circle"
                : status === "pending"
                  ? "time-outline"
                  : "close-circle"
            }
            size={48}
            color={status === "success" ? "#059669" : status === "pending" ? "#d97706" : "#dc2626"}
          />
        )}
        <Text style={twStyle("mt-4 text-center text-lg font-semibold text-gray-900")}>{copy.title}</Text>
        <Text style={twStyle("mt-2 text-center text-sm text-gray-600")}>{copy.body}</Text>
        {status !== "verifying" ? (
          <TouchableOpacity
            onPress={() => navigateBack(status === "success" ? "payment_success" : "payment_pending")}
            style={twStyle("mt-6 rounded-xl bg-indigo-600 px-5 py-3")}
          >
            <Text style={twStyle("text-sm font-semibold text-white")}>Back to Terminal shop</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </ScreenContainer>
  );
}
