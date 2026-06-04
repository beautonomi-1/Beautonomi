/**
 * Global instant-allocation popup for incoming Paystack Terminal payments.
 *
 * Subscribes to INSERTs on `provider_paystack_terminal_payments` for the current provider via
 * Supabase Realtime and surfaces a BottomSheet the moment money lands, with a pre-selected
 * suggestion for one-tap allocation. Mounted alongside BookingAlertListener in the app layout.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, AppState, Vibration, Platform, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useProvider } from "@/providers/ProviderContext";
import { useFeatureFlag } from "@/providers/ConfigBundleProvider";
import { supabase } from "@/lib/supabase/client";
import { nextRealtimeTopic } from "@/lib/supabase/realtime-topic";
import { api } from "@/lib/api-client";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { twStyle } from "@/lib/twStyle";
import {
  PAYSTACK_TERMINAL_PAYMENTS_ACTION_PATH,
  paystackTerminalAllocatePayload,
} from "@/lib/paystack-terminal-api";
import type { PaystackTerminalMatchCandidate } from "@/hooks/usePaystackTerminal";

type IncomingPayment = {
  id: string;
  paystack_reference?: string | null;
  paid_amount?: number | string | null;
  expected_amount?: number | string | null;
  currency?: string | null;
  payer_name?: string | null;
  customer_reference?: string | null;
  amount_match_status?: string | null;
  suggested_entity_type?: string | null;
  suggested_entity_id?: string | null;
  match_candidates?: PaystackTerminalMatchCandidate[] | null;
};

function topSuggestion(payment: IncomingPayment): { entity_type: string; entity_id: string; label?: string } | null {
  const candidate = payment.match_candidates?.[0];
  if (candidate?.entity_type && candidate?.entity_id) {
    return { entity_type: candidate.entity_type, entity_id: candidate.entity_id, label: candidate.label ?? candidate.reference ?? undefined };
  }
  if (payment.suggested_entity_type && payment.suggested_entity_id) {
    return { entity_type: payment.suggested_entity_type, entity_id: payment.suggested_entity_id };
  }
  return null;
}

export function TerminalPaymentAlertListener() {
  const router = useRouter();
  const { provider } = useProvider();
  const paystackTerminalEnabled = useFeatureFlag("payment_paystack_virtual_terminal");
  const [payment, setPayment] = useState<IncomingPayment | null>(null);
  const [allocating, setAllocating] = useState(false);
  const seenIds = useRef<Set<string>>(new Set());
  const appState = useRef(AppState.currentState);

  const markSeen = useCallback((id: string) => {
    void api.post(PAYSTACK_TERMINAL_PAYMENTS_ACTION_PATH, {
      paystackTerminalAction: "mark_seen",
      paymentId: id,
    });
  }, []);

  const close = useCallback(() => {
    if (payment) markSeen(payment.id);
    setPayment(null);
  }, [payment, markSeen]);

  const onConfirm = useCallback(async () => {
    if (!payment) return;
    const suggestion = topSuggestion(payment);
    if (!suggestion) {
      router.push("/(app)/(tabs)/more/settings/paystack-terminal" as never);
      setPayment(null);
      return;
    }
    try {
      setAllocating(true);
      const res = await api.post(
        PAYSTACK_TERMINAL_PAYMENTS_ACTION_PATH,
        paystackTerminalAllocatePayload(payment.id, {
          action: "confirm",
          entity_type: suggestion.entity_type,
          entity_id: suggestion.entity_id,
        }),
      );
      if (res.error) {
        Alert.alert("Allocate payment", res.error.message ?? "Could not allocate this payment.");
        return;
      }
      setPayment(null);
    } catch (err) {
      Alert.alert("Allocate payment", err instanceof Error ? err.message : "Could not allocate this payment.");
    } finally {
      setAllocating(false);
    }
  }, [payment, router]);

  useEffect(() => {
    if (!provider?.id || !paystackTerminalEnabled) return;

    const channel = supabase
      .channel(nextRealtimeTopic(`terminal-payments:${provider.id}`))
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "provider_paystack_terminal_payments",
          filter: `provider_id=eq.${provider.id}`,
        },
        (payloadEvent) => {
          const row = payloadEvent.new as IncomingPayment;
          if (!row?.id || seenIds.current.has(row.id)) return;
          seenIds.current.add(row.id);
          if (appState.current !== "active") return;
          if (Platform.OS !== "web") Vibration.vibrate([0, 300, 150, 300]);
          setPayment(row);
        },
      )
      .subscribe();

    const appStateSub = AppState.addEventListener("change", (next) => {
      appState.current = next;
    });

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {
        /* ignore */
      }
      appStateSub.remove();
    };
  }, [provider?.id, paystackTerminalEnabled]);

  const currency = payment?.currency ?? "ZAR";
  const paid = Number(payment?.paid_amount ?? 0);
  const expected = payment?.expected_amount != null ? Number(payment.expected_amount) : null;
  const suggestion = payment ? topSuggestion(payment) : null;

  return (
    <BottomSheet visible={!!payment} onClose={close} title="Payment received">
      {payment ? (
        <View>
          <Text style={twStyle("text-sm text-gray-600 mb-3")}>
            A Paystack Terminal payment just arrived. Confirm where it belongs, or review it later
            from your terminal inbox.
          </Text>
          <View style={twStyle("rounded-2xl border border-emerald-200 bg-emerald-50 p-4 mb-3")}>
            <Text style={twStyle("text-3xl font-bold text-emerald-950")}>
              {currency} {paid.toFixed(2)}
            </Text>
            {expected != null ? (
              <Text style={twStyle("text-xs text-emerald-800 mt-1")}>
                Expected: {currency} {expected.toFixed(2)}
              </Text>
            ) : null}
            {payment.payer_name ? (
              <Text style={twStyle("text-sm text-emerald-900 mt-2")}>From {payment.payer_name}</Text>
            ) : null}
            {payment.customer_reference ? (
              <Text style={twStyle("text-xs text-emerald-800 mt-1")}>
                Booking/order note: {payment.customer_reference}
              </Text>
            ) : null}
            <Text style={twStyle("font-mono text-xs text-emerald-700 mt-2")}>
              {payment.paystack_reference}
            </Text>
          </View>

          <View style={twStyle("rounded-xl border border-gray-100 bg-white p-3 mb-4")}>
            <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>
              Suggested allocation
            </Text>
            <Text style={twStyle("text-sm font-semibold text-gray-900 mt-1")}>
              {suggestion
                ? suggestion.label ?? `${suggestion.entity_type} ${suggestion.entity_id.slice(0, 8)}…`
                : "No confident match — choose manually"}
            </Text>
          </View>

          <TouchableOpacity
            disabled={allocating}
            onPress={onConfirm}
            style={twStyle(`rounded-xl px-3 py-3 ${suggestion ? "bg-emerald-600" : "bg-gray-900"}`)}
          >
            <Text style={twStyle("text-center font-semibold text-white")}>
              {allocating ? "Allocating…" : suggestion ? "Confirm & allocate" : "Assign to something else"}
            </Text>
          </TouchableOpacity>
          {suggestion ? (
            <TouchableOpacity
              onPress={() => {
                setPayment(null);
                router.push("/(app)/(tabs)/more/settings/paystack-terminal" as never);
              }}
              style={twStyle("rounded-xl border border-gray-300 px-3 py-3 mt-2")}
            >
              <Text style={twStyle("text-center font-semibold text-gray-700")}>Assign to something else</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity onPress={close} style={twStyle("px-3 py-3 mt-1")}>
            <Text style={twStyle("text-center font-semibold text-gray-500")}>Save for later</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </BottomSheet>
  );
}
