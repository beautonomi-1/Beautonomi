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
import { useResponsive } from "@/hooks/useResponsive";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Colors } from "@/constants/colors";

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
  const { screenPadding } = useResponsive();
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
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 48 }}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Bookings" showBack />
        <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 16 }}>
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  const getStatusStyle = (s: string): { backgroundColor: string; color: string } => {
    switch (s) {
      case "confirmed":
        return { backgroundColor: "#dcfce7", color: "#166534" };
      case "completed":
        return { backgroundColor: Colors.gray[100], color: Colors.gray[800] };
      case "cancelled":
      case "no_show":
        return { backgroundColor: "#fee2e2", color: "#991b1b" };
      case "pending":
        return { backgroundColor: "#fef3c7", color: "#92400e" };
      default:
        return { backgroundColor: Colors.gray[100], color: Colors.gray[700] };
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
            style={{ flexDirection: "row", alignItems: "center", borderRadius: 12, backgroundColor: "#4f46e5", paddingHorizontal: 16, paddingVertical: 8 }}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={{ marginLeft: 6, fontSize: 14, fontWeight: "600", color: Colors.white }}>New</Text>
          </TouchableOpacity>
        }
      />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: screenPadding, paddingBottom: 120 }}
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
            const statusStyle = getStatusStyle(b.status);
            return (
              <TouchableOpacity
                key={b.id}
                onPress={() =>
                  router.push(`/(app)/(tabs)/more/bookings/${b.id}` as never)
                }
                style={{ marginBottom: 12, borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, padding: 16 }}
                activeOpacity={0.7}
              >
                <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: "600", color: Colors.gray[900] }} numberOfLines={1}>
                      {customerName}
                    </Text>
                    <Text style={{ marginTop: 2, fontSize: 14, color: Colors.gray[600] }} numberOfLines={1}>
                      {serviceName}
                    </Text>
                    <Text style={{ marginTop: 4, fontSize: 12, color: Colors.gray[500] }}>{scheduled}</Text>
                    {b.total_amount != null && b.total_amount > 0 && (
                      <Text style={{ marginTop: 2, fontSize: 12, fontWeight: "500", color: Colors.gray[700] }}>
                        R{b.total_amount.toFixed(2)}
                      </Text>
                    )}
                  </View>
                  <View style={[{ borderRadius: 9999, paddingHorizontal: 10, paddingVertical: 4 }, { backgroundColor: statusStyle.backgroundColor }]}>
                    <Text style={{ fontSize: 12, fontWeight: "500", textTransform: "capitalize", color: statusStyle.color }}>
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
