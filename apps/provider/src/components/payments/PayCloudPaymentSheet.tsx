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
  AppState,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { PaycloudCollectSetupAffordance } from "@/components/payments/PaycloudCollectSetupAffordance";
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
import { usePaycloudFeatureEnabled } from "@/hooks/usePaycloudFeatureEnabled";
import { useTranslation } from "@beautonomi/i18n";
import {
  canLaunchPaycloudSameTerminal,
  getPaycloudDeviceInfo,
  humanizePaycloudIntentResult,
  isPaycloudIntentApproved,
  parsePaycloudIntentTransData,
  startPaycloudSameTerminalSale,
  type PaycloudDeviceInfo,
  type PaycloudIntentResult,
} from "@/lib/paycloud-same-terminal";

type TranslateFn = (key: string, opts?: Record<string, unknown>) => string;

const SAME_TERMINAL_POLL_INTERVAL_MS = 3000;
const SAME_TERMINAL_POLL_TIMEOUT_MS = 2 * 60 * 1000;
const KEEP_AWAKE_TAG = "paycloud-payment-sheet";

type SameTerminalStep = "idle" | "opening" | "on_device" | "confirming";

async function pollSameTerminalSettlement(
  paymentId: string,
  confirmPayment: (
    id: string,
    options?: {
      intent_result?: {
        result?: string;
        resultMsg?: string;
        transData?: string | Record<string, unknown>;
      };
      device_model?: string;
      device_manufacturer?: string;
      serial_source?: "build_serial" | "wiseasy_property" | "android_id";
    },
  ) => Promise<PayCloudPaymentResult | null>,
  pollPayment: (id: string) => Promise<PayCloudPaymentResult | null>,
  intentResult?: PaycloudIntentResult | null,
  deviceInfo?: PaycloudDeviceInfo | null,
): Promise<PayCloudPaymentResult | null> {
  const confirmOptions = {
    ...(intentResult
      ? {
          intent_result: {
            result: intentResult.result,
            resultMsg: intentResult.resultMsg,
            transData:
              typeof intentResult.transData === "string"
                ? intentResult.transData
                : intentResult.transData,
          },
        }
      : {}),
    ...(deviceInfo?.model ? { device_model: deviceInfo.model } : {}),
    ...(deviceInfo?.manufacturer ? { device_manufacturer: deviceInfo.manufacturer } : {}),
    ...(deviceInfo?.serialSource ? { serial_source: deviceInfo.serialSource } : {}),
  };

  if (intentResult) {
    await confirmPayment(paymentId, confirmOptions);
  }

  const deadline = Date.now() + SAME_TERMINAL_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await confirmPayment(paymentId, confirmOptions);
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

function formatLastUsed(iso: string, pc: TranslateFn): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return pc("lastUsedRecent");
  const diff = Math.max(0, Date.now() - ms);
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return pc("lastUsedJustNow");
  if (mins < 60) return pc("lastUsedMinutes", { count: mins });
  const hours = Math.round(mins / 60);
  if (hours < 24) return pc("lastUsedHours", { count: hours });
  const days = Math.round(hours / 24);
  if (days < 30) return pc("lastUsedDays", { count: days });
  const months = Math.round(days / 30);
  return pc("lastUsedMonths", { count: months });
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
  /**
   * Set when `amount` already includes a tip captured upstream (e.g. the POS tip
   * field). Hides this sheet's tip input so staff cannot tip a second time.
   */
  tipIncludedInAmount?: boolean;
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
  tipIncludedInAmount = false,
  onPaymentSuccess,
}: PayCloudPaymentSheetProps) {
  const { t } = useTranslation();
  const pc = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(`provider.mobile.screens.payCloudPaymentSheet.${key}`, opts) as string,
    [t],
  );
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const isCompactLayout = windowWidth < 400;
  const paycloudEnabled = usePaycloudFeatureEnabled();
  const sameTerminalFlag = useFeatureFlag("payment_paycloud_same_terminal");
  const qrFlagEnabled = useFeatureFlag("payment_paycloud_qr");
  const cashbackFlagEnabled = useFeatureFlag("payment_paycloud_cashback");
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
  const [sameTerminalStep, setSameTerminalStep] = useState<SameTerminalStep>("idle");
  const [deviceInfo, setDeviceInfo] = useState<PaycloudDeviceInfo | null>(null);
  const [maskedCard, setMaskedCard] = useState<string | null>(null);
  const closingRef = useRef(false);
  const keepAwakeActiveRef = useRef(false);
  // Lets the failure alert re-run a charge without a circular useCallback dependency.
  const handleProcessRef = useRef<(() => Promise<void>) | null>(null);
  const handleResumeInFlightRef = useRef<(() => Promise<void>) | null>(null);

  const activeTerminals = terminals.filter((t) => t.is_active);
  const chargeableTerminals = activeTerminals.filter((t) => t.merchant != null);
  const primaryBlocker = settings?.blockers?.[0] ?? null;
  const isSandboxMachine = selectedTerminal?.merchant?.environment === "sandbox";
  // Platform flag AND provider setting (same as web PayCloudPaymentDialog).
  const qrEnabled =
    qrFlagEnabled && (qrPaymentsEnabled || settings?.qr_payments_enabled === true);
  const cashbackOn =
    cashbackFlagEnabled && (cashbackEnabled || settings?.cashback_enabled === true);
  const isReady = acceptPaycloud || settings?.accept_paycloud === true;
  const loading = terminalsLoading;

  const setKeepAwake = useCallback(async (active: boolean) => {
    if (active && !keepAwakeActiveRef.current) {
      keepAwakeActiveRef.current = true;
      await activateKeepAwakeAsync(KEEP_AWAKE_TAG);
    } else if (!active && keepAwakeActiveRef.current) {
      keepAwakeActiveRef.current = false;
      await deactivateKeepAwake(KEEP_AWAKE_TAG);
    }
  }, []);

  useEffect(() => {
    return () => {
      void setKeepAwake(false);
    };
  }, [setKeepAwake]);

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
    setSameTerminalStep("idle");
    setDeviceInfo(null);
    setMaskedCard(null);
    closingRef.current = false;
    void setKeepAwake(false);
    if (sameTerminalFlag) {
      void canLaunchPaycloudSameTerminal().then(async (ok) => {
        setSameDeviceAvailable(ok);
        if (ok) {
          setPayOnThisDevice(true);
          const info = await getPaycloudDeviceInfo();
          setDeviceInfo(info);
        }
      });
    } else {
      setSameDeviceAvailable(false);
    }
  }, [visible, paycloudEnabled, sameTerminalFlag, reloadTerminals, reloadSettings, setKeepAwake]);

  const isMobileBooking = !bookingLocationId;

  useEffect(() => {
    if (!selectedTerminal && chargeableTerminals.length > 0) {
      const sortedByRecency = [...chargeableTerminals].sort((a, b) => {
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
    if (
      selectedTerminal &&
      !chargeableTerminals.some((t) => t.id === selectedTerminal.id)
    ) {
      setSelectedTerminal(chargeableTerminals.length > 0 ? chargeableTerminals[0] : null);
    }
  }, [selectedTerminal, chargeableTerminals, bookingLocationId, isMobileBooking]);

  useEffect(() => {
    if (!visible || !selectedTerminal?.in_flight_payment_id) return;
    setInFlightPaymentId(selectedTerminal.in_flight_payment_id);
  }, [visible, selectedTerminal?.id, selectedTerminal?.in_flight_payment_id]);

  const isSameDeviceMode = payOnThisDevice && sameDeviceAvailable && payMethod === "card";
  const deviceSerialNorm = deviceInfo?.serial ? deviceInfo.serial.trim().toLowerCase() : null;
  /**
   * The machine record this physical device is allowed to charge on. The server
   * rejects a same-device charge against any other record
   * (DEVICE_TERMINAL_MISMATCH), so the picker must not offer them.
   */
  const deviceMatchedTerminal = deviceSerialNorm
    ? (activeTerminals.find((t) => {
        const sn = t.terminal_sn?.trim().toLowerCase();
        const paired = t.paired_device_id?.trim().toLowerCase();
        return sn === deviceSerialNorm || (paired != null && paired === deviceSerialNorm);
      }) ?? null)
    : null;

  useEffect(() => {
    if (!isSameDeviceMode || !deviceMatchedTerminal) return;
    setSelectedTerminal((prev) =>
      prev?.id === deviceMatchedTerminal.id ? prev : deviceMatchedTerminal,
    );
  }, [isSameDeviceMode, deviceMatchedTerminal]);

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

  // Recover pending same-terminal payments after app-switch to WiseCashier.
  useEffect(() => {
    if (!visible) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      const paymentId = inFlightPaymentId ?? selectedTerminal?.in_flight_payment_id;
      if (!paymentId || successResult || reviewResult) return;
      void (async () => {
        setSameTerminalStep("confirming");
        await setKeepAwake(true);
        const settled = await pollSameTerminalSettlement(
          paymentId,
          confirmPayment,
          pollPayment,
          null,
          deviceInfo,
        );
        await setKeepAwake(false);
        setSameTerminalStep("idle");
        if (settled?.status === "successful") {
          handleSettledSuccess(settled);
        }
      })();
    });
    return () => sub.remove();
  }, [
    visible,
    inFlightPaymentId,
    selectedTerminal?.in_flight_payment_id,
    successResult,
    reviewResult,
    confirmPayment,
    pollPayment,
    deviceInfo,
    setKeepAwake,
    handleSettledSuccess,
  ]);

  // Cloud mode: poll while the charge sheet is open (createPayment returns after push).
  useEffect(() => {
    if (!visible || isSameDeviceMode || sameTerminalStep !== "idle") return;
    const paymentId = inFlightPaymentId ?? selectedTerminal?.in_flight_payment_id;
    if (!paymentId || successResult || reviewResult) return;

    let cancelled = false;
    const deadline = Date.now() + SAME_TERMINAL_POLL_TIMEOUT_MS;

    void (async () => {
      await setKeepAwake(true);
      while (!cancelled && Date.now() < deadline) {
        const polled = await pollPayment(paymentId);
        if (
          polled?.status === "successful" ||
          polled?.status === "failed" ||
          polled?.status === "closed" ||
          polled?.status === "cancelled"
        ) {
          await setKeepAwake(false);
          if (cancelled) return;
          if (polled.status === "successful") {
            handleSettledSuccess(polled);
          } else {
            setInFlightPaymentId(null);
            Alert.alert(
              pc("paymentFailedTitle"),
              polled.error_message || pc("paymentFailedBody"),
            );
          }
          return;
        }
        await new Promise((r) => setTimeout(r, SAME_TERMINAL_POLL_INTERVAL_MS));
      }
      await setKeepAwake(false);
      if (!cancelled) {
        Alert.alert(
          pc("stillWaitingTitle"),
          pc("stillWaitingBody"),
          [
            { text: pc("keepWaiting"), style: "cancel" },
            { text: pc("resume"), onPress: () => void handleResumeInFlightRef.current?.() },
            {
              text: pc("cancelCharge"),
              style: "destructive",
              onPress: () => {
                if (paymentId) void closePayment(paymentId);
                setInFlightPaymentId(null);
              },
            },
          ],
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    visible,
    isSameDeviceMode,
    sameTerminalStep,
    inFlightPaymentId,
    selectedTerminal?.in_flight_payment_id,
    successResult,
    reviewResult,
    pollPayment,
    handleSettledSuccess,
    setKeepAwake,
    closePayment,
  ]);

  const handleResumeInFlight = useCallback(async () => {
    const paymentId = inFlightPaymentId ?? selectedTerminal?.in_flight_payment_id;
    if (!paymentId) return;
    setResumingInFlight(true);
    try {
      const settled = await pollSameTerminalSettlement(
        paymentId,
        confirmPayment,
        pollPayment,
        null,
        deviceInfo,
      );
      if (settled?.status === "successful") {
        handleSettledSuccess(settled);
        return;
      }
      if (settled?.status === "failed" || settled?.status === "cancelled" || settled?.status === "closed") {
        setInFlightPaymentId(null);
        Alert.alert(
          pc("paymentNotCompletedTitle"),
          settled.error_message || pc("paymentNotCompletedBody"),
        );
        return;
      }
      Alert.alert(
        pc("stillWaitingShortTitle"),
        pc("stillWaitingShortBody"),
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
    deviceInfo,
  ]);

  handleResumeInFlightRef.current = handleResumeInFlight;

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

  // Cashback is handed to the client in cash and recovered on the card, so it is
  // part of what the card is actually charged — the headline must include it.
  const totalAmount = amount + parsedTip + parsedCashback;
  const displayAmount = formatCurrency(totalAmount, currency);
  const baseDisplay = formatCurrency(amount, currency);

  const handleClose = useCallback(async () => {
    if (closingRef.current) return;
    closingRef.current = true;
    // A review-state capture already completed on the machine — never close it,
    // that would try to cancel money that was actually taken.
    const stillOpenPaymentId =
      inFlightPaymentId && !successResult && !reviewResult ? inFlightPaymentId : null;
    setSuccessResult(null);
    setReviewResult(null);
    setSameTerminalStep("idle");
    void setKeepAwake(false);
    onClose();

    // The sheet dismisses on a backdrop tap, swipe or hardware back, any of which
    // can happen by accident while the client is still paying. Cancelling the
    // charge is destructive (and may target one that actually succeeded but
    // hasn't confirmed yet), so it must be an explicit choice.
    if (stillOpenPaymentId) {
      Alert.alert(
        pc("chargeStillOpenTitle"),
        pc("chargeStillOpenBody"),
        [
          { text: pc("keepItOpen"), style: "cancel" },
          {
            text: pc("cancelTheCharge"),
            style: "destructive",
            onPress: () => {
              void closePayment(stillOpenPaymentId);
              setInFlightPaymentId(null);
            },
          },
        ],
      );
    }
  }, [inFlightPaymentId, successResult, reviewResult, closePayment, onClose, setKeepAwake]);

  const handleVoidOnTerminal = useCallback(async () => {
    const completed = successResult ?? reviewResult;
    const paymentId = completed?.id || completed?.payment_id;
    if (!paymentId) return;
    setVoiding(true);
    try {
      const voidRow = await voidPayment(paymentId);
      if (voidRow && (voidRow.status === "processing" || voidRow.status === "successful")) {
        Alert.alert(
          pc("voidSentTitle"),
          pc("voidSentBody"),
        );
      }
    } finally {
      setVoiding(false);
    }
  }, [successResult, reviewResult, voidPayment]);

  const handleProcess = useCallback(async () => {
    if (!selectedTerminal) {
      Alert.alert(pc("selectMachineTitle"), pc("selectMachineBody"));
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const trySameDevice = isSameDeviceMode;
    const channel: "cloud" | "same_terminal" = trySameDevice ? "same_terminal" : "cloud";
    const info = trySameDevice ? deviceInfo ?? (await getPaycloudDeviceInfo()) : null;
    if (info) setDeviceInfo(info);

    if (trySameDevice && !info?.serial) {
      Alert.alert(
        pc("deviceNotLinkedTitle"),
        pc("deviceNotLinkedBody"),
        [
          {
            text: pc("openCardMachines"),
            onPress: () => {
              void handleClose();
              router.push("/(app)/(tabs)/more/card-machines" as never);
            },
          },
          { text: pc("useCardMachine"), onPress: () => setPayOnThisDevice(false) },
        ],
      );
      return;
    }

    await setKeepAwake(true);
    setSameTerminalStep(trySameDevice ? "opening" : "idle");

    const processCreateResult = async (
      createResult: Awaited<ReturnType<typeof createPayment>>,
    ): Promise<boolean> => {
      if (!createResult.ok) {
        if (
          (createResult.code === "TERMINAL_IN_FLIGHT" || createResult.code === "ENTITY_IN_FLIGHT") &&
          createResult.existingPaymentId
        ) {
          Alert.alert(
            pc("paymentInProgressTitle"),
            createResult.message,
            [
              { text: pc("cancel"), style: "cancel" },
              {
                text: pc("resume"),
                onPress: () => {
                  setInFlightPaymentId(createResult.existingPaymentId!);
                  void handleResumeInFlight();
                },
              },
            ],
          );
          return false;
        }
        if (createResult.code === "POLL_TIMEOUT" && createResult.existingPaymentId) {
          setInFlightPaymentId(createResult.existingPaymentId);
          Alert.alert(
            pc("stillWaitingTitle"),
            createResult.message,
            [
              { text: pc("cancelCharge"), style: "destructive", onPress: () => void closePayment(createResult.existingPaymentId!) },
              { text: pc("resume"), onPress: () => void handleResumeInFlight() },
            ],
          );
          return false;
        }
        return false;
      }

      const payment = createResult.payment;
      const paymentId = payment.id || payment.payment_id;
      if (paymentId) setInFlightPaymentId(paymentId);

      if (channel === "same_terminal" && payment.intent_payload) {
        setSameTerminalStep("on_device");
        return true;
      }

      if (payment.status === "successful") {
        handleSettledSuccess(payment);
        return true;
      }
      if (payment.status === "failed") {
        setInFlightPaymentId(null);
        Alert.alert(
          pc("paymentFailedTitle"),
          payment.error_message || pc("paymentFailedBody"),
        );
        return false;
      }

      Alert.alert(
        pc("waitingOnMachineTitle"),
        pc("waitingOnMachineBody", { name: selectedTerminal.name }),
      );
      return true;
    };

    const runCloudFallback = async () => {
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
      if (!cloudRetry.ok) {
        await processCreateResult(cloudRetry);
        return;
      }
      const retryPayment = cloudRetry.payment;
      const retryId = retryPayment.id || retryPayment.payment_id;
      if (retryId) setInFlightPaymentId(retryId);
      if (retryPayment.status === "successful") {
        handleSettledSuccess(retryPayment);
        return;
      }
      if (retryPayment.status === "failed") {
        setInFlightPaymentId(null);
        Alert.alert(
          pc("paymentFailedTitle"),
          retryPayment.error_message || pc("paymentFailedBody"),
        );
        return;
      }
      Alert.alert(
        pc("waitingOnMachineTitle"),
        pc("waitingOnMachineBody", { name: selectedTerminal.name }),
      );
    };

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
      ...(info?.serial ? { device_serial: info.serial } : {}),
      ...(info?.model ? { device_model: info.model } : {}),
      ...(info?.manufacturer ? { device_manufacturer: info.manufacturer } : {}),
      ...(info?.serialSource ? { serial_source: info.serialSource } : {}),
    });

    if (!result.ok) {
      const handled = await processCreateResult(result);
      if (!handled) {
        await setKeepAwake(false);
        setSameTerminalStep("idle");
      }
      return;
    }

    const payment = result.payment;
    const paymentId = payment.id || payment.payment_id;
    if (paymentId) setInFlightPaymentId(paymentId);

    if (channel === "same_terminal" && payment.intent_payload) {
      setSameTerminalStep("on_device");
      const intentResult = await startPaycloudSameTerminalSale(payment.intent_payload);
      const transData = parsePaycloudIntentTransData(intentResult.transData);
      if (transData?.cardNo) setMaskedCard(transData.cardNo);

      if (!isPaycloudIntentApproved(intentResult)) {
        if (paymentId) await closePayment(paymentId);
        setInFlightPaymentId(null);
        setSameTerminalStep("idle");
        await setKeepAwake(false);
        const friendly =
          intentResult.message ??
          humanizePaycloudIntentResult(intentResult.result, intentResult.resultMsg);
        Alert.alert(pc("paymentNotCompletedTitle"), friendly, [
          { text: pc("cancel"), style: "cancel" },
          { text: pc("sendToCardMachine"), onPress: () => void runCloudFallback() },
          { text: pc("tryAgain"), onPress: () => void handleProcessRef.current?.() },
        ]);
        return;
      }

      setSameTerminalStep("confirming");
      if (paymentId) {
        const settled = await pollSameTerminalSettlement(
          paymentId,
          confirmPayment,
          pollPayment,
          intentResult,
          info,
        );
        await setKeepAwake(false);
        setSameTerminalStep("idle");
        if (settled?.status === "successful") {
          handleSettledSuccess(settled);
          return;
        }
        if (settled?.status === "failed" || settled?.status === "cancelled") {
          setInFlightPaymentId(null);
          Alert.alert(
            pc("paymentFailedTitle"),
            settled.error_message || pc("paymentFailedOnDevice"),
          );
          return;
        }
      }
      Alert.alert(
        pc("waitingConfirmationTitle"),
        pc("waitingConfirmationBody"),
      );
      return;
    }

    await setKeepAwake(false);

    if (payment.status === "successful") {
      handleSettledSuccess(payment);
    } else if (payment.status === "failed") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setInFlightPaymentId(null);
      Alert.alert(
        pc("paymentFailedTitle"),
        payment.error_message || pc("paymentFailedBody"),
      );
    } else if (payment.status === "pending" || payment.status === "processing") {
      Alert.alert(
        pc("waitingOnMachineTitle"),
        pc("waitingOnMachineBody", { name: selectedTerminal.name }),
      );
    }
  }, [
    selectedTerminal,
    isSameDeviceMode,
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
    deviceInfo,
    setKeepAwake,
    handleClose,
    router,
  ]);

  useEffect(() => {
    handleProcessRef.current = handleProcess;
  }, [handleProcess]);

  if (!paycloudEnabled) {
    return null;
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={handleClose}
      title={pc("title")}
      subtitle={pc("subtitle", { amount: displayAmount })}
      snapHeight="half"
    >
      {successResult ? (
        <View>
          <View style={twStyle("mb-4 items-center rounded-2xl border border-emerald-200 bg-emerald-50 py-6")}>
            <Ionicons name="checkmark-circle" size={40} color="#059669" />
            <Text style={twStyle("mt-2 text-base font-semibold text-emerald-900")}>
              {pc("paymentSuccessful")}
            </Text>
            <Text style={twStyle("mt-1 text-sm text-emerald-800")}>
              {pc("amountReceived", { amount: formatCurrency(Number(successResult.amount ?? amount), currency) })}
            </Text>
            {maskedCard ? (
              <Text style={twStyle("mt-1 text-xs text-emerald-700")}>{pc("cardMasked", { card: maskedCard })}</Text>
            ) : null}
          </View>
          <ActionButton
            label={voiding ? pc("sendingVoid") : pc("voidOnMachine")}
            onPress={() => void handleVoidOnTerminal()}
            loading={voiding}
            variant="outline"
            fullWidth
          />
          <View style={twStyle("mt-2")}>
            <ActionButton label={pc("done")} onPress={() => void handleClose()} fullWidth />
          </View>
        </View>
      ) : reviewResult ? (
        <View>
          <View style={twStyle("mb-4 items-center rounded-2xl border border-amber-200 bg-amber-50 py-6 px-4")}>
            <Ionicons name="alert-circle" size={40} color="#d97706" />
            <Text style={twStyle("mt-2 text-base font-semibold text-amber-900")}>
              {pc("needsReview")}
            </Text>
            <Text style={twStyle("mt-1 text-sm text-amber-800")}>
              {pc("amountCaptured", { amount: formatCurrency(Number(reviewResult.amount ?? 0), currency) })}
              {typeof reviewResult.expected_amount === "number"
                ? pc("amountDue", { amount: formatCurrency(reviewResult.expected_amount, currency) })
                : ""}
            </Text>
            <Text style={twStyle("mt-2 text-xs text-center text-amber-800")}>
              {pc("reviewHint")}
            </Text>
          </View>
          <ActionButton
            label={voiding ? pc("sendingVoid") : pc("voidOnMachine")}
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
              accessibilityLabel={pc("reviewInCardMachinesA11y")}
            >
              <Text style={twStyle("text-sm font-semibold text-amber-800")}>
                {pc("reviewInCardMachines")}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={twStyle("mt-2")}>
            <ActionButton label={pc("done")} onPress={() => void handleClose()} fullWidth />
          </View>
        </View>
      ) : (
      <>
      {sameTerminalStep !== "idle" ? (
        <View style={twStyle("mb-4 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-3")}>
          <Text style={twStyle("text-sm font-medium text-indigo-900")}>
            {sameTerminalStep === "opening"
              ? pc("openingCardApp")
              : sameTerminalStep === "on_device"
                ? pc("handTerminal")
                : pc("confirmingPayment")}
          </Text>
          <Text style={twStyle("mt-1 text-xs text-indigo-800")}>
            {sameTerminalStep === "on_device"
              ? pc("completeInWiseCashier")
              : pc("keepScreenOpen")}
          </Text>
        </View>
      ) : null}

      <View style={twStyle("mb-4 flex-row items-center justify-between rounded-xl border border-gray-100 bg-gray-50 px-3 py-2")}>
        <Text style={twStyle("text-xs text-gray-600")}>{pc("paymentMode")}</Text>
        <Text style={twStyle("text-xs font-semibold text-gray-900")}>
          {isSameDeviceMode ? pc("modeThisDevice") : pc("modeCloud")}
        </Text>
      </View>

      {primaryBlocker ? (
        <View style={twStyle("mb-4")}>
          <PaycloudCollectSetupAffordance blocker={primaryBlocker} compact />
        </View>
      ) : null}

      {isSandboxMachine ? (
        <View style={twStyle("mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2")}>
          <Text style={twStyle("text-xs font-semibold text-amber-900")}>{pc("testMachine")}</Text>
          <Text style={twStyle("mt-1 text-xs text-amber-800")}>
            {pc("testMachineHint")}
          </Text>
        </View>
      ) : null}

      <View style={twStyle(`mb-4 items-center rounded-2xl bg-gray-50 py-6 ${isCompactLayout ? "px-3" : ""}`)}>
        <Text style={twStyle("text-sm text-gray-500")}>{pc("amountToCharge")}</Text>
        <Text style={twStyle("mt-1 text-3xl font-bold text-gray-900")}>{displayAmount}</Text>
        {parsedTip > 0 ? (
          <Text style={twStyle("mt-1 text-xs text-gray-500")}>
            {parsedCashback > 0
              ? pc("tipLineWithCashback", {
                  base: baseDisplay,
                  tip: formatCurrency(parsedTip, currency),
                  cashback: formatCurrency(parsedCashback, currency),
                })
              : pc("tipLine", { base: baseDisplay, tip: formatCurrency(parsedTip, currency) })}
          </Text>
        ) : parsedCashback > 0 ? (
          <Text style={twStyle("mt-1 text-xs text-gray-500")}>
            {pc("cashbackLine", { base: baseDisplay, cashback: formatCurrency(parsedCashback, currency) })}
          </Text>
        ) : null}
      </View>

      {tipIncludedInAmount ? (
        <View style={twStyle("mb-4 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2")}>
          <Text style={twStyle("text-xs text-gray-600")}>
            {pc("tipIncluded")}
          </Text>
        </View>
      ) : (
        <View style={twStyle("mb-4")}>
          <Text style={twStyle("mb-1.5 text-sm font-medium text-gray-700")}>
            {pc("tipOptional")}
          </Text>
          <TextInput
            style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900")}
            value={tipAmount}
            onChangeText={setTipAmount}
            placeholder={pc("amountPlaceholder")}
            placeholderTextColor="#9ca3af"
            keyboardType="decimal-pad"
            accessibilityLabel={pc("tipA11y")}
          />
        </View>
      )}

      {cashbackOn ? (
        <View style={twStyle("mb-4")}>
          <Text style={twStyle("mb-1.5 text-sm font-medium text-gray-700")}>
            {pc("cashbackOptional")}
          </Text>
          <TextInput
            style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900")}
            value={cashbackAmount}
            onChangeText={setCashbackAmount}
            placeholder={pc("amountPlaceholder")}
            placeholderTextColor="#9ca3af"
            keyboardType="decimal-pad"
            accessibilityLabel={pc("cashbackA11y")}
          />
        </View>
      ) : null}

      {qrEnabled ? (
        <View style={twStyle("mb-4")}>
          <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>{pc("paymentMethod")}</Text>
          <View style={twStyle("flex-row")}>
            {(
              [
                { value: "card" as const, label: pc("methodCard"), icon: "card-outline" as const },
                { value: "qr" as const, label: pc("methodWalletQr"), icon: "qr-code-outline" as const },
              ] as const
            ).map((option) => {
              const selected = payMethod === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  onPress={() => setPayMethod(option.value)}
                  style={[
                    twStyle(`me-2 flex-1 flex-row items-center justify-center rounded-xl border py-2.5 ${
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
                    style={twStyle(`ms-2 text-sm font-medium ${
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
          <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>{pc("whereToPay")}</Text>
          <View style={twStyle("flex-row")}>
            {(
              [
                { value: true, label: pc("payOnThisDevice") },
                { value: false, label: pc("sendToCardMachineLabel") },
              ] as const
            ).map((option) => {
              const selected = payOnThisDevice === option.value;
              return (
                <TouchableOpacity
                  key={option.label}
                  onPress={() => setPayOnThisDevice(option.value)}
                  style={twStyle(`me-2 flex-1 rounded-xl border py-2.5 ${
                    selected ? "border-indigo-500 bg-indigo-50" : "border-gray-200 bg-white"
                  }`)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={option.label}
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
        {isSameDeviceMode ? pc("linkedMachine") : pc("selectMachine")}
      </Text>
      {loading ? (
        <View style={twStyle("items-center py-8")}>
          <ActivityIndicator size="small" color="#6366f1" />
          <Text style={twStyle("mt-2 text-xs text-gray-500")}>{pc("loading")}</Text>
        </View>
      ) : !isReady ? (
        <View style={twStyle("items-center rounded-2xl border border-amber-200 bg-amber-50 py-8 px-4")}>
          <Ionicons name="link-outline" size={32} color="#d97706" />
          <Text style={twStyle("mt-2 text-sm font-medium text-amber-800")}>
            {pc("inPersonOffTitle")}
          </Text>
          <Text style={twStyle("mt-1 text-xs text-center text-amber-700")}>
            {pc("inPersonOffBody")}
          </Text>
          <TouchableOpacity
            onPress={() => {
              void handleClose();
              router.push("/(app)/(tabs)/more/card-machines" as never);
            }}
            style={twStyle("mt-3 rounded-xl bg-amber-600 px-4 py-2")}
            accessibilityRole="button"
            accessibilityLabel={pc("openCardMachinesSettingsA11y")}
          >
            <Text style={twStyle("text-xs font-semibold text-white")}>{pc("openCardMachines")}</Text>
          </TouchableOpacity>
        </View>
      ) : activeTerminals.length === 0 ? (
        <View style={twStyle("items-center rounded-2xl border border-dashed border-gray-200 py-8 px-4")}>
          <Ionicons name="hardware-chip-outline" size={32} color="#9ca3af" />
          <Text style={twStyle("mt-2 text-sm text-gray-500")}>
            {terminals.length > 0 ? pc("noActiveMachines") : pc("noMachinesYet")}
          </Text>
          <Text style={twStyle("mt-1 text-xs text-gray-400 text-center")}>
            {pc("addMachineHint")}
          </Text>
          <TouchableOpacity
            onPress={() => {
              void handleClose();
              router.push("/(app)/(tabs)/more/card-machines" as never);
            }}
            style={twStyle("mt-3 rounded-xl bg-indigo-600 px-4 py-2")}
            accessibilityRole="button"
            accessibilityLabel={pc("manageMachinesA11y")}
          >
            <Text style={twStyle("text-xs font-semibold text-white")}>{pc("addACardMachine")}</Text>
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
                {pc("inProgressTitle")}
              </Text>
              <Text style={twStyle("mt-1 text-xs text-indigo-800")}>
                {pc("inProgressBody")}
              </Text>
              <TouchableOpacity
                onPress={() => void handleResumeInFlight()}
                style={twStyle("mt-2 self-start rounded-lg bg-indigo-600 px-3 py-2")}
                disabled={resumingInFlight}
                accessibilityRole="button"
                accessibilityState={{ disabled: resumingInFlight, busy: resumingInFlight }}
                accessibilityLabel={pc("resumePaymentA11y")}
              >
                <Text style={twStyle("text-xs font-semibold text-white")}>
                  {resumingInFlight ? pc("checking") : pc("resumePayment")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  const paymentId =
                    inFlightPaymentId ?? selectedTerminal?.in_flight_payment_id ?? null;
                  if (!paymentId) return;
                  Alert.alert(
                    pc("cancelChargeTitle"),
                    pc("cancelChargeBody"),
                    [
                      { text: pc("keepOpen"), style: "cancel" },
                      {
                        text: pc("cancelCharge"),
                        style: "destructive",
                        onPress: () => {
                          void (async () => {
                            try {
                              await closePayment(paymentId);
                              setInFlightPaymentId(null);
                            } catch {
                              Alert.alert(
                                pc("couldNotCancelTitle"),
                                pc("couldNotCancelBody"),
                              );
                            }
                          })();
                        },
                      },
                    ],
                  );
                }}
                style={twStyle("mt-2 self-start rounded-lg border border-indigo-300 px-3 py-2")}
                accessibilityRole="button"
                accessibilityLabel={pc("cancelInProgressA11y")}
              >
                <Text style={twStyle("text-xs font-semibold text-indigo-900")}>{pc("cancelCharge")}</Text>
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
                      {pc("mobileUsingPortable")}
                    </Text>
                  </View>
                );
              }
              return (
                <View style={twStyle("mb-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2")}>
                  <Text style={twStyle("text-xs text-amber-800")}>
                    {pc("mobileSetAllLocations")}
                  </Text>
                </View>
              );
            }
            if (!hasExactMatch && !hasPortable) {
              return (
                <View style={twStyle("mb-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2")}>
                  <Text style={twStyle("text-xs text-amber-800")}>
                    {pc("noMachineAssigned")}
                  </Text>
                </View>
              );
            }
            if (!hasExactMatch && hasPortable) {
              return (
                <View style={twStyle("mb-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2")}>
                  <Text style={twStyle("text-xs text-indigo-800")}>
                    {pc("usingPortable")}
                  </Text>
                </View>
              );
            }
            return null;
          })()}
          {isSameDeviceMode && !deviceMatchedTerminal ? (
            <View style={twStyle("mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3")}>
              <Text style={twStyle("text-sm font-medium text-amber-900")}>
                {pc("deviceNotLinkedYet")}
              </Text>
              <Text style={twStyle("mt-1 text-xs text-amber-800")}>
                {pc("deviceNotLinkedHint")}
              </Text>
              <View style={twStyle("mt-2 flex-row")}>
                <TouchableOpacity
                  onPress={() => {
                    void handleClose();
                    router.push("/(app)/(tabs)/more/card-machines" as never);
                  }}
                  style={twStyle("me-2 rounded-lg bg-amber-600 px-3 py-2")}
                  accessibilityRole="button"
                  accessibilityLabel={pc("linkThisDeviceA11y")}
                >
                  <Text style={twStyle("text-xs font-semibold text-white")}>{pc("linkThisDevice")}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setPayOnThisDevice(false)}
                  style={twStyle("rounded-lg border border-amber-300 bg-white px-3 py-2")}
                  accessibilityRole="button"
                  accessibilityLabel={pc("sendToMachineA11y")}
                >
                  <Text style={twStyle("text-xs font-semibold text-amber-800")}>
                    {pc("sendToCardMachineLabel")}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
          {activeTerminals.map((terminal, idx) => {
            const isSelected = selectedTerminal?.id === terminal.id;
            const merchantPending = terminal.merchant == null;
            const isSandbox = terminal.merchant?.environment === "sandbox";
            // In same-device mode only the linked record can be charged.
            const unusableOnThisDevice =
              isSameDeviceMode && deviceMatchedTerminal?.id !== terminal.id;
            const notChargeable = merchantPending || unusableOnThisDevice;
            const matchesBookingLocation =
              !!bookingLocationId && terminal.location_id === bookingLocationId;
            const isPortable = terminal.location_id == null;
            const lastUsedLabel = terminal.last_used
              ? pc("lastUsed", { when: formatLastUsed(terminal.last_used, pc) })
              : pc("neverUsed");
            return (
              <TouchableOpacity
                key={terminal.id}
                onPress={() => !notChargeable && setSelectedTerminal(terminal)}
                disabled={notChargeable}
                style={[
                  twStyle(`flex-row items-center rounded-xl border p-3 ${
                    isSelected ? "border-indigo-500 bg-indigo-50" : "border-gray-200 bg-white"
                  }`),
                  idx > 0 ? { marginTop: 8 } : undefined,
                  notChargeable ? { opacity: 0.45 } : undefined,
                ]}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected, disabled: notChargeable }}
                accessibilityLabel={
                  merchantPending
                    ? pc("machineSetupPendingA11y", { name: terminal.name })
                    : unusableOnThisDevice
                    ? pc("machineUnavailableA11y", { name: terminal.name })
                    : pc("machineA11y", { name: terminal.name })
                }
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
                <View style={twStyle("ms-3 flex-1")}>
                  <View style={twStyle("flex-row flex-wrap items-center")}>
                    <Text
                      style={twStyle(`text-sm font-medium ${
                        isSelected ? "text-indigo-700" : "text-gray-900"
                      }`)}
                    >
                      {terminal.name}
                    </Text>
                    {matchesBookingLocation ? (
                      <View style={twStyle("ms-2 rounded-full bg-emerald-100 px-2 py-0.5")}>
                        <Text style={twStyle("text-[10px] font-semibold text-emerald-700")}>
                          {pc("thisLocation")}
                        </Text>
                      </View>
                    ) : null}
                    {isPortable ? (
                      <View style={twStyle("ms-2 rounded-full bg-indigo-100 px-2 py-0.5")}>
                        <Text style={twStyle("text-[10px] font-semibold text-indigo-700")}>
                          {pc("portable")}
                        </Text>
                      </View>
                    ) : null}
                    {deviceMatchedTerminal?.id === terminal.id ? (
                      <View style={twStyle("ms-2 rounded-full bg-slate-900 px-2 py-0.5")}>
                        <Text style={twStyle("text-[10px] font-semibold text-white")}>
                          {pc("thisDevice")}
                        </Text>
                      </View>
                    ) : null}
                    {isSandbox ? (
                      <View style={twStyle("ms-2 rounded-full bg-amber-200 px-2 py-0.5")}>
                        <Text style={twStyle("text-[10px] font-semibold text-amber-900")}>{pc("testBadge")}</Text>
                      </View>
                    ) : null}
                    {merchantPending ? (
                      <View style={twStyle("ms-2 rounded-full bg-gray-200 px-2 py-0.5")}>
                        <Text style={twStyle("text-[10px] font-semibold text-gray-700")}>
                          {pc("setupPending")}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={twStyle("text-xs text-gray-500")}>
                    {terminal.terminal_sn ? pc("serialLabel", { serial: terminal.terminal_sn }) : pc("cardMachine")}
                    {terminal.location_name
                      ? pc("locationSuffix", { name: terminal.location_name })
                      : isPortable
                        ? pc("allLocationsSuffix")
                        : ""}
                  </Text>
                  <Text style={twStyle("text-[11px] text-gray-400")}>
                    {lastUsedLabel}
                    {terminal.total_transactions > 0
                      ? pc("paymentCount", { count: terminal.total_transactions })
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
            ? pc("waitingCta")
            : isSameDeviceMode
              ? pc("payOnDeviceCta", { amount: displayAmount })
              : pc("sendToMachineCta", { amount: displayAmount })
        }
        onPress={handleProcess}
        loading={processing}
        disabled={
          !selectedTerminal ||
          processing ||
          sameTerminalStep !== "idle" ||
          resumingInFlight ||
          activeTerminals.length === 0 ||
          !isReady ||
          totalAmount <= 0 ||
          (isSameDeviceMode && !deviceMatchedTerminal)
        }
        fullWidth
      />
      </>
      )}
    </BottomSheet>
  );
}
