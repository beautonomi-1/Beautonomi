import { useCallback, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useApi } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Colors } from "@/constants/colors";

type Booking = {
  id: string;
  ref_number: string | null;
  status: string;
  scheduled_at: string;
  customer_name: string | null;
  location_name: string | null;
  staff_name: string | null;
  total_amount?: number;
  currency?: string;
};

function statusBgColor(status: string): string {
  switch (status) {
    case "confirmed":
    case "booked":
      return "#dbeafe";
    case "in_progress":
    case "started":
      return "#fef3c7";
    case "completed":
      return "#dcfce7";
    case "cancelled":
      return Colors.gray[100];
    case "no_show":
      return "#fee2e2";
    default:
      return Colors.gray[100];
  }
}

export default function BookingsScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const { data, loading, error, refresh } = useApi<Booking[] | { data?: Booking[] }>(
    "/api/provider/bookings?limit=50"
  );

  const bookings: Booking[] = Array.isArray(data) ? data : (data as { data?: Booking[] })?.data ?? [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const onBookingPress = useCallback(
    (bookingId: string) => {
      router.push(`/(app)/(tabs)/more/bookings/${bookingId}` as never);
    },
    [router]
  );

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Bookings" onBack={() => router.back()} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 48 }}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Bookings" onBack={() => router.back()} />
        <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 16 }}>
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader
        title="Bookings & calendar"
        subtitle="Appointments & schedule"
        onBack={() => router.back()}
        rightAction={
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <TouchableOpacity
              onPress={() => router.replace("/(app)/(tabs)/calendar" as never)}
              style={{ flexDirection: "row", alignItems: "center", borderRadius: 10, backgroundColor: Colors.gray[100], paddingHorizontal: 12, paddingVertical: 8 }}
            >
              <Ionicons name="calendar-outline" size={18} color={Colors.gray[700]} />
              <Text style={{ marginLeft: 6, fontSize: 14, fontWeight: "600", color: Colors.gray[800] }}>Calendar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push("/(app)/(tabs)/more/bookings/new" as never)}
              style={{ flexDirection: "row", alignItems: "center", borderRadius: 10, backgroundColor: "#4f46e5", paddingHorizontal: 12, paddingVertical: 8 }}
            >
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={{ marginLeft: 6, fontSize: 14, fontWeight: "600", color: "#fff" }}>New</Text>
            </TouchableOpacity>
          </View>
        }
      />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {bookings.length === 0 ? (
          <View style={{ paddingVertical: 48, paddingHorizontal: 16, alignItems: "center" }}>
            <Ionicons name="calendar-outline" size={48} color="#9ca3af" />
            <Text style={{ marginTop: 16, textAlign: "center", color: Colors.gray[600] }}>No bookings yet</Text>
            <Text style={{ marginTop: 8, textAlign: "center", fontSize: 14, color: Colors.gray[500] }}>
              Appointments will appear here
            </Text>
          </View>
        ) : (
          <View style={{ paddingBottom: 16 }}>
            {bookings.map((b) => (
              <TouchableOpacity
                key={b.id}
                onPress={() => onBookingPress(b.id)}
                activeOpacity={0.7}
                style={{ marginBottom: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, padding: 16 }}
                accessibilityLabel={`Booking: ${b.customer_name || "Guest"}, ${b.scheduled_at ? new Date(b.scheduled_at).toLocaleString() : "no date"}, ${b.status}`}
                accessibilityRole="button"
              >
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <Text style={{ fontWeight: "600", color: Colors.gray[900] }} numberOfLines={1}>
                    {b.customer_name || "Guest"}
                  </Text>
                  <View style={{ borderRadius: 9999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: statusBgColor(b.status) }}>
                    <Text style={{ fontSize: 12, fontWeight: "500", color: Colors.gray[800] }}>{b.status}</Text>
                  </View>
                </View>
                <Text style={{ fontSize: 14, color: Colors.gray[600] }}>
                  {b.scheduled_at ? new Date(b.scheduled_at).toLocaleString() : "—"}
                </Text>
                {(b.location_name || b.staff_name) && (
                  <Text style={{ marginTop: 4, fontSize: 12, color: Colors.gray[500] }}>
                    {[b.location_name, b.staff_name].filter(Boolean).join(" · ")}
                  </Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
