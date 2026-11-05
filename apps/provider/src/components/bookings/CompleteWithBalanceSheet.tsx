import { useEffect, useState } from "react";
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from "react-native";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Colors } from "@/constants/colors";

export type CompleteWithBalanceSheetLabels = {
  title: string;
  body: string;
  reasonLabel: string;
  reasonPlaceholder: string;
  confirm: string;
  cancel: string;
};

type Props = {
  visible: boolean;
  labels: CompleteWithBalanceSheetLabels;
  submitting?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
};

/** Reason is mandatory: the server rejects allow_unpaid without one (BALANCE_DUE_REASON_REQUIRED). */
export function CompleteWithBalanceSheet({ visible, labels, submitting, onCancel, onConfirm }: Props) {
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (visible) setReason("");
  }, [visible]);
  const trimmed = reason.trim();
  const disabled = submitting || trimmed.length < 3;

  return (
    <BottomSheet
      visible={visible}
      onClose={onCancel}
      title={labels.title}
      snapHeight="half"
      footer={
        <View style={{ flexDirection: "row", gap: 12 }}>
          <TouchableOpacity
            onPress={onCancel}
            accessibilityRole="button"
            style={{
              flex: 1,
              minHeight: 48,
              borderRadius: 12,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#f3f4f6",
            }}
          >
            <Text style={{ fontWeight: "600", color: "#374151" }}>{labels.cancel}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onConfirm(trimmed)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityState={{ disabled }}
            testID="complete-with-balance-confirm"
            style={{
              flex: 1,
              minHeight: 48,
              borderRadius: 12,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: disabled ? "#d1d5db" : Colors.primary,
            }}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ fontWeight: "600", color: "#fff" }}>{labels.confirm}</Text>
            )}
          </TouchableOpacity>
        </View>
      }
    >
      <Text style={{ fontSize: 14, color: "#374151", marginBottom: 16 }}>{labels.body}</Text>
      <Text style={{ fontSize: 13, fontWeight: "600", color: "#111827", marginBottom: 6 }}>
        {labels.reasonLabel}
      </Text>
      <TextInput
        value={reason}
        onChangeText={setReason}
        placeholder={labels.reasonPlaceholder}
        placeholderTextColor="#9ca3af"
        multiline
        maxLength={300}
        testID="complete-with-balance-reason"
        style={{
          minHeight: 88,
          borderWidth: 1,
          borderColor: "#e5e7eb",
          borderRadius: 12,
          padding: 12,
          fontSize: 15,
          color: "#111827",
          textAlignVertical: "top",
        }}
      />
    </BottomSheet>
  );
}
