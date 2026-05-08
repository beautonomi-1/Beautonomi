import { useState, useCallback } from "react";
import { View, Text, TouchableOpacity, Alert, ActivityIndicator } from "react-native";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Colors } from "@/constants/colors";
import { formatTimeInZone } from "@/lib/format";
import type { CalendarBooking } from "@/components/calendar/calendar-booking-types";

interface Props {
  visible: boolean;
  booking: CalendarBooking | null;
  providerTimezone: string | null;
  onClose: () => void;
  onReschedule: (bookingId: string, newScheduledAt: string) => Promise<{ error: string | null }>;
}

export function RescheduleSheet({ visible, booking, providerTimezone, onClose, onReschedule }: Props) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [loading, setLoading] = useState(false);

  const handleConfirm = useCallback(async () => {
    if (!booking) return;
    if (!date || !time) {
      Alert.alert("Missing info", "Please enter both date and time.");
      return;
    }
    setLoading(true);
    try {
      const newScheduledAt = `${date}T${time}:00.000Z`;
      const res = await onReschedule(booking.id, newScheduledAt);
      if (res.error) Alert.alert("Reschedule failed", res.error);
      else onClose();
    } finally {
      setLoading(false);
    }
  }, [booking, date, time, onReschedule, onClose]);

  if (!booking) return null;
  const currentTime = formatTimeInZone(booking.scheduled_at, providerTimezone);

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Reschedule" snapHeight="half" showHandle>
      <View style={{ paddingHorizontal: 20, paddingBottom: 32 }}>
        <Text style={{ fontSize: 14, color: Colors.gray[600], marginBottom: 16 }}>
          Current: <Text style={{ fontWeight: "700", color: Colors.gray[900] }}>{currentTime}</Text>
        </Text>

        <Text style={{ fontSize: 13, fontWeight: "600", color: Colors.gray[600], marginBottom: 6 }}>
          New date (YYYY-MM-DD)
        </Text>
        <View
          style={{
            borderRadius: 8,
            borderWidth: 1,
            borderColor: Colors.gray[200],
            paddingHorizontal: 12,
            paddingVertical: 10,
            backgroundColor: Colors.white,
            marginBottom: 14,
          }}
        >
          <Text style={{ fontSize: 14, color: date ? Colors.gray[900] : Colors.gray[400] }}>
            {date || "2026-05-08"}
          </Text>
        </View>

        <Text style={{ fontSize: 13, fontWeight: "600", color: Colors.gray[600], marginBottom: 6 }}>
          New time (HH:MM)
        </Text>
        <View
          style={{
            borderRadius: 8,
            borderWidth: 1,
            borderColor: Colors.gray[200],
            paddingHorizontal: 12,
            paddingVertical: 10,
            backgroundColor: Colors.white,
            marginBottom: 24,
          }}
        >
          <Text style={{ fontSize: 14, color: time ? Colors.gray[900] : Colors.gray[400] }}>
            {time || "09:00"}
          </Text>
        </View>

        <Text style={{ fontSize: 12, color: Colors.gray[400], marginBottom: 16 }}>
          Availability is checked before rescheduling. You'll be notified of conflicts.
        </Text>

        <TouchableOpacity
          style={{
            borderRadius: 12,
            paddingVertical: 14,
            backgroundColor: Colors.primary,
            alignItems: "center",
          }}
          onPress={handleConfirm}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <Text style={{ fontSize: 16, fontWeight: "700", color: Colors.white }}>Confirm Reschedule</Text>
          )}
        </TouchableOpacity>
      </View>
    </BottomSheet>
  );
}
