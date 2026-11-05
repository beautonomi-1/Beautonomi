import { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "@beautonomi/i18n";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ActionButton } from "@/components/ui/ActionButton";
import { twStyle } from "@/lib/twStyle";
import { formatCurrency } from "@/lib/format";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";
import { useApiMutation } from "@/hooks/useApi";
import { useFeatureFlag } from "@/providers/ConfigBundleProvider";
import { participantMaxRefundable } from "@/lib/group-booking-detail-helpers";
import { api } from "@/lib/api-client";

export type ParticipantRefundTarget = {
  id: string;
  booking_id: string;
  displayName: string;
  total_paid?: number | null;
  total_refunded?: number | null;
  wallet_gift_coverage?: number | null;
  price?: number;
  currency?: string | null;
  isGroupPaymentRefund?: boolean;
};

type RefundCaps = {
  maxRefundable: number;
  onlineCap: number;
  cashCap: number;
  terminalCap: number;
  hasCustomerAccount: boolean;
  suggestedMethod: "store_credit" | "cash" | "original";
};

type ParticipantRefundSheetProps = {
  visible: boolean;
  participant: ParticipantRefundTarget | null;
  groupId: string;
  onClose: () => void;
  onSuccess: (participantId: string, refundAmount: number) => void;
};

export function ParticipantRefundSheet({
  visible,
  participant,
  groupId,
  onClose,
  onSuccess,
}: ParticipantRefundSheetProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const gb = (key: string, opts?: Record<string, unknown>) =>
    t(`provider.mobile.screens.groupBookings.${key}`, opts) as string;
  const { execute: postRefund, loading: refunding } = useApiMutation("post");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refundMethod, setRefundMethod] = useState<"cash" | "store_credit" | "original">("cash");
  const [yocoPendingRecord, setYocoPendingRecord] = useState(false);
  const yocoEnabled = useFeatureFlag("payment_yoco");
  const paycloudEnabled = useFeatureFlag("payment_paycloud");
  const bk = (key: string, opts?: Record<string, unknown>) =>
    t(`provider.mobile.screens.bookingDetail.${key}`, opts) as string;
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [refundCaps, setRefundCaps] = useState<RefundCaps | null>(null);
  const [refundOptionsLoading, setRefundOptionsLoading] = useState(false);

  const currency = participant?.currency ?? getTenantDefaultCurrency();
  const totalPaid = Number(participant?.total_paid ?? 0);
  const totalRefunded = Number(participant?.total_refunded ?? 0);
  const walletGiftCoverage = Number(participant?.wallet_gift_coverage ?? 0);
  const fallbackMax = participantMaxRefundable({
    total_paid: totalPaid,
    total_refunded: totalRefunded,
    wallet_gift_coverage: walletGiftCoverage,
  });
  const maxRefundable = refundCaps?.maxRefundable ?? fallbackMax;
  const sheetTitle = participant?.isGroupPaymentRefund
    ? gb("refundGroupPayment")
    : gb("refundParticipantTitle");

  useEffect(() => {
    if (!visible || !participant) return;
    setRefundAmount("");
    setRefundReason("");
    setRefundMethod("cash");
    setYocoPendingRecord(false);
    setError(null);
    setSuccessMessage(null);
    setRefundCaps(null);
  }, [visible, participant]);

  useEffect(() => {
    if (!visible || !participant?.booking_id) return;
    let cancelled = false;
    setRefundOptionsLoading(true);
    void (async () => {
      const res = await api.get<{ caps: RefundCaps }>(
        `/api/provider/bookings/${participant.booking_id}/refund-options`,
      );
      if (cancelled) return;
      setRefundOptionsLoading(false);
      if (res.error || !res.data?.caps) {
        setRefundCaps(null);
        if (res.error) setError(gb("refundOptionsLoadFailed"));
        return;
      }
      const caps = res.data.caps;
      setRefundCaps(caps);
      setRefundMethod(caps.suggestedMethod);
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, participant?.booking_id]);

  function refundMethodLabel(method: typeof refundMethod): string {
    if (method === "original") return gb("refundMethodOriginal");
    if (method === "store_credit") return gb("refundMethodWallet");
    return gb("refundMethodCash");
  }

  async function submitRefund(options?: { recordOnly?: boolean }) {
    if (!participant?.booking_id) return;
    setError(null);
    const amount = parseFloat(refundAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError(gb("refundInvalidAmount"));
      return;
    }
    if (amount > maxRefundable + 0.01) {
      setError(gb("refundMaxAmount", { amount: formatCurrency(maxRefundable, currency) }));
      return;
    }
    const reason = refundReason.trim();
    if (!reason) {
      setError(gb("refundReasonRequired"));
      return;
    }

    const res = await postRefund(`/api/provider/bookings/${participant.booking_id}/refund`, {
      amount,
      reason,
      refund_method: options?.recordOnly ? "original" : refundMethod,
      ...(options?.recordOnly ? { record_only: true } : {}),
    });
    if (res.errorCode === "YOCO_REFUND_ON_MACHINE") {
      setYocoPendingRecord(true);
      return;
    }
    if (res.errorCode === "WALLET_REFUND_CAP_EXCEEDED") {
      setError(gb("refundWalletCapExceeded"));
      return;
    }
    if (res.error) {
      setError(res.error);
      return;
    }
    setYocoPendingRecord(false);
    const payload = res.data && typeof res.data === "object" ? (res.data as Record<string, unknown>) : null;
    setSuccessMessage(
      options?.recordOnly
        ? bk("yocoRefundRecordedBody")
        : payload?.pending_terminal === true
          ? bk("sentToCardMachineDefault")
          : refundMethod === "cash"
            ? gb("refundRecordedCash", { amount: formatCurrency(amount, currency) })
            : gb("refundRecordedWallet", { amount: formatCurrency(amount, currency) })
    );
    onSuccess(participant.id, amount);
    setTimeout(() => {
      onClose();
    }, 900);
  }

  function handleRefund(options?: { recordOnly?: boolean }) {
    if (!participant?.booking_id) return;
    const amount = parseFloat(refundAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError(gb("refundInvalidAmount"));
      return;
    }
    if (amount > maxRefundable + 0.01) {
      setError(gb("refundMaxAmount", { amount: formatCurrency(maxRefundable, currency) }));
      return;
    }
    const reason = refundReason.trim();
    if (!reason) {
      setError(gb("refundReasonRequired"));
      return;
    }
    if (options?.recordOnly) {
      void submitRefund(options);
      return;
    }
    Alert.alert(
      gb("refundConfirmSummaryTitle"),
      gb("refundConfirmSummaryBody", {
        amount: formatCurrency(amount, currency),
        method: refundMethodLabel(refundMethod),
        reason,
      }),
      [
        { text: gb("cancel"), style: "cancel" },
        { text: gb("refundConfirm"), onPress: () => void submitRefund() },
      ],
    );
  }

  function openBookingDetail() {
    if (!participant?.booking_id) return;
    onClose();
    router.push({
      pathname: "/(app)/(tabs)/more/bookings/[id]",
      params: { id: participant.booking_id, return_group_id: groupId },
    } as never);
  }

  const showWalletMethod =
    (refundCaps?.onlineCap ?? 0) > 0.01 && refundCaps?.hasCustomerAccount === true;
  const showOriginalMethod =
    (refundCaps?.terminalCap ?? 0) > 0.01 && (yocoEnabled || paycloudEnabled);
  const showCashMethod = (refundCaps?.cashCap ?? maxRefundable) > 0.01 || !refundCaps;

  const methodOptions = [
    ...(showOriginalMethod ? [{ key: "original" as const, label: bk("refundBackToCard") }] : []),
    ...(showWalletMethod ? [{ key: "store_credit" as const, label: gb("refundMethodWallet") }] : []),
    ...(showCashMethod ? [{ key: "cash" as const, label: gb("refundMethodCash") }] : []),
  ];

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={sheetTitle}
      subtitle={participant?.displayName}
      footer={
        <ActionButton
          label={refunding ? gb("refundProcessing") : gb("refundConfirm")}
          onPress={() => {
            handleRefund();
          }}
          loading={refunding}
          fullWidth
        />
      }
    >
      <View>
        {successMessage ? (
          <View style={twStyle("mb-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3")}>
            <Text style={twStyle("text-sm font-medium text-green-800")}>{successMessage}</Text>
          </View>
        ) : null}
        {error ? (
          <View style={twStyle("mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3")}>
            <Text style={twStyle("text-sm font-medium text-red-800")}>{error}</Text>
          </View>
        ) : null}
        {refundOptionsLoading ? (
          <View style={twStyle("mb-3 flex-row items-center")}>
            <ActivityIndicator size="small" color="#6366f1" />
            <Text style={twStyle("ms-2 text-xs text-gray-500")}>{gb("refundProcessing")}</Text>
          </View>
        ) : null}
        {participant?.isGroupPaymentRefund ? (
          <Text style={twStyle("mb-3 text-xs text-amber-700")}>{gb("refundGroupHint")}</Text>
        ) : null}
        {refundCaps ? (
          <View style={twStyle("mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3")}>
            <Text style={twStyle("mb-1 text-xs font-semibold uppercase text-gray-500")}>
              {gb("refundCapsTitle")}
            </Text>
            {showWalletMethod ? (
              <Text style={twStyle("text-xs text-gray-700")}>
                {gb("refundCapsOnline", {
                  amount: formatCurrency(refundCaps.onlineCap, currency),
                })}
              </Text>
            ) : null}
            {showCashMethod ? (
              <Text style={twStyle("text-xs text-gray-700")}>
                {gb("refundCapsCash", { amount: formatCurrency(refundCaps.cashCap, currency) })}
              </Text>
            ) : null}
            {showOriginalMethod ? (
              <Text style={twStyle("text-xs text-gray-700")}>
                {gb("refundCapsTerminal", {
                  amount: formatCurrency(refundCaps.terminalCap, currency),
                })}
              </Text>
            ) : null}
          </View>
        ) : null}
        <Text style={twStyle("mb-3 text-xs text-gray-500")}>
          {gb("refundNetRefundable", {
            amount: formatCurrency(maxRefundable, currency),
            detail:
              totalRefunded > 0
                ? gb("refundPaidRefunded", {
                    paid: formatCurrency(totalPaid, currency),
                    refunded: formatCurrency(totalRefunded, currency),
                  })
                : walletGiftCoverage > totalPaid
                  ? gb("refundWalletCoverage", {
                      amount: formatCurrency(walletGiftCoverage, currency),
                    })
                  : "",
          })}
        </Text>
        {methodOptions.length > 0 ? (
          <>
            <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>{gb("refundMethod")}</Text>
            <View style={twStyle("mb-3 flex-row rounded-xl border border-gray-200 bg-gray-50 p-1")}>
              {methodOptions.map((opt) => {
                const active = refundMethod === opt.key;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    onPress={() => {
                      setYocoPendingRecord(false);
                      setRefundMethod(opt.key);
                    }}
                    accessibilityRole="button"
                    style={twStyle(
                      `flex-1 items-center rounded-lg px-3 py-2 ${active ? "bg-white" : ""}`
                    )}
                  >
                    <Text
                      style={twStyle(
                        `text-sm font-medium ${active ? "text-indigo-600" : "text-gray-500"}`
                      )}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={twStyle("mb-3 text-xs text-gray-500")}>
              {refundMethod === "original"
                ? bk("refundOriginalMachineHint")
                : refundMethod === "cash"
                  ? gb("refundMethodCashHint")
                  : gb("refundMethodWalletHint")}
            </Text>
          </>
        ) : null}
        {yocoPendingRecord ? (
          <View style={twStyle("mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3")}>
            <Text style={twStyle("text-sm font-semibold text-amber-900")}>{bk("yocoRefundOnMachineTitle")}</Text>
            <Text style={twStyle("mt-1 text-sm text-amber-900")}>
              {bk("yocoRefundOnMachineBody", { amount: formatCurrency(parseFloat(refundAmount) || 0, currency) })}
            </Text>
            <TouchableOpacity
              onPress={() => handleRefund({ recordOnly: true })}
              disabled={refunding}
              accessibilityRole="button"
              style={twStyle("mt-3 items-center rounded-lg border border-amber-300 bg-white py-2")}
            >
              <Text style={twStyle("text-sm font-medium text-amber-900")}>{bk("yocoRefundRecordCta")}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>{gb("refundAmount")}</Text>
        <TextInput
          style={twStyle(
            "mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
          )}
          value={refundAmount}
          onChangeText={setRefundAmount}
          keyboardType="decimal-pad"
          placeholder={gb("refundAmountPlaceholder")}
          placeholderTextColor="#9ca3af"
        />
        <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>{gb("refundReason")}</Text>
        <TextInput
          style={twStyle(
            "mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
          )}
          value={refundReason}
          onChangeText={setRefundReason}
          placeholder={gb("refundReasonPlaceholder")}
          placeholderTextColor="#9ca3af"
          multiline
        />
        <TouchableOpacity onPress={openBookingDetail} accessibilityRole="button">
          <Text style={twStyle("text-sm font-medium text-indigo-600")}>{gb("viewFullBooking")}</Text>
        </TouchableOpacity>
      </View>
    </BottomSheet>
  );
}
