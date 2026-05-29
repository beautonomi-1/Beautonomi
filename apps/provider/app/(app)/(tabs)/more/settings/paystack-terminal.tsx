import { View, Text, ScrollView, TouchableOpacity, Alert, Share, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { twStyle } from "@/lib/twStyle";
import { useFeatureFlag } from "@/providers/ConfigBundleProvider";
import { usePaystackTerminals, usePaystackTerminalPayments, type PaystackTerminalPayment } from "@/hooks/usePaystackTerminal";

export default function PaystackTerminalSettingsScreen() {
  const paystackTerminalEnabled = useFeatureFlag("payment_paystack_virtual_terminal");
  const { terminals, loading, error, refresh, requestTerminalSetup, requestAssets } = usePaystackTerminals();
  const { payments, refresh: refreshPayments, allocate } = usePaystackTerminalPayments();
  const [creating, setCreating] = useState(false);
  const [requestingAssetsId, setRequestingAssetsId] = useState<string | null>(null);
  const [reviewPayment, setReviewPayment] = useState<PaystackTerminalPayment | null>(null);
  const [reviewDismissedId, setReviewDismissedId] = useState<string | null>(null);
  const [allocatingPaymentId, setAllocatingPaymentId] = useState<string | null>(null);

  const onRequestSetup = async () => {
    try {
      setCreating(true);
      const result = await requestTerminalSetup(null);
      Alert.alert("Paystack Terminal", result?.message ?? "Beautonomi Ops has been notified.");
    } catch (err) {
      Alert.alert("Paystack Terminal", err instanceof Error ? err.message : "Failed to request terminal setup");
    } finally {
      setCreating(false);
    }
  };

  const onRequestAssets = async (terminalId: string) => {
    try {
      setRequestingAssetsId(terminalId);
      const result = await requestAssets(terminalId);
      Alert.alert("Branded QR/poster", result?.message ?? "Beautonomi Ops has been notified.");
    } catch (err) {
      Alert.alert("Branded QR/poster", err instanceof Error ? err.message : "Failed to request branded assets");
    } finally {
      setRequestingAssetsId(null);
    }
  };

  const assetLabel = (status?: string | null) => {
    if (status === "ready") return "Ready";
    if (status === "link_ready") return "Link ready · QR/poster in progress";
    if (status === "poster_ready") return "Poster ready · link needed";
    return "Setup needed";
  };

  const amountMatchLabel = (status?: string | null) => {
    if (status === "exact_match") return "Amount matches";
    if (status === "partial_payment") return "Partial payment";
    if (status === "overpayment") return "Overpayment";
    if (status === "currency_mismatch") return "Currency mismatch";
    if (status === "ambiguous_amount_match") return "Ambiguous amount match";
    if (status === "amount_only_match") return "Amount-only match";
    return "Needs review";
  };

  const actionablePayment = payments.find((payment) =>
    ["suggested", "unmatched", "admin_review"].includes(payment.allocation_status) &&
    payment.id !== reviewDismissedId,
  );

  useEffect(() => {
    if (actionablePayment && !reviewPayment) setReviewPayment(actionablePayment);
  }, [actionablePayment, reviewPayment]);

  useEffect(() => {
    const interval = setInterval(() => {
      void refreshPayments();
    }, 15_000);
    return () => clearInterval(interval);
  }, [refreshPayments]);

  const closeReview = () => {
    if (reviewPayment) setReviewDismissedId(reviewPayment.id);
    setReviewPayment(null);
  };

  const handleAllocationAction = async (
    payment: PaystackTerminalPayment,
    action: "confirm" | "decline" | "admin_review",
  ) => {
    try {
      setAllocatingPaymentId(payment.id);
      if (action === "confirm") {
        if (!payment.suggested_entity_type || !payment.suggested_entity_id) {
          Alert.alert("Confirm allocation", "No suggested booking, order, or sale was found. Send this to admin review instead.");
          return;
        }
        await allocate(payment.id, {
          action: "confirm",
          entity_type: payment.suggested_entity_type,
          entity_id: payment.suggested_entity_id,
        });
        Alert.alert("Paystack Terminal", "Payment allocated.");
      } else if (action === "decline") {
        await allocate(payment.id, { action: "decline", reason: "Provider marked the booking/order note or match as incorrect." });
        Alert.alert("Paystack Terminal", "Payment marked as incorrect and blocked for review.");
      } else {
        await allocate(payment.id, { action: "admin_review", reason: "Provider requested admin review from mobile app." });
        Alert.alert("Paystack Terminal", "Sent to admin review.");
      }
      setReviewPayment(null);
      await refreshPayments();
    } catch (err) {
      Alert.alert("Paystack Terminal", err instanceof Error ? err.message : "Failed to update payment allocation.");
    } finally {
      setAllocatingPaymentId(null);
    }
  };

  const onShareCode = async (code: string) => {
    await Share.share({
      title: "Paystack Terminal",
      message: `Use Paystack Terminal code ${code} for this in-person payment.`,
    });
  };

  const onShareLink = async (url: string) => {
    await Share.share({
      title: "Paystack Terminal payment link",
      message: `Pay securely using this Paystack Terminal link: ${url}`,
      url,
    });
  };

  const onOpenUrl = async (url: string) => {
    const ok = await Linking.canOpenURL(url);
    if (!ok) {
      Alert.alert("Paystack Terminal", "Could not open this link on your device.");
      return;
    }
    await Linking.openURL(url);
  };

  if (!paystackTerminalEnabled) {
    return (
      <SafeAreaView style={twStyle("flex-1 bg-gray-50")}>
        <ScreenHeader title="Paystack Terminal" showBack />
        <EmptyState
          icon="qr-code-outline"
          title="Paystack Terminal unavailable"
          description="Paystack Terminal payments are not enabled for this market."
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={twStyle("flex-1 bg-gray-50")}>
      <ScreenHeader title="Paystack Terminal" />
      <ScrollView style={twStyle("flex-1")} contentContainerStyle={twStyle("p-4 pb-8")}>
        <View style={twStyle("rounded-2xl bg-white p-4 mb-4")}>
          <Text style={twStyle("text-base font-semibold text-gray-900")}>Request terminal setup</Text>
          <Text style={twStyle("text-sm text-gray-600 mt-1")}>
            Beautonomi Ops creates or fetches your Virtual Terminal in Paystack, then adds the Paystack-generated code, payment link, QR, and poster here.
          </Text>
          <Text style={twStyle("text-xs text-gray-500 mt-3")}>
            Paystack generates the terminal code and payment references. Once Ops imports the terminal, you can share its payment link and manually allocate incoming payments.
          </Text>
          <Text style={twStyle("text-xs text-gray-500 mt-2")}>
            WhatsApp alerts go to the configured destination number, but Beautonomi maps payments by terminal code and shows them in this inbox after webhook or admin reconciliation.
          </Text>
          <TouchableOpacity
            disabled={creating}
            onPress={onRequestSetup}
            style={twStyle(
              `mt-3 rounded-xl px-4 py-3 ${creating ? "bg-gray-300" : "bg-green-600"}`,
            )}
          >
            <Text style={twStyle("text-center text-white font-semibold")}>
              {creating ? "Requesting..." : "Request Paystack Terminal setup"}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={twStyle("rounded-2xl bg-white p-4 mb-4")}>
          <View style={twStyle("flex-row justify-between items-center")}>
            <Text style={twStyle("text-base font-semibold text-gray-900")}>Terminals</Text>
            <TouchableOpacity onPress={refresh}>
              <Ionicons name="refresh-outline" size={22} color="#16a34a" />
            </TouchableOpacity>
          </View>
          {error ? <Text style={twStyle("text-sm text-red-600 mt-2")}>{error}</Text> : null}
          {loading ? (
            <Text style={twStyle("text-sm text-gray-500 mt-3")}>Loading terminals...</Text>
          ) : terminals.length === 0 ? (
            <Text style={twStyle("text-sm text-gray-500 mt-3")}>No Paystack Terminals yet.</Text>
          ) : (
            terminals.map((terminal) => (
              <View key={terminal.id} style={twStyle("border border-gray-100 rounded-xl p-3 mt-3")}>
                <View style={twStyle("flex-row items-center justify-between")}>
                  <Text style={twStyle("font-semibold text-gray-900")}>
                    {terminal.display_name || terminal.name}
                  </Text>
                  <Text style={twStyle(`ml-2 flex-1 text-right text-xs font-semibold ${terminal.asset_status === "ready" ? "text-green-700" : "text-amber-700"}`)}>
                    {assetLabel(terminal.asset_status)}
                  </Text>
                </View>
                <Text style={twStyle("font-mono text-xs text-gray-600 mt-1")}>
                  {terminal.terminal_code}
                </Text>
                <Text style={twStyle("text-xs text-gray-500 mt-1")}>
                  {terminal.status} · {terminal.currency}
                </Text>
                {terminal.notification_whatsapp ? (
                  <Text style={twStyle("text-xs text-gray-500 mt-1")}>
                    WhatsApp notifications ending {terminal.notification_whatsapp.replace(/\D/g, "").slice(-4)}
                  </Text>
                ) : null}
                {terminal.asset_status !== "ready" ? (
                  <Text style={twStyle("text-xs text-amber-800 bg-amber-50 rounded-lg px-3 py-2 mt-2")}>
                    Ops still needs to add or refresh Paystack-generated assets before this terminal is fully ready.
                  </Text>
                ) : null}
                <TouchableOpacity
                  onPress={() => onShareCode(terminal.terminal_code)}
                  style={twStyle("mt-3 rounded-xl border border-green-600 px-3 py-2")}
                >
                  <Text style={twStyle("text-center text-green-700 font-semibold")}>
                    Share terminal code
                  </Text>
                </TouchableOpacity>
                {terminal.payment_link || terminal.terminal_url ? (
                  <View style={twStyle("flex-row gap-2 mt-2")}>
                    <TouchableOpacity
                      onPress={() => onShareLink(terminal.payment_link || terminal.terminal_url || "")}
                      style={twStyle("flex-1 rounded-xl bg-green-600 px-3 py-2")}
                    >
                      <Text style={twStyle("text-center text-white font-semibold")}>Share link</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => onOpenUrl(terminal.payment_link || terminal.terminal_url || "")}
                      style={twStyle("flex-1 rounded-xl border border-green-600 px-3 py-2")}
                    >
                      <Text style={twStyle("text-center text-green-700 font-semibold")}>Open link</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
                {terminal.qr_url || terminal.poster_url ? (
                  <View style={twStyle("flex-row gap-2 mt-2")}>
                    {terminal.qr_url ? (
                      <TouchableOpacity
                        onPress={() => onOpenUrl(terminal.qr_url || "")}
                        style={twStyle("flex-1 rounded-xl border border-gray-300 px-3 py-2")}
                      >
                        <Text style={twStyle("text-center text-gray-800 font-semibold")}>Show QR</Text>
                      </TouchableOpacity>
                    ) : null}
                    {terminal.poster_url ? (
                      <TouchableOpacity
                        onPress={() => onShareLink(terminal.poster_url || "")}
                        style={twStyle("flex-1 rounded-xl border border-gray-300 px-3 py-2")}
                      >
                        <Text style={twStyle("text-center text-gray-800 font-semibold")}>Share poster</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ) : null}
                {terminal.asset_status !== "ready" ? (
                  <TouchableOpacity
                    onPress={() => onRequestAssets(terminal.id)}
                    disabled={requestingAssetsId === terminal.id}
                    style={twStyle("mt-2 rounded-xl bg-amber-100 px-3 py-2")}
                  >
                    <Text style={twStyle("text-center text-amber-900 font-semibold")}>
                      {requestingAssetsId === terminal.id ? "Requesting..." : "Request branded QR/poster"}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ))
          )}
        </View>
        {reviewPayment ? (
          <View style={twStyle("rounded-2xl border border-emerald-200 bg-emerald-50 p-4 mb-4")}>
            <View style={twStyle("flex-row items-start justify-between")}>
              <View style={twStyle("flex-1 pr-3")}>
                <Text style={twStyle("text-base font-semibold text-emerald-950")}>Payment received</Text>
                <Text style={twStyle("text-sm text-emerald-800 mt-1")}>
                  Paystack generated the transaction reference. Check the amount and any booking/order note before choosing where to allocate it.
                </Text>
              </View>
              <TouchableOpacity onPress={closeReview}>
                <Ionicons name="close" size={22} color="#047857" />
              </TouchableOpacity>
            </View>
            <View style={twStyle("rounded-xl bg-white/80 p-3 mt-3")}>
              <Text style={twStyle("text-2xl font-bold text-gray-900")}>
                {reviewPayment.currency} {Number(reviewPayment.paid_amount ?? 0).toFixed(2)}
              </Text>
              <Text style={twStyle("text-xs text-gray-600 mt-1")}>
                Expected: {reviewPayment.expected_amount != null ? `${reviewPayment.currency} ${Number(reviewPayment.expected_amount).toFixed(2)}` : "No expected amount"}
              </Text>
              <Text style={twStyle("text-xs font-semibold text-emerald-700 mt-2")}>
                {amountMatchLabel(reviewPayment.amount_match_status)} · {reviewPayment.amount_match_status}
              </Text>
              <Text style={twStyle("font-mono text-xs text-gray-600 mt-2")}>
                Paystack ref: {reviewPayment.paystack_reference}
              </Text>
              <Text style={twStyle("text-xs text-gray-600 mt-1")}>
                Booking/order note: {reviewPayment.customer_reference || "Not supplied"}
              </Text>
              <Text style={twStyle("text-xs text-gray-600 mt-1")}>
                Suggested target: {reviewPayment.suggested_entity_type && reviewPayment.suggested_entity_id
                  ? `${reviewPayment.suggested_entity_type} ${reviewPayment.suggested_entity_id.slice(0, 8)}...`
                  : "No confident match"}
              </Text>
            </View>
            <View style={twStyle("flex-row flex-wrap gap-2 mt-3")}>
              <TouchableOpacity
                disabled={allocatingPaymentId === reviewPayment.id || !reviewPayment.suggested_entity_id}
                onPress={() => handleAllocationAction(reviewPayment, "confirm")}
                style={twStyle(`flex-1 rounded-xl px-3 py-3 ${reviewPayment.suggested_entity_id ? "bg-emerald-600" : "bg-gray-300"}`)}
              >
                <Text style={twStyle("text-center text-white font-semibold")}>
                  {allocatingPaymentId === reviewPayment.id ? "Working..." : "Approve match"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={allocatingPaymentId === reviewPayment.id}
                onPress={() => handleAllocationAction(reviewPayment, "admin_review")}
                style={twStyle("flex-1 rounded-xl border border-amber-500 px-3 py-3")}
              >
                <Text style={twStyle("text-center text-amber-900 font-semibold")}>Admin review</Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={allocatingPaymentId === reviewPayment.id}
                onPress={() => handleAllocationAction(reviewPayment, "decline")}
                style={twStyle("w-full rounded-xl border border-red-300 px-3 py-3")}
              >
                <Text style={twStyle("text-center text-red-700 font-semibold")}>Incorrect ref / decline</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        <View style={twStyle("rounded-2xl bg-white p-4")}>
          <View style={twStyle("flex-row justify-between items-center")}>
            <Text style={twStyle("text-base font-semibold text-gray-900")}>Payment inbox</Text>
            <TouchableOpacity onPress={refreshPayments}>
              <Ionicons name="refresh-outline" size={22} color="#16a34a" />
            </TouchableOpacity>
          </View>
          {payments.length === 0 ? (
            <Text style={twStyle("text-sm text-gray-500 mt-3")}>No terminal payments yet.</Text>
          ) : (
            payments.slice(0, 10).map((payment) => (
              <View key={payment.id} style={twStyle("border border-gray-100 rounded-xl p-3 mt-3")}>
                <Text style={twStyle("font-semibold text-gray-900")}>
                  {payment.currency} {Number(payment.paid_amount ?? 0).toFixed(2)}
                </Text>
                <Text style={twStyle("text-xs text-gray-500 mt-1")}>
                  {payment.allocation_status} · {payment.amount_match_status}
                </Text>
                <Text style={twStyle("font-mono text-xs text-gray-600 mt-1")}>
                  {payment.paystack_reference}
                </Text>
                <Text style={twStyle("text-xs text-gray-500 mt-1")}>
                Booking/order note: {payment.customer_reference || "Not supplied"}
                </Text>
                {["suggested", "unmatched", "admin_review"].includes(payment.allocation_status) ? (
                  <TouchableOpacity
                    onPress={() => setReviewPayment(payment)}
                    style={twStyle("mt-2 rounded-xl border border-emerald-600 px-3 py-2")}
                  >
                    <Text style={twStyle("text-center text-emerald-700 font-semibold")}>Review payment</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
