import { useState, useCallback } from "react";
import { View, Text, TouchableOpacity, TextInput, ActivityIndicator, Alert } from "react-native";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Colors } from "@/constants/colors";

interface Props {
  visible: boolean;
  bookingId: string | null;
  customerName?: string | null;
  onClose: () => void;
  onConfirm: (bookingId: string, reason: string) => Promise<{ error: string | null }>;
}

export function CancelBookingSheet({ visible, bookingId, customerName, onClose, onConfirm }: Props) {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  const handleClose = useCallback(() => {
    setReason("");
    onClose();
  }, [onClose]);

  const handleConfirm = useCallback(async () => {
    if (!bookingId) return;
    setLoading(true);
    try {
      const res = await onConfirm(bookingId, reason);
      if (res.error) {
        Alert.alert("Could not cancel booking", res.error);
      } else {
        handleClose();
      }
    } finally {
      setLoading(false);
    }
  }, [bookingId, reason, onConfirm, handleClose]);

  return (
    <BottomSheet visible={visible} onClose={handleClose} title="Cancel Booking" snapHeight="half" showHandle>
      <View style={{ paddingHorizontal: 20, paddingBottom: 32 }}>
        {customerName ? (
          <Text style={{ fontSize: 15, color: Colors.gray[600], marginBottom: 16 }}>
            Cancel booking for{" "}
            <Text style={{ fontWeight: "700", color: Colors.gray[900] }}>{customerName}</Text>?
          </Text>
        ) : null}

        <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[700], marginBottom: 8 }}>
          Cancellation reason (optional)
        </Text>
        <TextInput
          value={reason}
          onChangeText={setReason}
          placeholder="e.g. Client request, schedule conflict..."
          placeholderTextColor={Colors.gray[400]}
          multiline
          numberOfLines={3}
          style={{
            borderRadius: 10,
            borderWidth: 1,
            borderColor: Colors.gray[200],
            paddingHorizontal: 12,
            paddingVertical: 10,
            minHeight: 80,
            fontSize: 14,
            color: Colors.gray[900],
            backgroundColor: Colors.gray[50],
            textAlignVertical: "top",
            marginBottom: 20,
          }}
          accessibilityLabel="Cancellation reason"
        />

        <View style={{ flexDirection: "row", gap: 10 }}>
          <TouchableOpacity
            style={{
              flex: 1,
              borderRadius: 10,
              paddingVertical: 14,
              backgroundColor: Colors.gray[100],
              alignItems: "center",
            }}
            onPress={handleClose}
            disabled={loading}
          >
            <Text style={{ fontSize: 15, fontWeight: "600", color: Colors.gray[700] }}>Go back</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{
              flex: 1,
              borderRadius: 10,
              paddingVertical: 14,
              backgroundColor: Colors.error,
              alignItems: "center",
            }}
            onPress={handleConfirm}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={{ fontSize: 15, fontWeight: "700", color: Colors.white }}>Cancel Booking</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </BottomSheet>
  );
}
