import { useState, useMemo, useEffect } from "react";
import { View, Text, TouchableOpacity, Modal, Pressable, ActivityIndicator } from "react-native";
import { format, isSameDay, startOfMonth, endOfMonth } from "date-fns";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { CALENDAR_ACCENT, CALENDAR_DARK_HEADER } from "@/features/calendar/theme/tokens";
import { formatDateKeyInTimeZone } from "@beautonomi/utils";
import { parseApiDateTime } from "@/components/calendar/calendar-layout";
import { usePagedProviderBookings } from "@/hooks/usePagedProviderBookings";
import type { Booking } from "@/components/calendar/calendar-booking-types";

interface Props {
  visible: boolean;
  monthAnchor: Date;
  locationParam: string;
  timeZone?: string | null;
  onClose: () => void;
  onSelectDate: (d: Date) => void;
}

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

export function CalendarMonthSummary({
  visible,
  monthAnchor,
  locationParam,
  timeZone,
  onClose,
  onSelectDate,
}: Props) {
  const [month, setMonth] = useState(monthAnchor);
  useEffect(() => {
    if (visible) setMonth(monthAnchor);
  }, [visible, monthAnchor]);

  const start = format(startOfMonth(month), "yyyy-MM-dd");
  const end = format(endOfMonth(month), "yyyy-MM-dd");
  const path = `/api/provider/bookings?start_date=${start}&end_date=${end}${locationParam}`;
  const { data: mbBookings, loading } = usePagedProviderBookings<Booking>(path, {
    enabled: visible,
    timeoutMs: 60_000,
  });

  const countByDate = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of mbBookings ?? []) {
      const d = parseApiDateTime(b.scheduled_at);
      if (!d) continue;
      const key = formatDateKeyInTimeZone(d, timeZone);
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    return m;
  }, [mbBookings, timeZone]);

  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const firstDayOfWeek = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.4)" }}
        onPress={onClose}
      >
        <Pressable
          style={{
            marginHorizontal: 16,
            maxWidth: 360,
            width: "100%",
            borderRadius: 16,
            backgroundColor: Colors.white,
            padding: 16,
          }}
          onPress={() => {}}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <TouchableOpacity onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
              <Ionicons name="chevron-back" size={22} color={Colors.gray[900]} />
            </TouchableOpacity>
            <Text style={{ fontSize: 16, fontWeight: "700", color: Colors.gray[900] }}>
              {format(month, "MMMM yyyy")}
            </Text>
            <TouchableOpacity onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
              <Ionicons name="chevron-forward" size={22} color={Colors.gray[900]} />
            </TouchableOpacity>
          </View>
          {loading && (
            <ActivityIndicator size="small" color={Colors.primary} style={{ marginBottom: 8 }} />
          )}
          <View style={{ flexDirection: "row", marginBottom: 4 }}>
            {WEEKDAY_LABELS.map((d, i) => (
              <View key={i} style={{ flex: 1, alignItems: "center" }}>
                <Text style={{ fontSize: 11, fontWeight: "600", color: Colors.gray[400] }}>{d}</Text>
              </View>
            ))}
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {cells.map((day, i) => {
              if (day === null) return <View key={`e-${i}`} style={{ width: "14.28%" }} />;
              const date = new Date(month.getFullYear(), month.getMonth(), day);
              const key = formatDateKeyInTimeZone(date, timeZone);
              const cnt = countByDate.get(key) ?? 0;
              const isToday = isSameDay(date, new Date());
              return (
                <TouchableOpacity
                  key={day}
                  style={{
                    width: "14.28%",
                    alignItems: "center",
                    paddingVertical: 6,
                    borderRadius: 8,
                    backgroundColor: isToday ? Colors.gray[100] : "transparent",
                  }}
                  onPress={() => {
                    onSelectDate(date);
                    onClose();
                  }}
                  accessibilityLabel={`${format(date, "MMMM d")}, ${cnt} appointment${cnt !== 1 ? "s" : ""}`}
                >
                  <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900] }}>{day}</Text>
                  {cnt > 0 && (
                    <View
                      style={{
                        marginTop: 2,
                        minWidth: 18,
                        paddingHorizontal: 4,
                        borderRadius: 8,
                        backgroundColor: CALENDAR_ACCENT,
                      }}
                    >
                      <Text
                        style={{ fontSize: 10, fontWeight: "700", color: CALENDAR_DARK_HEADER, textAlign: "center" }}
                      >
                        {cnt}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity
            style={{
              marginTop: 12,
              alignItems: "center",
              borderRadius: 8,
              backgroundColor: Colors.gray[100],
              paddingVertical: 10,
            }}
            onPress={onClose}
          >
            <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900] }}>Close</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
