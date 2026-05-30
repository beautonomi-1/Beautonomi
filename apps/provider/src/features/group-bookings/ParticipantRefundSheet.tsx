import { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ActionButton } from "@/components/ui/ActionButton";
import { twStyle } from "@/lib/twStyle";
import { formatCurrency } from "@/lib/format";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";
import { useApiMutation } from "@/hooks/useApi";

export type ParticipantRefundTarget = {
  id: string;
  booking_id: string;
  displayName: string;
  total_paid?: number | null;
  total_refunded?: number | null;
  price?: number;
  currency?: string | null;
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
  const { execute: postRefund, loading: refunding } = useApiMutation("post");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refundMethod, setRefundMethod] = useState<"cash" | "store_credit">("cash");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const currency = participant?.currency ?? getTenantDefaultCurrency();
  const totalPaid = Number(participant?.total_paid ?? 0);
  const totalRefunded = Number(participant?.total_refunded ?? 0);
  const maxRefundable = Math.max(0, totalPaid - totalRefunded);

  useEffect(() => {
    if (!visible || !participant) return;
    setRefundAmount(maxRefundable > 0 ? maxRefundable.toFixed(2) : "");
    setRefundReason("");
    setRefundMethod("cash");
    setError(null);
    setSuccessMessage(null);
  }, [visible, participant, maxRefundable]);

  async function handleRefund() {
    if (!participant?.booking_id) return;
    setError(null);
    const amount = parseFloat(refundAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a valid refund amount.");
      return;
    }
    if (amount > maxRefundable + 0.01) {
      setError(
        `You can refund up to ${formatCurrency(maxRefundable, currency)} (net of refunds already issued).`
      );
      return;
    }
    const reason = refundReason.trim();
    if (!reason) {
      setError("Please enter a reason for the refund.");
      return;
    }

    const res = await postRefund(`/api/provider/bookings/${participant.booking_id}/refund`, {
      amount,
      reason,
      refund_method: refundMethod,
    });
    if (res.error) {
      setError(res.error);
      return;
    }
    setSuccessMessage(
      refundMethod === "cash"
        ? `Recorded ${formatCurrency(amount, currency)} refunded in person.`
        : `Refunded ${formatCurrency(amount, currency)} to wallet credit.`
    );
    onSuccess(participant.id, amount);
    setTimeout(() => {
      onClose();
    }, 900);
  }

  function openBookingDetail() {
    if (!participant?.booking_id) return;
    onClose();
    router.push({
      pathname: "/(app)/(tabs)/more/bookings/[id]",
      params: { id: participant.booking_id, return_group_id: groupId },
    } as never);
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Refund participant"
      subtitle={participant?.displayName}
      footer={
        <ActionButton
          label={refunding ? "Processing…" : "Confirm refund"}
          onPress={() => {
            void handleRefund();
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
        <Text style={twStyle("mb-3 text-xs text-gray-500")}>
          Net collected: {formatCurrency(maxRefundable, currency)}
          {totalRefunded > 0
            ? ` (paid ${formatCurrency(totalPaid, currency)}, refunded ${formatCurrency(totalRefunded, currency)})`
            : ""}
          .
        </Text>
        <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>Refund method</Text>
        <View style={twStyle("mb-3 flex-row rounded-xl border border-gray-200 bg-gray-50 p-1")}>
          {([
            { key: "cash" as const, label: "In person (cash)" },
            { key: "store_credit" as const, label: "Wallet credit" },
          ]).map((opt) => {
            const active = refundMethod === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                onPress={() => setRefundMethod(opt.key)}
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
          {refundMethod === "cash"
            ? "Hand the money back to the customer at the salon. Recorded for your books; no wallet credit is issued."
            : "Adds wallet store credit to the participant's account (requires a customer account)."}
        </Text>
        <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>Refund amount</Text>
        <TextInput
          style={twStyle(
            "mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
          )}
          value={refundAmount}
          onChangeText={setRefundAmount}
          keyboardType="decimal-pad"
          placeholder="0.00"
          placeholderTextColor="#9ca3af"
        />
        <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>Reason</Text>
        <TextInput
          style={twStyle(
            "mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
          )}
          value={refundReason}
          onChangeText={setRefundReason}
          placeholder="Why is this refund being issued?"
          placeholderTextColor="#9ca3af"
          multiline
        />
        <TouchableOpacity onPress={openBookingDetail} accessibilityRole="button">
          <Text style={twStyle("text-sm font-medium text-indigo-600")}>View full booking</Text>
        </TouchableOpacity>
      </View>
    </BottomSheet>
  );
}
