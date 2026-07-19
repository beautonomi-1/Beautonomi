/**
 * PayCloudPaymentSheet – Bottom sheet for in-person card payments via PayCloud terminal.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ActionButton } from "@/components/ui/ActionButton";
import {
  usePayCloudTerminals,
  usePayCloudSettings,
  usePayCloudPayment,
  isPaycloudCaptureUnderReview,
  type PayCloudTerminal,
  type PayCloudPaymentResult,
  type PayCloudEntityType,
} from "@/hooks/usePayCloud";
import { formatCurrency } from "@/lib/format";
import { twStyle } from "@/lib/twStyle";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";
import { useFeatureFlag } from "@/providers/ConfigBundleProvider";
import {
  canLaunchPaycloudSameTerminal,
  getPaycloudDeviceSerial,
  startPaycloudSameTerminalSale,
} from "@/lib/paycloud-same-terminal";

const SAME_TERMINAL_POLL_INTERVAL_MS = 3000;
const SAME_TERMINAL_POLL_TIMEOUT_MS = 2 * 60 * 1000;

async function pollSameTerminalSettlement(
  paymentId: string,
  confirmPayment: (id: string) => Promise<PayCloudPaymentResult | null>,
  pollPayment: (id: string) => Promise<PayCloudPaymentResult | null>,
): Promise<PayCloudPaymentResult | null> {
  const deadline = Date.now() + SAME_TERMINAL_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await confirmPayment(paymentId);
    const polled = await pollPayment(paymentId);
    if (
      polled?.status === "successful" ||
      polled?.status === "failed" ||
      polled?.status === "closed" ||
      polled?.status === "cancelled"
    ) {
      return polled;
    }
    await new Promise((r) => setTimeout(r, SAME_TERMINAL_POLL_INTERVAL_MS));
  }
  return null;
}

function formatLastUsed(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "recently";
  const diff = Math.max(0, Date.now() - ms);
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  return `${months}mo ago`;
}

interface PayCloudPaymentSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Charge amount in major currency units (e.g. ZAR rands). */
  amount: number;
  currency?: string;
  entityType: PayCloudEntityType;
  entityId: string;
  bookingId?: string;
  saleId?: string;
  groupBookingId?: string;
  bookingLocationId?: string | null;
  onPaymentSuccess: (result: PayCloudPaymentResult) => void;
}

