import { View, Text, TouchableOpacity, Alert, Share } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { twStyle } from "@/lib/twStyle";
import { useFeatureFlag, useConfigBundle } from "@/providers/ConfigBundleProvider";
import { usePaystackTerminals, usePaystackTerminalPayments, type PaystackTerminalPayment } from "@/hooks/usePaystackTerminal";
import { TerminalPosterCard } from "@/components/TerminalPosterCard";
import { isPlanGateErrorCode, openProviderPlans, showPlanGateAlert } from "@/lib/plan-gate";
import { useTranslation } from "@beautonomi/i18n";

export default function PaystackTerminalSettingsScreen() {
  const { t } = useTranslation();
  const pt = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(`provider.mobile.screens.paystackTerminal.${key}`, opts) as string,
    [t],
  );
  const { isLoading: bundleLoading } = useConfigBundle();
  const paystackTerminalEnabled = useFeatureFlag("payment_paystack_virtual_terminal");
  const terminalDataEnabled = paystackTerminalEnabled && !bundleLoading;
  const { terminals, setupRequests, canRequestSetup, loading, error, refresh, requestTerminalSetup, requestAssets } =
    usePaystackTerminals({ enabled: terminalDataEnabled });
  const [selectedTerminalId, setSelectedTerminalId] = useState<string | null>(null);
  const { payments, refresh: refreshPayments, reconcile, allocate } = usePaystackTerminalPayments({
    enabled: terminalDataEnabled,
    terminalId: selectedTerminalId,
  });
  const [checkingPayments, setCheckingPayments] = useState(false);

  const onCheckForPayments = async () => {
    try {
      setCheckingPayments(true);
      const result = await reconcile();
      Alert.alert(pt("checkPaymentsTitle"), result?.message ?? pt("caughtUp"));
    } catch (err) {
      Alert.alert(pt("checkPaymentsTitle"), err instanceof Error ? err.message : pt("checkPaymentsFailed"));
    } finally {
      setCheckingPayments(false);
    }
  };
  const [creating, setCreating] = useState(false);
  const [requestingAssetsId, setRequestingAssetsId] = useState<string | null>(null);
  const [reviewPayment, setReviewPayment] = useState<PaystackTerminalPayment | null>(null);
  const [allocatingPaymentId, setAllocatingPaymentId] = useState<string | null>(null);
  const [posterOpenId, setPosterOpenId] = useState<string | null>(null);

  const onRequestSetup = async () => {
    try {
      setCreating(true);
      const result = await requestTerminalSetup(null, null);
      Alert.alert(pt("title"), result?.message ?? pt("opsNotified"));
    } catch (err) {
      const code = err && typeof err === "object" && "code" in err ? String((err as { code?: string }).code) : null;
      const msg = err instanceof Error ? err.message : pt("requestSetupFailed");
      if (isPlanGateErrorCode(code)) {
        showPlanGateAlert({ title: pt("title"), message: msg, errorCode: code });
      } else {
        Alert.alert(pt("title"), msg);
      }
    } finally {
      setCreating(false);
    }
  };

  const onRequestAssets = async (terminalId: string) => {
    try {
      setRequestingAssetsId(terminalId);
      const result = await requestAssets(terminalId);
      Alert.alert(pt("brandedQrTitle"), result?.message ?? pt("opsNotified"));
    } catch (err) {
      Alert.alert(pt("brandedQrTitle"), err instanceof Error ? err.message : pt("requestAssetsFailed"));
    } finally {
      setRequestingAssetsId(null);
    }
  };

  const assetLabel = (status?: string | null) => {
    if (status === "ready") return pt("assetReady");
    if (status === "link_ready") return pt("assetLinkReady");
    if (status === "poster_ready") return pt("assetPosterReady");
    return pt("assetSetupNeeded");
  };

  const amountMatchLabel = (status?: string | null) => {
    if (status === "exact_match") return pt("matchExact");
    if (status === "partial_payment") return pt("matchPartial");
    if (status === "overpayment") return pt("matchOver");
    if (status === "currency_mismatch") return pt("matchCurrency");
    if (status === "ambiguous_amount_match") return pt("matchAmbiguous");
    if (status === "amount_only_match") return pt("matchAmountOnly");
    return pt("matchNeedsReview");
  };

  // The inline review card is opened explicitly via "Review payment" (below) or by the global
  // realtime alert for genuinely new payments. We intentionally do NOT auto-pop it on every
  // poll, which previously made it impossible to dismiss while other payments were pending.

  // Keep the inbox ringfenced to a valid terminal: default to the first one and re-point if the
  // current selection disappears.
  useEffect(() => {
    setSelectedTerminalId((current) => {
      if (current && terminals.some((terminal) => terminal.id === current)) return current;
      return terminals[0]?.id ?? null;
    });
  }, [terminals]);

  useEffect(() => {
    if (!terminalDataEnabled) return;
    const interval = setInterval(() => {
      void refreshPayments();
    }, 15_000);
    return () => clearInterval(interval);
  }, [refreshPayments, terminalDataEnabled]);

  const closeReview = () => {
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
          Alert.alert(pt("confirmAllocTitle"), pt("confirmAllocNoSuggestion"));
          return;
        }
        await allocate(payment.id, {
          action: "confirm",
          entity_type: payment.suggested_entity_type,
          entity_id: payment.suggested_entity_id,
        });
        Alert.alert(pt("title"), pt("paymentAllocated"));
      } else if (action === "decline") {
        await allocate(payment.id, { action: "decline", reason: "Provider marked the booking/order note or match as incorrect." });
        Alert.alert(pt("title"), pt("paymentDeclined"));
      } else {
        await allocate(payment.id, { action: "admin_review", reason: "Provider requested admin review from mobile app." });
        Alert.alert(pt("title"), pt("sentAdminReview"));
      }
      setReviewPayment(null);
      await refreshPayments();
    } catch (err) {
      Alert.alert(pt("title"), err instanceof Error ? err.message : pt("allocFailed"));
    } finally {
      setAllocatingPaymentId(null);
    }
  };

  const onShareCode = async (code: string) => {
    await Share.share({
      title: pt("shareTitle"),
      message: pt("shareCodeMessage", { code }),
    });
  };

  const onShareLink = async (url: string) => {
    await Share.share({
      title: pt("shareLinkTitle"),
      message: pt("shareLinkMessage", { url }),
      url,
    });
  };

  const pendingRequests = setupRequests.filter(
    (request) => request.status === "requested" || request.status === "in_progress",
  );
  const rejectedRequest = setupRequests.find((request) => request.status === "rejected") ?? null;
  const hasPendingRequest = pendingRequests.length > 0;

  if (bundleLoading) {
    return (
      <ScreenContainer edges={["top"]} scrollable={false} reserveTabBarSpace={false}>
        <ScreenHeader title={pt("title")} showBack />
        <Text style={twStyle("text-sm text-gray-500 px-4")}>{pt("loading")}</Text>
      </ScreenContainer>
    );
  }

  if (!paystackTerminalEnabled) {
    return (
      <ScreenContainer edges={["top"]} scrollable={false} reserveTabBarSpace={false}>
        <ScreenHeader title={pt("title")} showBack />
        <EmptyState
          icon="qr-code-outline"
          title={pt("unavailableTitle")}
          description={pt("unavailableBody")}
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={["top"]} onRefresh={refresh} refreshing={loading} reserveTabBarSpace={false}>
      <ScreenHeader title={pt("title")} showBack />

      {/* Pending setup request banner */}
      {hasPendingRequest && terminals.length === 0 ? (
        <View style={twStyle("rounded-2xl border border-amber-200 bg-amber-50 p-4 mb-4")}>
          <View style={twStyle("flex-row items-center gap-2 mb-2")}>
            <Ionicons name="time-outline" size={20} color="#92400e" />
            <Text style={twStyle("text-sm font-semibold text-amber-900")}>{pt("setupReceived")}</Text>
          </View>
          <Text style={twStyle("text-sm text-amber-800")}>
            {pt("setupReceivedBody")}
          </Text>
          {pendingRequests[0]?.request_notes ? (
            <View style={twStyle("mt-3 rounded-xl bg-white/60 p-3")}>
              <Text style={twStyle("text-xs text-amber-800 font-medium")}>{pt("noteFromRequest")}</Text>
              <Text style={twStyle("text-xs text-amber-700 mt-1")}>{pendingRequests[0].request_notes}</Text>
            </View>
          ) : null}
          <View style={twStyle("mt-3 flex-row items-center gap-2")}>
            <TouchableOpacity
              onPress={refresh}
              style={twStyle("rounded-xl border border-amber-400 px-4 py-2")}
            >
              <Text style={twStyle("text-amber-900 font-semibold text-sm")}>{pt("checkForUpdates")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {/* Rejected request banner — provider fixes details and resubmits */}
      {rejectedRequest && !hasPendingRequest ? (
        <View style={twStyle("rounded-2xl border border-red-200 bg-red-50 p-4 mb-4")}>
          <View style={twStyle("flex-row items-center gap-2 mb-2")}>
            <Ionicons name="alert-circle-outline" size={20} color="#b91c1c" />
            <Text style={twStyle("text-sm font-semibold text-red-900")}>{pt("rejectedTitle")}</Text>
          </View>
          {rejectedRequest.rejection_reason ? (
            <Text style={twStyle("text-sm text-red-800")}>{rejectedRequest.rejection_reason}</Text>
          ) : null}
          <Text style={twStyle("text-xs text-red-700 mt-2")}>
            {pt("rejectedRetry")}
          </Text>
          {rejectedRequest.support_ticket_id ? (
            <Text style={twStyle("text-xs text-red-700 mt-2")}>
              {pt("rejectedSupport")}
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* Request setup — hidden when a request is already pending */}
      {!hasPendingRequest ? (
        <View style={twStyle("rounded-2xl border border-gray-100 bg-white p-4 mb-4")}>
          <Text style={twStyle("text-base font-semibold text-gray-900")}>{pt("requestSetupTitle")}</Text>
          {!canRequestSetup ? (
            <>
              <Text style={twStyle("text-sm text-red-700 mt-2")}>
                {pt("planGateBody")}
              </Text>
              <TouchableOpacity onPress={() => openProviderPlans()} hitSlop={8} style={twStyle("mt-2 self-start")}>
                <Text style={twStyle("text-sm font-semibold text-green-700")}>{pt("viewPlans")}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={twStyle("text-sm text-gray-600 mt-1")}>
                {pt("requestSetupBody")}
              </Text>
              <Text style={twStyle("text-xs text-gray-400 mt-2")}>
                {pt("inboxHint")}
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
                ? pt("requesting")
                : !canRequestSetup
                  ? pt("notOnPlan")
                  : rejectedRequest
                    ? pt("updateSubmit")
                    : pt("requestSetupCta")}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={twStyle("rounded-2xl border border-gray-100 bg-white p-4 mb-4")}>
        <View style={twStyle("flex-row justify-between items-center")}>
          <Text style={twStyle("text-base font-semibold text-gray-900")}>{pt("myTerminals")}</Text>
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
          <Text style={twStyle("text-sm text-gray-400 mt-3")}>{pt("loadingTerminals")}</Text>
        ) : terminals.length === 0 ? (
          <Text style={twStyle("text-sm text-gray-400 mt-3")}>
            {hasPendingRequest
              ? pt("pendingEmpty")
              : pt("emptyTerminals")}
          </Text>
        ) : (
            terminals.map((terminal) => (
              <View key={terminal.id} style={twStyle("border border-gray-100 rounded-xl p-3 mt-3")}>
                <View style={twStyle("flex-row items-center justify-between")}>
                  <Text style={twStyle("font-semibold text-gray-900")}>
                    {terminal.display_name || terminal.name}
                  </Text>
                  <Text style={twStyle(`ms-2 flex-1 text-end text-xs font-semibold ${terminal.asset_status === "ready" ? "text-green-700" : "text-amber-700"}`)}>
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
                    {pt("whatsappEnding", { last4: terminal.notification_whatsapp.replace(/\D/g, "").slice(-4) })}
                  </Text>
                ) : null}
                {terminal.asset_status !== "ready" ? (
                  <Text style={twStyle("text-xs text-amber-800 bg-amber-50 rounded-lg px-3 py-2 mt-2")}>
                    {pt("assetsPending")}
                  </Text>
                ) : null}
                <TouchableOpacity
                  onPress={() => onShareCode(terminal.terminal_code)}
                  style={twStyle("mt-3 rounded-xl border border-green-600 px-3 py-2")}
                >
                  <Text style={twStyle("text-center text-green-700 font-semibold")}>
                    {pt("shareCode")}
                  </Text>
                </TouchableOpacity>
                {terminal.payment_link || terminal.terminal_url ? (
                  <View style={twStyle("flex-row gap-2 mt-2")}>
                    <TouchableOpacity
                      onPress={() => onShareLink(terminal.payment_link || terminal.terminal_url || "")}
                      style={twStyle("flex-1 rounded-xl bg-green-600 px-3 py-2")}
                    >
                      <Text style={twStyle("text-center text-white font-semibold")}>{pt("shareLink")}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setPosterOpenId(terminal.id)}
                      style={twStyle("flex-1 rounded-xl border border-green-600 px-3 py-2")}
                    >
                      <Text style={twStyle("text-center text-green-700 font-semibold")}>{pt("openQrPoster")}</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
                <TerminalPosterCard
                  terminal={terminal}
                  open={posterOpenId === terminal.id}
                  onOpenChange={(next) => setPosterOpenId(next ? terminal.id : null)}
                />
                {terminal.asset_status !== "ready" ? (
                  <TouchableOpacity
                    onPress={() => onRequestAssets(terminal.id)}
                    disabled={requestingAssetsId === terminal.id}
                    style={twStyle("mt-2 rounded-xl bg-amber-100 px-3 py-2")}
                  >
                    <Text style={twStyle("text-center text-amber-900 font-semibold")}>
                      {requestingAssetsId === terminal.id ? pt("requesting") : pt("requestBranded")}
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
              <View style={twStyle("flex-1 pe-3")}>
                <Text style={twStyle("text-base font-semibold text-emerald-950")}>{pt("paymentReceived")}</Text>
                <Text style={twStyle("text-sm text-emerald-800 mt-1")}>
                  {pt("paymentReceivedBody")}
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
                {pt("expectedAmount", { amount: reviewPayment.expected_amount != null ? `${reviewPayment.currency} ${Number(reviewPayment.expected_amount).toFixed(2)}` : pt("noExpectedAmount") })}
              </Text>
              <Text style={twStyle("text-xs font-semibold text-emerald-700 mt-2")}>
                {pt("matchWithStatus", { label: amountMatchLabel(reviewPayment.amount_match_status), status: reviewPayment.amount_match_status })}
              </Text>
              <Text style={twStyle("font-mono text-xs text-gray-600 mt-2")}>
                {pt("paystackRef", { ref: reviewPayment.paystack_reference })}
              </Text>
              <Text style={twStyle("text-xs text-gray-600 mt-1")}>
                {pt("bookingNote", { note: reviewPayment.customer_reference || pt("notSupplied") })}
              </Text>
              <Text style={twStyle("text-xs text-gray-600 mt-1")}>
                {pt("suggestedTarget", { target: reviewPayment.suggested_entity_type && reviewPayment.suggested_entity_id
                  ? `${reviewPayment.suggested_entity_type} ${reviewPayment.suggested_entity_id.slice(0, 8)}...`
                  : pt("noConfidentMatch") })}
              </Text>
            </View>
            <View style={twStyle("flex-row flex-wrap gap-2 mt-3")}>
              {reviewPayment.suggested_entity_id ? (
                <TouchableOpacity
                  disabled={allocatingPaymentId === reviewPayment.id}
                  onPress={() => handleAllocationAction(reviewPayment, "confirm")}
                  style={twStyle("flex-1 rounded-xl px-3 py-3 bg-emerald-600")}
                >
                  <Text style={twStyle("text-center text-white font-semibold")}>
                    {allocatingPaymentId === reviewPayment.id ? pt("working") : pt("approveMatch")}
                  </Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                disabled={allocatingPaymentId === reviewPayment.id}
                onPress={() => handleAllocationAction(reviewPayment, "admin_review")}
                style={twStyle("flex-1 rounded-xl border border-amber-500 px-3 py-3")}
              >
                <Text style={twStyle("text-center text-amber-900 font-semibold")}>
                  {reviewPayment.suggested_entity_id ? pt("adminReview") : pt("sendToAdmin")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={allocatingPaymentId === reviewPayment.id}
                onPress={() => handleAllocationAction(reviewPayment, "decline")}
                style={twStyle("w-full rounded-xl border border-red-300 px-3 py-3")}
              >
                <Text style={twStyle("text-center text-red-700 font-semibold")}>{pt("incorrectDecline")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={allocatingPaymentId === reviewPayment.id}
                onPress={closeReview}
                style={twStyle("w-full rounded-xl px-3 py-3")}
              >
                <Text style={twStyle("text-center text-gray-500 font-semibold")}>{pt("dismiss")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

      <View style={twStyle("rounded-2xl border border-gray-100 bg-white p-4 mb-4")}>
          <View style={twStyle("flex-row justify-between items-center")}>
            <Text style={twStyle("text-base font-semibold text-gray-900")}>{pt("paymentInbox")}</Text>
            <TouchableOpacity onPress={refreshPayments} hitSlop={8}>
              <Ionicons name="refresh-outline" size={22} color="#16a34a" />
            </TouchableOpacity>
          </View>
          {terminals.length > 1 ? (
            <View style={twStyle("flex-row flex-wrap gap-2 mt-3")}>
              {terminals.map((terminal) => {
                const active = terminal.id === selectedTerminalId;
                return (
                  <TouchableOpacity
                    key={terminal.id}
                    onPress={() => setSelectedTerminalId(terminal.id)}
                    style={twStyle(`rounded-full border px-3 py-1.5 ${active ? "border-emerald-600 bg-emerald-50" : "border-gray-200"}`)}
                  >
                    <Text style={twStyle(`text-xs font-semibold ${active ? "text-emerald-700" : "text-gray-600"}`)}>
                      {terminal.display_name || terminal.name || terminal.terminal_code}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}
          <TouchableOpacity
            onPress={onCheckForPayments}
            disabled={checkingPayments}
            style={twStyle(`mt-3 flex-row items-center justify-center gap-2 rounded-xl border px-3 py-2 ${checkingPayments ? "border-gray-200" : "border-emerald-600"}`)}
          >
            <Ionicons name="sync-outline" size={18} color={checkingPayments ? "#9ca3af" : "#059669"} />
            <Text style={twStyle(`font-semibold ${checkingPayments ? "text-gray-400" : "text-emerald-700"}`)}>
              {checkingPayments ? pt("checking") : pt("checkForNew")}
            </Text>
          </TouchableOpacity>
          {payments.length === 0 ? (
            <Text style={twStyle("text-sm text-gray-400 mt-3")}>{pt("noPayments")}</Text>
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
                  {pt("bookingNote", { note: payment.customer_reference || pt("notSupplied") })}
                </Text>
                {["suggested", "unmatched", "admin_review"].includes(payment.allocation_status) ? (
                  <TouchableOpacity
                    onPress={() => setReviewPayment(payment)}
                    style={twStyle("mt-2 rounded-xl border border-emerald-600 px-3 py-2")}
                  >
                    <Text style={twStyle("text-center text-emerald-700 font-semibold")}>{pt("reviewPayment")}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ))
          )}
      </View>
    </ScreenContainer>
  );
}
