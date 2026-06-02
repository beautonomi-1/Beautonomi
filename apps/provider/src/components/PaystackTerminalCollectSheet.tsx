import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, Share, Linking, Alert } from "react-native";
import * as Clipboard from "expo-clipboard";
import QRCode from "react-native-qrcode-svg";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { twStyle } from "@/lib/twStyle";
import { api } from "@/lib/api-client";
import {
  PAYSTACK_TERMINAL_PAYMENTS_ACTION_PATH,
  paystackTerminalCollectionIntentPayload,
} from "@/lib/paystack-terminal-api";

type CollectTerminal = {
  id?: string;
  terminal_code?: string;
  name?: string | null;
  display_name?: string | null;
  payment_link?: string | null;
  terminal_url?: string | null;
  qr_url?: string | null;
};

type CollectResult = {
  terminal?: CollectTerminal;
  terminals?: CollectTerminal[];
  expectedAmount?: number | null;
  customerReference?: string | null;
};

/**
 * Shared in-person Paystack Terminal collection sheet used across mobile provider surfaces
 * (bookings, product orders, sales, walk-in, group bookings). Calls the collection-intent
 * endpoint when opened, then presents a scannable QR + terminal code + booking/order note so
 * the provider can collect the payment and let the webhook/inbox allocate it.
 */
export function PaystackTerminalCollectSheet({
  visible,
  onClose,
  entityType,
  entityId,
  expectedAmount,
  currency,
  customerReference,
}: {
  visible: boolean;
  onClose: () => void;
  entityType: string;
  entityId?: string | null;
  expectedAmount: number;
  currency: string;
  customerReference?: string | null;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CollectResult | null>(null);
  const [selectedTerminalId, setSelectedTerminalId] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setResult(null);
      setError(null);
      setSelectedTerminalId(null);
      return;
    }
    let cancelled = false;
    const charge = Number(expectedAmount.toFixed(2));
    if (charge <= 0) {
      setError("There is no remaining balance to collect.");
      return;
    }
    setLoading(true);
    setError(null);
    void (async () => {
      const res = await api.post<CollectResult>(
        PAYSTACK_TERMINAL_PAYMENTS_ACTION_PATH,
        paystackTerminalCollectionIntentPayload({
          entity_type: entityType,
          entity_id: entityId ?? undefined,
          expected_amount: charge,
          customer_reference: customerReference ?? undefined,
          terminal_id: selectedTerminalId ?? undefined,
        }),
      );
      if (cancelled) return;
      if (res.error) {
        setError(res.error.message ?? "Failed to prepare terminal payment.");
      } else if (!res.data?.terminal?.terminal_code) {
        setError("No active Paystack Terminal is available. Create one first.");
      } else {
        setResult(res.data);
        if (!selectedTerminalId && res.data.terminal?.id) {
          setSelectedTerminalId(res.data.terminal.id);
        }
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, entityType, entityId, expectedAmount, customerReference, selectedTerminalId]);

  const terminal = result?.terminal;
  const link = terminal?.payment_link || terminal?.terminal_url || terminal?.qr_url || null;
  const qrValue = link || (terminal?.terminal_code ? `https://paystack.shop/pay/${terminal.terminal_code}` : null);
  const amount = Number(result?.expectedAmount ?? expectedAmount);

  const onCopy = async (value: string, label: string) => {
    await Clipboard.setStringAsync(value);
    Alert.alert("Copied", `${label} copied to clipboard.`);
  };

  const onShare = () => {
    void Share.share({
      title: "Paystack Terminal",
      message: link
        ? `Pay ${currency} ${amount.toFixed(2)} using this Paystack Terminal link: ${link}`
        : `Pay ${currency} ${amount.toFixed(2)} using Paystack Terminal code ${terminal?.terminal_code}.`,
      url: link ?? undefined,
    });
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Paystack Terminal">
      {loading ? (
        <View style={twStyle("py-8 items-center")}>
          <ActivityIndicator color="#16a34a" />
          <Text style={twStyle("text-sm text-gray-500 mt-3")}>Preparing in-person payment…</Text>
        </View>
      ) : error ? (
        <View style={twStyle("py-6")}>
          <Text style={twStyle("text-sm text-red-700")}>{error}</Text>
          <TouchableOpacity onPress={onClose} style={twStyle("mt-4 rounded-xl border border-gray-300 px-3 py-3")}>
            <Text style={twStyle("text-center font-semibold text-gray-700")}>Close</Text>
          </TouchableOpacity>
        </View>
      ) : terminal ? (
        <View>
          <Text style={twStyle("text-sm text-gray-600 mb-3")}>
            Ask the customer to scan this QR or use the link to pay. Paystack generates the transaction
            reference; once it arrives, allocate it from your terminal inbox.
          </Text>
          {result?.terminals && result.terminals.length > 1 ? (
            <View style={twStyle("mb-3")}>
              <Text style={twStyle("text-xs font-semibold text-gray-500 mb-2")}>Collect on terminal</Text>
              <View style={twStyle("flex-row flex-wrap gap-2")}>
                {result.terminals.map((t) => {
                  const active = (selectedTerminalId ?? terminal?.id) === t.id;
                  return (
                    <TouchableOpacity
                      key={t.id ?? t.terminal_code}
                      onPress={() => t.id && setSelectedTerminalId(t.id)}
                      style={twStyle(`rounded-full border px-3 py-2 ${active ? "border-emerald-600 bg-emerald-50" : "border-gray-200 bg-white"}`)}
                    >
                      <Text style={twStyle(`text-xs font-semibold ${active ? "text-emerald-700" : "text-gray-600"}`)}>
                        {t.display_name || t.name || t.terminal_code}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ) : null}
          {qrValue ? (
            <View style={twStyle("items-center mb-3")}>
              <View style={twStyle("rounded-2xl bg-white p-3 border border-gray-100")}>
                <QRCode value={qrValue} size={200} />
              </View>
            </View>
          ) : null}
          <View style={twStyle("rounded-2xl border border-emerald-200 bg-emerald-50 p-4 mb-3")}>
            <Text style={twStyle("text-xs uppercase tracking-wide text-emerald-700")}>Terminal code</Text>
            <Text style={twStyle("mt-2 font-mono text-2xl font-semibold text-emerald-950")}>
              {terminal.terminal_code}
            </Text>
            <Text style={twStyle("mt-2 text-sm text-emerald-800")}>
              Expected: {currency} {amount.toFixed(2)}
            </Text>
          </View>
          <View style={twStyle("flex-row gap-2")}>
            <TouchableOpacity onPress={onShare} style={twStyle("flex-1 rounded-xl bg-emerald-600 px-3 py-3")}>
              <Text style={twStyle("text-center font-semibold text-white")}>Share</Text>
            </TouchableOpacity>
          </View>
          {link ? (
            <View style={twStyle("flex-row gap-2 mt-2")}>
              <TouchableOpacity
                onPress={() => onCopy(link, "Payment link")}
                style={twStyle("flex-1 rounded-xl border border-gray-300 px-3 py-3")}
              >
                <Text style={twStyle("text-center font-semibold text-gray-700")}>Copy link</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => void Linking.openURL(link)}
                style={twStyle("flex-1 rounded-xl border border-gray-300 px-3 py-3")}
              >
                <Text style={twStyle("text-center font-semibold text-gray-700")}>Open link</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          <TouchableOpacity onPress={onClose} style={twStyle("mt-3 rounded-xl px-3 py-3")}>
            <Text style={twStyle("text-center font-semibold text-gray-500")}>Done</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </BottomSheet>
  );
}
