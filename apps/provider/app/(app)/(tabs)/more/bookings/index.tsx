import { useCallback, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { useApi } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";

interface BookingCustomer {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
}

interface BookingService {
  id: string;
  name?: string;
  offering_name?: string;
  duration_minutes?: number;
  price?: number;
  staff_name?: string | null;
}

interface Booking {
  id: string;
  booking_number: string | null;
  status: string;
  scheduled_at: string | null;
  total_amount: number | null;
  customers?: BookingCustomer | null;
  services?: BookingService[];
}

export default function BookingsListScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const now = new Date();
  const start = format(startOfMonth(now), "yyyy-MM-dd");
  const end = format(endOfMonth(now), "yyyy-MM-dd");
  const url = `/api/provider/bookings?start_date=${start}&end_date=${end}`;
  const { data, loading, error, refresh } = useApi<Booking[]>(url);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const bookings: Booking[] = Array.isArray(data) ? data : [];

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Bookings" showBack />
        <View className="flex-1 items-center justify-center py-12">
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Bookings" showBack />
        <View className="flex-1 justify-center px-4">
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  const statusColor = (s: string) => {
    switch (s) {
      case "confirmed":
        return "bg-green-100 text-green-800";
      case "completed":
        return "bg-gray-100 text-gray-800";
      case "cancelled":
      case "no_show":
        return "bg-red-100 text-red-800";
      case "pending":
        return "bg-amber-100 text-amber-800";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title="Bookings"
        showBack
        subtitle={`${format(now, "MMMM yyyy")} · ${bookings.length}`}
        rightAction={
          <TouchableOpacity
            onPress={() => router.push("/(app)/(tabs)/more/bookings/new" as never)}
            className="flex-row items-center rounded-xl bg-indigo-600 px-4 py-2"
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text className="ml-1.5 text-sm font-semibold text-white">New</Text>
          </TouchableOpacity>
        }
      />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {bookings.length === 0 ? (
          <EmptyState
            icon="book-outline"
            title="No bookings this month"
            description="Create a new booking to get started."
            actionLabel="New booking"
            onAction={() => router.push("/(app)/(tabs)/more/bookings/new" as never)}
          />
        ) : (
          bookings.map((b) => {
            const customerName = b.customers?.full_name || "Customer";
            const serviceName = b.services?.[0]?.name ?? b.services?.[0]?.offering_name ?? "Booking";
            const scheduled = b.scheduled_at
              ? new Date(b.scheduled_at).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "—";
            return (
              <TouchableOpacity
                key={b.id}
                onPress={() =>
                  router.push(`/(app)/(tabs)/more/bookings/${b.id}` as never)
                }
                className="mb-3 rounded-2xl border border-gray-200 bg-white p-4"
                activeOpacity={0.7}
              >
                <View className="flex-row items-start justify-between">
                  <View className="flex-1">
                    <Text className="text-base font-semibold text-gray-900" numberOfLines={1}>
                      {customerName}
                    </Text>
                    <Text className="mt-0.5 text-sm text-gray-600" numberOfLines={1}>
                      {serviceName}
                    </Text>
                    <Text className="mt-1 text-xs text-gray-500">{scheduled}</Text>
                    {b.total_amount != null && b.total_amount > 0 && (
                      <Text className="mt-0.5 text-xs font-medium text-gray-700">
                        R{b.total_amount.toFixed(2)}
                      </Text>
                    )}
                  </View>
                  <View className={`rounded-full px-2.5 py-1 ${statusColor(b.status)}`}>
                    <Text className="text-xs font-medium capitalize">
                      {b.status.replace("_", " ")}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
