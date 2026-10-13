import { useEffect, useMemo, useRef } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { verifyPaystackWithRetry } from "@/lib/payments/verifyPaystackWithRetry";
import {
  pickHostedCheckoutRouteParams,
  isHostedCheckoutFailureStatus,
} from "@/lib/payments/hostedCheckoutRouteParams";

function pickStr(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0].trim() : "";
  return "";
}

export default function BillingPaymentReturnScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    reference?: string;
    trxref?: string;
    tx_ref?: string;
    session_id?: string;
    transaction_id?: string;
    status?: string;
    payment_success?: string;
    payment_cancelled?: string;
    invoice_id?: string;
  }>();
  const hosted = useMemo(() => pickHostedCheckoutRouteParams(params as Record<string, unknown>), [params]);
  const reference = hosted.reference;
  const sessionId = hosted.sessionId;
  const transactionId = hosted.transactionId;
  const cancelled = pickStr(params.payment_cancelled) === "1";
  const invoiceId = pickStr(params.invoice_id);
  const navigatedRef = useRef(false);

  useEffect(() => {
    let aborted = false;
    (async () => {
      if (navigatedRef.current) return;
      if (cancelled) {
        navigatedRef.current = true;
        router.replace("/(app)/(tabs)/more/invoices" as never);
        return;
      }
      if (isHostedCheckoutFailureStatus(hosted.status)) {
        navigatedRef.current = true;
        router.replace("/(app)/(tabs)/more/invoices" as never);
        return;
      }
      if (reference) {
        await verifyPaystackWithRetry(reference, {
          sessionId: sessionId || null,
          transactionId,
        });
      }
      if (aborted || navigatedRef.current) return;
      navigatedRef.current = true;
      router.replace({
        pathname: "/(app)/(tabs)/more/invoices",
        params: invoiceId ? { invoice_id: invoiceId, payment_success: "1" } : { payment_success: "1" },
      } as never);
    })();
    return () => {
      aborted = true;
    };
  }, [cancelled, hosted.status, invoiceId, reference, router, sessionId, transactionId]);

  return (
    <ScreenContainer>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <ActivityIndicator size="large" />
        <Text style={{ marginTop: 16, textAlign: "center" }}>Confirming invoice payment…</Text>
      </View>
    </ScreenContainer>
  );
}