export function PayCloudPaymentSheet({
  visible,
  onClose,
  amount,
  currency = getTenantDefaultCurrency(),
  entityType,
  entityId,
  bookingId,
  saleId,
  groupBookingId,
  bookingLocationId,
  onPaymentSuccess,
}: PayCloudPaymentSheetProps) {
  const router = useRouter();
  const paycloudEnabled = useFeatureFlag("payment_paycloud");
  const sameTerminalFlag = useFeatureFlag("payment_paycloud_same_terminal");
  const {
    terminals,
    acceptPaycloud,
    qrPaymentsEnabled,
    cashbackEnabled,
    loading: terminalsLoading,
    error: terminalsError,
    reload: reloadTerminals,
  } = usePayCloudTerminals();
  const { settings, reload: reloadSettings } = usePayCloudSettings();
  const { createPayment, closePayment, voidPayment, confirmPayment, pollPayment, processing } =
    usePayCloudPayment();

  const [selectedTerminal, setSelectedTerminal] = useState<PayCloudTerminal | null>(null);
  const [payOnThisDevice, setPayOnThisDevice] = useState(false);
  const [sameDeviceAvailable, setSameDeviceAvailable] = useState(false);
  const [tipAmount, setTipAmount] = useState("");
  const [cashbackAmount, setCashbackAmount] = useState("");
  const [payMethod, setPayMethod] = useState<"card" | "qr">("card");
  const [inFlightPaymentId, setInFlightPaymentId] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<PayCloudPaymentResult | null>(null);
  const [reviewResult, setReviewResult] = useState<PayCloudPaymentResult | null>(null);
  const [voiding, setVoiding] = useState(false);
  const [resumingInFlight, setResumingInFlight] = useState(false);
  const closingRef = useRef(false);

  const activeTerminals = terminals.filter((t) => t.is_active);
  const qrEnabled = qrPaymentsEnabled || settings?.qr_payments_enabled === true;
  const cashbackOn =
    cashbackEnabled ||
    settings?.cashback_enabled === true;
  const isReady = acceptPaycloud || settings?.accept_paycloud === true;
  const loading = terminalsLoading;

  useEffect(() => {
    if (!visible || !paycloudEnabled) return;
    void reloadTerminals();
    void reloadSettings();
    setTipAmount("");
    setCashbackAmount("");
    setPayMethod("card");
    setInFlightPaymentId(null);
    setSuccessResult(null);
    setReviewResult(null);
    setVoiding(false);
    setResumingInFlight(false);
    setPayOnThisDevice(false);
    closingRef.current = false;
    if (sameTerminalFlag) {
      void canLaunchPaycloudSameTerminal().then((ok) => {
        setSameDeviceAvailable(ok);
        if (ok) setPayOnThisDevice(true);
      });
    } else {
      setSameDeviceAvailable(false);
    }
  }, [visible, paycloudEnabled, sameTerminalFlag, reloadTerminals, reloadSettings]);

  const isMobileBooking = !bookingLocationId;

  useEffect(() => {
    if (!selectedTerminal && activeTerminals.length > 0) {
      const sortedByRecency = [...activeTerminals].sort((a, b) => {
        const ta = a.last_used ? Date.parse(a.last_used) : 0;
        const tb = b.last_used ? Date.parse(b.last_used) : 0;
        return tb - ta;
      });
      const portable = sortedByRecency.find((t) => t.location_id == null);
      const locationMatch = bookingLocationId
        ? sortedByRecency.find((t) => t.location_id === bookingLocationId)
        : undefined;
      const preferred = isMobileBooking
        ? (portable ?? sortedByRecency[0])
        : (locationMatch ?? portable ?? sortedByRecency[0]);
      setSelectedTerminal(preferred);
      return;
    }
    if (selectedTerminal && !activeTerminals.some((t) => t.id === selectedTerminal.id)) {
      setSelectedTerminal(activeTerminals.length > 0 ? activeTerminals[0] : null);
    }
  }, [selectedTerminal, activeTerminals, bookingLocationId, isMobileBooking]);

  useEffect(() => {
    if (!visible || !selectedTerminal?.in_flight_payment_id) return;
    setInFlightPaymentId(selectedTerminal.in_flight_payment_id);
  }, [visible, selectedTerminal?.id, selectedTerminal?.in_flight_payment_id]);

  /**
   * Route a terminal-confirmed capture to the right outcome. An "under" or
   * "mismatch" capture is real money on the machine that did NOT settle to the
   * entity — showing plain success would leave staff believing the balance is
   * cleared, so it gets a dedicated review state and never fires
   * onPaymentSuccess.
   */
  const handleSettledSuccess = useCallback(
    (result: PayCloudPaymentResult) => {
      setInFlightPaymentId(null);
      if (isPaycloudCaptureUnderReview(result)) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        setReviewResult(result);
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSuccessResult(result);
      onPaymentSuccess(result);
    },
    [onPaymentSuccess],
  );

  const handleResumeInFlight = useCallback(async () => {
    const paymentId = inFlightPaymentId ?? selectedTerminal?.in_flight_payment_id;
    if (!paymentId) return;
    setResumingInFlight(true);
    try {
      const settled = await pollSameTerminalSettlement(paymentId, confirmPayment, pollPayment);
      if (settled?.status === "successful") {
        handleSettledSuccess(settled);
        return;
      }
      if (settled?.status === "failed" || settled?.status === "cancelled" || settled?.status === "closed") {
        setInFlightPaymentId(null);
        Alert.alert(
          "Payment not completed",
          settled.error_message || "The in-progress payment did not complete. You can start a new charge.",
        );
        return;
      }
      Alert.alert(
        "Still waiting",
        "The payment is still processing. Try again in a moment or cancel and start fresh.",
      );
    } finally {
      setResumingInFlight(false);
    }
  }, [
    inFlightPaymentId,
    selectedTerminal?.in_flight_payment_id,
    confirmPayment,
    pollPayment,
    handleSettledSuccess,
  ]);

  const parsedTip = (() => {
    const trimmed = tipAmount.trim();
    if (!trimmed) return 0;
    const n = Number.parseFloat(trimmed.replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  })();

  const parsedCashback = (() => {
    const trimmed = cashbackAmount.trim();
    if (!trimmed) return 0;
    const n = Number.parseFloat(trimmed.replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  })();

  const totalAmount = amount + parsedTip;
  const displayAmount = formatCurrency(totalAmount, currency);
  const baseDisplay = formatCurrency(amount, currency);

  const handleClose = useCallback(async () => {
    if (closingRef.current) return;
    closingRef.current = true;
    // A review-state capture already completed on the machine — never close it,
    // that would try to cancel money that was actually taken.
    if (inFlightPaymentId && !successResult && !reviewResult) {
      await closePayment(inFlightPaymentId);
      setInFlightPaymentId(null);
    }
    setSuccessResult(null);
    setReviewResult(null);
    onClose();
  }, [inFlightPaymentId, successResult, reviewResult, closePayment, onClose]);

  const handleVoidOnTerminal = useCallback(async () => {
    const completed = successResult ?? reviewResult;
    const paymentId = completed?.id || completed?.payment_id;
    if (!paymentId) return;
    setVoiding(true);
    try {
      const voidRow = await voidPayment(paymentId);
      if (voidRow && (voidRow.status === "processing" || voidRow.status === "successful")) {
        Alert.alert("Void sent", "Follow the prompts on the card machine to complete the void.");
      }
    } finally {
      setVoiding(false);
    }
  }, [successResult, reviewResult, voidPayment]);

  const handleProcess = useCallback(async () => {
    if (!selectedTerminal) {
      Alert.alert("Select a card machine", "Choose which card machine should take this payment.");
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const trySameDevice = payOnThisDevice && sameDeviceAvailable && payMethod === "card";
    const channel: "cloud" | "same_terminal" = trySameDevice ? "same_terminal" : "cloud";
    const deviceSerial = trySameDevice ? await getPaycloudDeviceSerial() : null;

    const result = await createPayment({
      terminal_id: selectedTerminal.id,
      entity_type: entityType,
      entity_id: entityId,
      amount,
      tip_amount: parsedTip > 0 ? parsedTip : undefined,
      cashback_amount: parsedCashback > 0 ? parsedCashback : undefined,
      pay_method: payMethod,
      currency,
      booking_id: bookingId ?? (entityType === "booking" ? entityId : null),
      sale_id: saleId ?? (entityType === "sale" ? entityId : null),
      group_booking_id:
        groupBookingId ?? (entityType === "group_booking" ? entityId : null),
      channel,
      ...(deviceSerial ? { device_serial: deviceSerial } : {}),
    });

    if (!result) return;

    const paymentId = result.id || result.payment_id;
    if (paymentId) setInFlightPaymentId(paymentId);

    if (channel === "same_terminal" && result.intent_payload) {
      const intentResult = await startPaycloudSameTerminalSale(result.intent_payload);
      if (!intentResult.success) {
        if (paymentId) await closePayment(paymentId);
        setInFlightPaymentId(null);
        Alert.alert(
          "Pay on this device unavailable",
          intentResult.message || "Sending to your card machine instead.",
        );
        const cloudRetry = await createPayment({
          terminal_id: selectedTerminal.id,
          entity_type: entityType,
          entity_id: entityId,
          amount,
          tip_amount: parsedTip > 0 ? parsedTip : undefined,
          cashback_amount: parsedCashback > 0 ? parsedCashback : undefined,
          pay_method: payMethod,
          currency,
          booking_id: bookingId ?? (entityType === "booking" ? entityId : null),
          sale_id: saleId ?? (entityType === "sale" ? entityId : null),
          group_booking_id:
            groupBookingId ?? (entityType === "group_booking" ? entityId : null),
          channel: "cloud",
        });
        if (!cloudRetry) return;
        if (cloudRetry.status === "successful") {
          handleSettledSuccess(cloudRetry);
        }
        return;
      }

      if (paymentId) {
        const settled = await pollSameTerminalSettlement(paymentId, confirmPayment, pollPayment);
        if (settled?.status === "successful") {
          handleSettledSuccess(settled);
          return;
        }
        if (settled?.status === "failed" || settled?.status === "cancelled") {
          setInFlightPaymentId(null);
          Alert.alert(
            "Payment failed",
            settled.error_message || "The card payment didn't go through on this device.",
          );
          return;
        }
      }
      Alert.alert(
        "Waiting for confirmation",
        "Payment started on this device. Tap Resume if it doesn't update automatically.",
      );
      return;
    }

    if (result) {
      if (result.status === "successful") {
        handleSettledSuccess(result);
      } else if (result.status === "failed") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setInFlightPaymentId(null);
        Alert.alert(
          "Payment failed",
          result.error_message || "The card payment didn't go through. Please try again.",
        );
      } else if (
        result.status === "pending" ||
        result.status === "processing"
      ) {
        Alert.alert(
          "Waiting on card machine",
          `Ask the customer to complete payment on ${selectedTerminal.name}.`,
        );
      }
    }
  }, [
    selectedTerminal,
    payOnThisDevice,
    sameDeviceAvailable,
    amount,
    parsedTip,
    parsedCashback,
    payMethod,
    currency,
    entityType,
    entityId,
    bookingId,
    saleId,
    groupBookingId,
    createPayment,
    closePayment,
    confirmPayment,
    pollPayment,
    handleSettledSuccess,
  ]);

  if (!paycloudEnabled) {
    return null;
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={handleClose}
      title="Beautonomi card machine"
      subtitle={`Charge ${displayAmount} on your card machine`}
      snapHeight="half"
    >
      {successResult ? (
        <View>
          <View style={twStyle("mb-4 items-center rounded-2xl border border-emerald-200 bg-emerald-50 py-6")}>
            <Ionicons name="checkmark-circle" size={40} color="#059669" />
            <Text style={twStyle("mt-2 text-base font-semibold text-emerald-900")}>
              Payment successful
            </Text>
            <Text style={twStyle("mt-1 text-sm text-emerald-800")}>
              {formatCurrency(Number(successResult.amount ?? amount), currency)} received
            </Text>
          </View>
          <ActionButton
            label={voiding ? "Sending void…" : "Void on card machine"}
            onPress={() => void handleVoidOnTerminal()}
            loading={voiding}
            variant="outline"
            fullWidth
          />
          <View style={twStyle("mt-2")}>
            <ActionButton label="Done" onPress={() => void handleClose()} fullWidth />
          </View>
        </View>
      ) : reviewResult ? (
        <View>
          <View style={twStyle("mb-4 items-center rounded-2xl border border-amber-200 bg-amber-50 py-6 px-4")}>
            <Ionicons name="alert-circle" size={40} color="#d97706" />
            <Text style={twStyle("mt-2 text-base font-semibold text-amber-900")}>
              Payment needs review
            </Text>
            <Text style={twStyle("mt-1 text-sm text-amber-800")}>
              {formatCurrency(Number(reviewResult.amount ?? 0), currency)} captured
              {typeof reviewResult.expected_amount === "number"
                ? ` · ${formatCurrency(reviewResult.expected_amount, currency)} was due`
                : ""}
            </Text>
            <Text style={twStyle("mt-2 text-xs text-center text-amber-800")}>
              The card machine took a different amount than the balance due, so it was
              not applied to this charge automatically. It has been flagged for
              review — the balance still shows as owing until it is resolved.
            </Text>
          </View>
          <ActionButton
            label={voiding ? "Sending void…" : "Void on card machine"}
            onPress={() => void handleVoidOnTerminal()}
            loading={voiding}
            variant="outline"
            fullWidth
          />
          <View style={twStyle("mt-2")}>
            <TouchableOpacity
              onPress={() => {
                void handleClose();
                router.push("/(app)/(tabs)/more/card-machines" as never);
              }}
              style={twStyle("items-center rounded-xl border border-amber-300 bg-white py-3")}
              accessibilityRole="button"
              accessibilityLabel="Open card machines to review"
            >
              <Text style={twStyle("text-sm font-semibold text-amber-800")}>
                Review in Card machines
              </Text>
            </TouchableOpacity>
          </View>
          <View style={twStyle("mt-2")}>
            <ActionButton label="Done" onPress={() => void handleClose()} fullWidth />
          </View>
        </View>
      ) : (
      <>
      <View style={twStyle("mb-4 items-center rounded-2xl bg-gray-50 py-6")}>
        <Text style={twStyle("text-sm text-gray-500")}>Amount to charge</Text>
        <Text style={twStyle("mt-1 text-3xl font-bold text-gray-900")}>{displayAmount}</Text>
        {parsedTip > 0 ? (
          <Text style={twStyle("mt-1 text-xs text-gray-500")}>
            {baseDisplay} + {formatCurrency(parsedTip, currency)} tip
            {parsedCashback > 0 ? ` + ${formatCurrency(parsedCashback, currency)} cashback` : ""}
          </Text>
        ) : parsedCashback > 0 ? (
          <Text style={twStyle("mt-1 text-xs text-gray-500")}>
            {baseDisplay} + {formatCurrency(parsedCashback, currency)} cashback
          </Text>
        ) : null}
      </View>

      <View style={twStyle("mb-4")}>
        <Text style={twStyle("mb-1.5 text-sm font-medium text-gray-700")}>
          Tip (optional)
        </Text>
        <TextInput
          style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900")}
          value={tipAmount}
          onChangeText={setTipAmount}
          placeholder="0.00"
          placeholderTextColor="#9ca3af"
          keyboardType="decimal-pad"
          accessibilityLabel="Tip amount"
        />
      </View>

      {cashbackOn ? (
        <View style={twStyle("mb-4")}>
          <Text style={twStyle("mb-1.5 text-sm font-medium text-gray-700")}>
            Cashback (optional)
          </Text>
          <TextInput
            style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900")}
            value={cashbackAmount}
            onChangeText={setCashbackAmount}
            placeholder="0.00"
            placeholderTextColor="#9ca3af"
            keyboardType="decimal-pad"
            accessibilityLabel="Cashback amount"
          />
        </View>
      ) : null}

      {qrEnabled ? (
        <View style={twStyle("mb-4")}>
          <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>Payment method</Text>
          <View style={twStyle("flex-row")}>
            {(
              [
                { value: "card" as const, label: "Card", icon: "card-outline" as const },
                { value: "qr" as const, label: "Wallet QR", icon: "qr-code-outline" as const },
              ] as const
            ).map((option) => {
              const selected = payMethod === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  onPress={() => setPayMethod(option.value)}
                  style={[
                    twStyle(`mr-2 flex-1 flex-row items-center justify-center rounded-xl border py-2.5 ${
                      selected ? "border-indigo-500 bg-indigo-50" : "border-gray-200 bg-white"
                    }`),
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                >
                  <Ionicons
                    name={option.icon}
                    size={18}
                    color={selected ? "#6366f1" : "#6b7280"}
                  />
                  <Text
                    style={twStyle(`ml-2 text-sm font-medium ${
                      selected ? "text-indigo-700" : "text-gray-600"
                    }`)}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ) : null}

      {sameDeviceAvailable && payMethod === "card" ? (
        <View style={twStyle("mb-4")}>
          <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>Where to pay</Text>
          <View style={twStyle("flex-row")}>
            {(
              [
                { value: true, label: "Pay on this device" },
                { value: false, label: "Send to card machine" },
              ] as const
            ).map((option) => {
              const selected = payOnThisDevice === option.value;
              return (
                <TouchableOpacity
                  key={option.label}
                  onPress={() => setPayOnThisDevice(option.value)}
                  style={twStyle(`mr-2 flex-1 rounded-xl border py-2.5 ${
                    selected ? "border-indigo-500 bg-indigo-50" : "border-gray-200 bg-white"
                  }`)}
                >
                  <Text
                    style={twStyle(`text-center text-sm font-medium ${
                      selected ? "text-indigo-700" : "text-gray-600"
                    }`)}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ) : null}

      <Text style={twStyle("mb-2 text-sm font-semibold text-gray-700")}>
        {payOnThisDevice && sameDeviceAvailable ? "Linked card machine" : "Select card machine"}
      </Text>
      {loading ? (
        <View style={twStyle("items-center py-8")}>
          <ActivityIndicator size="small" color="#6366f1" />
          <Text style={twStyle("mt-2 text-xs text-gray-500")}>Loading…</Text>
        </View>
      ) : !isReady ? (
        <View style={twStyle("items-center rounded-2xl border border-amber-200 bg-amber-50 py-8 px-4")}>
          <Ionicons name="link-outline" size={32} color="#d97706" />
          <Text style={twStyle("mt-2 text-sm font-medium text-amber-800")}>
            In-person card payments are off
          </Text>
          <Text style={twStyle("mt-1 text-xs text-center text-amber-700")}>
            Turn on Accept in-person card payments in Card machines settings.
          </Text>
          <TouchableOpacity
            onPress={() => {
              void handleClose();
              router.push("/(app)/(tabs)/more/card-machines" as never);
            }}
            style={twStyle("mt-3 rounded-xl bg-amber-600 px-4 py-2")}
            accessibilityRole="button"
            accessibilityLabel="Open card machines settings"
          >
            <Text style={twStyle("text-xs font-semibold text-white")}>Open Card machines</Text>
          </TouchableOpacity>
        </View>
      ) : activeTerminals.length === 0 ? (
        <View style={twStyle("items-center rounded-2xl border border-dashed border-gray-200 py-8 px-4")}>
          <Ionicons name="hardware-chip-outline" size={32} color="#9ca3af" />
          <Text style={twStyle("mt-2 text-sm text-gray-500")}>
            {terminals.length > 0 ? "No active card machines" : "No card machines set up yet"}
          </Text>
          <Text style={twStyle("mt-1 text-xs text-gray-400 text-center")}>
            Add a machine in Card machines settings.
          </Text>
          <TouchableOpacity
            onPress={() => {
              void handleClose();
              router.push("/(app)/(tabs)/more/card-machines" as never);
            }}
            style={twStyle("mt-3 rounded-xl bg-indigo-600 px-4 py-2")}
            accessibilityRole="button"
            accessibilityLabel="Manage card machines"
          >
            <Text style={twStyle("text-xs font-semibold text-white")}>Add a card machine</Text>
          </TouchableOpacity>
          {terminalsError ? (
            <Text style={twStyle("mt-2 text-center text-xs text-rose-600")}>{terminalsError}</Text>
          ) : null}
        </View>
      ) : (
        <View style={twStyle("mb-6")}>
          {(inFlightPaymentId || selectedTerminal?.in_flight_payment_id) && !successResult ? (
            <View style={twStyle("mb-3 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-3")}>
              <Text style={twStyle("text-sm font-medium text-indigo-900")}>
                Payment in progress on this card machine
              </Text>
              <Text style={twStyle("mt-1 text-xs text-indigo-800")}>
                A charge may still be completing. Resume to check status without starting a duplicate.
              </Text>
              <TouchableOpacity
                onPress={() => void handleResumeInFlight()}
                style={twStyle("mt-2 self-start rounded-lg bg-indigo-600 px-3 py-2")}
                disabled={resumingInFlight}
              >
                <Text style={twStyle("text-xs font-semibold text-white")}>
                  {resumingInFlight ? "Checking…" : "Resume payment"}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {(() => {
            const hasPortable = activeTerminals.some((t) => t.location_id == null);
            const hasExactMatch =
              !!bookingLocationId &&
              activeTerminals.some((t) => t.location_id === bookingLocationId);
            if (isMobileBooking) {
              if (hasPortable) {
                return (
                  <View style={twStyle("mb-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2")}>
                    <Text style={twStyle("text-xs text-emerald-800")}>
                      Mobile booking · using your portable card machine.
                    </Text>
                  </View>
                );
              }
              return (
                <View style={twStyle("mb-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2")}>
                  <Text style={twStyle("text-xs text-amber-800")}>
                    Mobile booking · set a machine to &quot;All Locations&quot; for on-site work.
                  </Text>
                </View>
              );
            }
            if (!hasExactMatch && !hasPortable) {
              return (
                <View style={twStyle("mb-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2")}>
                  <Text style={twStyle("text-xs text-amber-800")}>
                    No active machine is assigned to this location. The selected card machine will still take the payment.
                  </Text>
                </View>
              );
            }
            if (!hasExactMatch && hasPortable) {
              return (
                <View style={twStyle("mb-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2")}>
                  <Text style={twStyle("text-xs text-indigo-800")}>
                    Using your portable machine — none assigned to this salon yet.
                  </Text>
                </View>
              );
            }
            return null;
          })()}
          {activeTerminals.map((terminal, idx) => {
            const isSelected = selectedTerminal?.id === terminal.id;
            const matchesBookingLocation =
              !!bookingLocationId && terminal.location_id === bookingLocationId;
            const isPortable = terminal.location_id == null;
            const lastUsedLabel = terminal.last_used
              ? `Last used ${formatLastUsed(terminal.last_used)}`
              : "Never used yet";
            return (
              <TouchableOpacity
                key={terminal.id}
                onPress={() => setSelectedTerminal(terminal)}
                style={[
                  twStyle(`flex-row items-center rounded-xl border p-3 ${
                    isSelected ? "border-indigo-500 bg-indigo-50" : "border-gray-200 bg-white"
                  }`),
                  idx > 0 ? { marginTop: 8 } : undefined,
                ]}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`${terminal.name} card machine`}
              >
                <View
                  style={twStyle(`h-10 w-10 items-center justify-center rounded-lg ${
                    isSelected ? "bg-indigo-100" : "bg-gray-100"
                  }`)}
                >
                  <Ionicons
                    name="hardware-chip-outline"
                    size={20}
                    color={isSelected ? "#6366f1" : "#6b7280"}
                  />
                </View>
                <View style={twStyle("ml-3 flex-1")}>
                  <View style={twStyle("flex-row flex-wrap items-center")}>
                    <Text
                      style={twStyle(`text-sm font-medium ${
                        isSelected ? "text-indigo-700" : "text-gray-900"
                      }`)}
                    >
                      {terminal.name}
                    </Text>
                    {matchesBookingLocation ? (
                      <View style={twStyle("ml-2 rounded-full bg-emerald-100 px-2 py-0.5")}>
                        <Text style={twStyle("text-[10px] font-semibold text-emerald-700")}>
                          this location
                        </Text>
                      </View>
                    ) : null}
                    {isPortable ? (
                      <View style={twStyle("ml-2 rounded-full bg-indigo-100 px-2 py-0.5")}>
                        <Text style={twStyle("text-[10px] font-semibold text-indigo-700")}>
                          Portable
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={twStyle("text-xs text-gray-500")}>
                    {terminal.terminal_sn ? `Serial ${terminal.terminal_sn}` : "Card machine"}
                    {terminal.location_name
                      ? ` · ${terminal.location_name}`
                      : isPortable
                        ? " · All locations"
                        : ""}
                  </Text>
                  <Text style={twStyle("text-[11px] text-gray-400")}>
                    {lastUsedLabel}
                    {terminal.total_transactions > 0
                      ? ` · ${terminal.total_transactions} payment${terminal.total_transactions === 1 ? "" : "s"}`
                      : ""}
                  </Text>
                </View>
                {isSelected ? (
                  <Ionicons name="checkmark-circle" size={22} color="#6366f1" />
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <ActionButton
        label={
          processing
            ? "Waiting on card machine…"
            : payOnThisDevice && sameDeviceAvailable
              ? `Pay ${displayAmount} on this device`
              : `Send ${displayAmount} to card machine`
        }
        onPress={handleProcess}
        loading={processing}
        disabled={
          !selectedTerminal ||
          processing ||
          activeTerminals.length === 0 ||
          !isReady ||
          totalAmount <= 0
        }
        fullWidth
      />
      </>
      )}
    </BottomSheet>
  );
}
