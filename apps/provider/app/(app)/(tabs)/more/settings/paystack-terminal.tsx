import { View, Text, TouchableOpacity, Alert, Share, Linking, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { twStyle } from "@/lib/twStyle";
import { useFeatureFlag, useConfigBundle } from "@/providers/ConfigBundleProvider";
import { usePaystackTerminals, usePaystackTerminalPayments, type PaystackTerminalPayment } from "@/hooks/usePaystackTerminal";
import { TerminalPosterCard } from "@/components/TerminalPosterCard";

export default function PaystackTerminalSettingsScreen() {
  const { isLoading: bundleLoading } = useConfigBundle();
  const paystackTerminalEnabled = useFeatureFlag("payment_paystack_virtual_terminal");
  const terminalDataEnabled = paystackTerminalEnabled && !bundleLoading;
  const { terminals, setupRequests, canRequestSetup, loading, error, refresh, requestTerminalSetup, requestAssets } =
    usePaystackTerminals({ enabled: terminalDataEnabled });
  const { payments, refresh: refreshPayments, reconcile, allocate } = usePaystackTerminalPayments({
    enabled: terminalDataEnabled,
  });
  const [checkingPayments, setCheckingPayments] = useState(false);

  const onCheckForPayments = async () => {
    try {
      setCheckingPayments(true);
      const result = await reconcile();
      Alert.alert("Check for new payments", result?.message ?? "You're all caught up.");
    } catch (err) {
      Alert.alert("Check for new payments", err instanceof Error ? err.message : "Could not check for new payments.");
    } finally {
      setCheckingPayments(false);
    }
  };
  const [creating, setCreating] = useState(false);
  const [whatsapp, setWhatsapp] = useState("");
  const [requestingAssetsId, setRequestingAssetsId] = useState<string | null>(null);
  const [reviewPayment, setReviewPayment] = useState<PaystackTerminalPayment | null>(null);
  const [reviewDismissedId, setReviewDismissedId] = useState<string | null>(null);
  const [allocatingPaymentId, setAllocatingPaymentId] = useState<string | null>(null);

  const onRequestSetup = async () => {
    try {
      setCreating(true);
      const result = await requestTerminalSetup(null, whatsapp);
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
    if (!terminalDataEnabled) return;
    const interval = setInterval(() => {
      void refreshPayments();
    }, 15_000);
    return () => clearInterval(interval);
  }, [refreshPayments, terminalDataEnabled]);

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

  const pendingRequests = setupRequests.filter(
    (request) => request.status === "requested" || request.status === "in_progress",
  );
  const rejectedRequest = setupRequests.find((request) => request.status === "rejected") ?? null;
  const hasPendingRequest = pendingRequests.length > 0;

  if (bundleLoading) {
    return (
      <ScreenContainer edges={["top"]} scrollable={false} reserveTabBarSpace={false}>
        <ScreenHeader title="Paystack Terminal" showBack />
        <Text style={twStyle("text-sm text-gray-500 px-4")}>Loading…</Text>
      </ScreenContainer>
    );
  }

  if (!paystackTerminalEnabled) {
    return (
      <ScreenContainer edges={["top"]} scrollable={false} reserveTabBarSpace={false}>
        <ScreenHeader title="Paystack Terminal" showBack />
        <EmptyState
          icon="qr-code-outline"
          title="Paystack Terminal unavailable"
          description="Paystack Terminal payments are not enabled for this market."
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={["top"]} onRefresh={refresh} refreshing={loading} reserveTabBarSpace={false}>
      <ScreenHeader title="Paystack Terminal" showBack />

      {/* Pending setup request banner */}
      {hasPendingRequest && terminals.length === 0 ? (
        <View style={twStyle("rounded-2xl border border-amber-200 bg-amber-50 p-4 mb-4")}>
          <View style={twStyle("flex-row items-center gap-2 mb-2")}>
            <Ionicons name="time-outline" size={20} color="#92400e" />
            <Text style={twStyle("text-sm font-semibold text-amber-900")}>Setup request received</Text>
          </View>
          <Text style={twStyle("text-sm text-amber-800")}>
            Beautonomi Ops has been notified and will create your Paystack Virtual Terminal shortly. Your terminal, payment link, QR, and poster will appear here once ready.
          </Text>
          {pendingRequests[0]?.request_notes ? (
            <View style={twStyle("mt-3 rounded-xl bg-white/60 p-3")}>
              <Text style={twStyle("text-xs text-amber-800 font-medium")}>Note from your request:</Text>
              <Text style={twStyle("text-xs text-amber-700 mt-1")}>{pendingRequests[0].request_notes}</Text>
            </View>
          ) : null}
          <View style={twStyle("mt-3 flex-row items-center gap-2")}>
            <TouchableOpacity
              onPress={refresh}
              style={twStyle("rounded-xl border border-amber-400 px-4 py-2")}
            >
              <Text style={twStyle("text-amber-900 font-semibold text-sm")}>Check for updates</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {/* Rejected request banner — provider fixes details and resubmits */}
      {rejectedRequest && !hasPendingRequest ? (
        <View style={twStyle("rounded-2xl border border-red-200 bg-red-50 p-4 mb-4")}>
          <View style={twStyle("flex-row items-center gap-2 mb-2")}>
            <Ionicons name="alert-circle-outline" size={20} color="#b91c1c" />
            <Text style={twStyle("text-sm font-semibold text-red-900")}>Your last setup request needs changes</Text>
          </View>
          {rejectedRequest.rejection_reason ? (
            <Text style={twStyle("text-sm text-red-800")}>{rejectedRequest.rejection_reason}</Text>
          ) : null}
          <Text style={twStyle("text-xs text-red-700 mt-2")}>
            Update your WhatsApp number below (international format, e.g. +27821234567) and submit a new request.
          </Text>
          {rejectedRequest.support_ticket_id ? (
            <Text style={twStyle("text-xs text-red-700 mt-2")}>
              Our team opened a support conversation — check your email or notifications to reply.
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* Request setup — hidden when a request is already pending */}
      {!hasPendingRequest ? (
        <View style={twStyle("rounded-2xl border border-gray-100 bg-white p-4 mb-4")}>
          <Text style={twStyle("text-base font-semibold text-gray-900")}>Request terminal setup</Text>
          {!canRequestSetup ? (
            <Text style={twStyle("text-sm text-red-700 mt-2")}>
              Your plan does not include Paystack Terminal. Contact support or upgrade your subscription.
            </Text>
          ) : (
            <>
              <Text style={twStyle("text-sm text-gray-600 mt-1")}>
                Beautonomi Ops will create your Virtual Terminal in Paystack and add the terminal code, payment link, QR, and poster here once ready.
              </Text>
              <Text style={twStyle("text-xs text-gray-500 mt-3 mb-1")}>
                WhatsApp number for payment notifications
              </Text>
              <TextInput
                value={whatsapp}
                onChangeText={setWhatsapp}
                placeholder="+27821234567"
                keyboardType="phone-pad"
                autoCapitalize="none"
                editable={!creating}
                style={twStyle("rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900")}
              />
              <Text style={twStyle("text-xs text-gray-400 mt-1")}>
                Use the international format. Leave blank to use the phone number on your profile. Payments appear in the inbox below after Paystack reconciliation.
              </Text>
            </>
          )}
          <TouchableOpacity
            disabled={creating || !canRequestSetup}
            onPress={onRequestSetup}
            style={twStyle(`mt-4 rounded-xl px-4 py-3 items-center ${creating || !canRequestSetup ? "bg-gray-300" : "bg-green-600"}`)}
          >
            <Text style={twStyle("text-center text-white font-semibold")}>
              {creating
                ? "Requesting…"
                : !canRequestSetup
                  ? "Not available on your plan"
                  : rejectedRequest
                    ? "Update & submit new request"
                    : "Request Paystack Terminal setup"}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={twStyle("rounded-2xl border border-gray-100 bg-white p-4 mb-4")}>
        <View style={twStyle("flex-row justify-between items-center")}>
          <Text style={twStyle("text-base font-semibold text-gray-900")}>My terminals</Text>
          <TouchableOpacity onPress={refresh} hitSlop={8}>
            <Ionicons name="refresh-outline" size={22} color="#16a34a" />
          </TouchableOpacity>
        </View>
        {error ? (
          <View style={twStyle("mt-3 rounded-xl bg-red-50 border border-red-100 p-3")}>
            <Text style={twStyle("text-sm text-red-700")}>{error}</Text>
          </View>
        ) : null}
        {loading ? (
          <Text style={twStyle("text-sm text-gray-400 mt-3")}>Loading terminals…</Text>
        ) : terminals.length === 0 ? (
          <Text style={twStyle("text-sm text-gray-400 mt-3")}>
            {hasPendingRequest
              ? "Your terminal will appear here once Ops has completed the setup."
              : "No Paystack Terminals yet. Request a setup above."}
          </Text>
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
                <TerminalPosterCard terminal={terminal} />
                {terminal.asset_status !== "ready" ? (
                  <TouchableOpacity
                    onPress={() => onRequestAssets(terminal.id)}
                    disabled={requestingAssetsId === terminal.id}
                    style={twStyle("mt-2 rounded-xl bg-amber-100 px-3 py-2")}
                  >
                    <Text style={twStyle("text-center text-amber-900 font-semibold")}>
                      {requestingAssetsId === terminal.id ? "Requesting…" : "Request branded QR/poster"}
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

      <View style={twStyle("rounded-2xl border border-gray-100 bg-white p-4 mb-4")}>
          <View style={twStyle("flex-row justify-between items-center")}>
            <Text style={twStyle("text-base font-semibold text-gray-900")}>Payment inbox</Text>
            <TouchableOpacity onPress={refreshPayments} hitSlop={8}>
              <Ionicons name="refresh-outline" size={22} color="#16a34a" />
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            onPress={onCheckForPayments}
            disabled={checkingPayments}
            style={twStyle(`mt-3 flex-row items-center justify-center gap-2 rounded-xl border px-3 py-2 ${checkingPayments ? "border-gray-200" : "border-emerald-600"}`)}
          >
            <Ionicons name="sync-outline" size={18} color={checkingPayments ? "#9ca3af" : "#059669"} />
            <Text style={twStyle(`font-semibold ${checkingPayments ? "text-gray-400" : "text-emerald-700"}`)}>
              {checkingPayments ? "Checking…" : "Check for new payments"}
            </Text>
          </TouchableOpacity>
          {payments.length === 0 ? (
            <Text style={twStyle("text-sm text-gray-400 mt-3")}>No terminal payments yet.</Text>
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
    </ScreenContainer>
  );
}
