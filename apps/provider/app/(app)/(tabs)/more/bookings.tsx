import { useCallback, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useApi } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";

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

function statusColor(status: string): string {
  switch (status) {
    case "confirmed":
    case "booked":
      return "bg-blue-100";
    case "in_progress":
    case "started":
      return "bg-amber-100";
    case "completed":
      return "bg-green-100";
    case "cancelled":
      return "bg-gray-100";
    case "no_show":
      return "bg-red-100";
    default:
      return "bg-gray-100";
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
        <View className="flex-1 items-center justify-center py-12">
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Bookings" onBack={() => router.back()} />
        <View className="flex-1 justify-center px-4">
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader title="Bookings & calendar" subtitle="Appointments & schedule" onBack={() => router.back()} />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {bookings.length === 0 ? (
          <View className="py-12 px-4 items-center">
            <Ionicons name="calendar-outline" size={48} color="#9ca3af" />
            <Text className="mt-4 text-center text-gray-600">No bookings yet</Text>
            <Text className="mt-2 text-center text-sm text-gray-500">
              Appointments will appear here
            </Text>
          </View>
        ) : (
          <View className="pb-4">
            {bookings.map((b) => (
              <TouchableOpacity
                key={b.id}
                onPress={() => onBookingPress(b.id)}
                activeOpacity={0.7}
                className="mb-3 rounded-xl border border-gray-200 bg-white p-4"
                accessibilityLabel={`Booking: ${b.customer_name || "Guest"}, ${b.scheduled_at ? new Date(b.scheduled_at).toLocaleString() : "no date"}, ${b.status}`}
                accessibilityRole="button"
              >
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="font-semibold text-gray-900" numberOfLines={1}>
                    {b.customer_name || "Guest"}
                  </Text>
                  <View className={`rounded-full px-2 py-0.5 ${statusColor(b.status)}`}>
                    <Text className="text-xs font-medium text-gray-800">{b.status}</Text>
                  </View>
                </View>
                <Text className="text-sm text-gray-600">
                  {b.scheduled_at ? new Date(b.scheduled_at).toLocaleString() : "—"}
                </Text>
                {(b.location_name || b.staff_name) && (
                  <Text className="mt-1 text-xs text-gray-500">
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
