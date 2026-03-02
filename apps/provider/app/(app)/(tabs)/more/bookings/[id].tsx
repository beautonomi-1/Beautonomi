import { useLocalSearchParams, useRouter } from "expo-router";
import { View, Text, ScrollView } from "react-native";
import { useApi } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";

type BookingDetail = {
  id: string;
  booking_number?: string | null;
  status: string;
  scheduled_at: string;
  total_amount?: number;
  currency?: string;
  customers?: { full_name?: string | null } | null;
  locations?: { name?: string | null } | null;
  address?: { line1?: string; city?: string } | null;
  special_requests?: string | null;
  services?: {
    offering_name?: string;
    staff_name?: string | null;
    scheduled_start_at?: string;
    duration_minutes?: number;
    price?: number;
  }[];
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

export default function BookingDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, loading, error, refresh } = useApi<BookingDetail>(`/api/provider/bookings/${id}`);

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Booking" onBack={() => router.back()} />
        <View className="flex-1 items-center justify-center py-12">
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error || !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Booking" onBack={() => router.back()} />
        <View className="flex-1 justify-center px-4">
          <ErrorState message={error ?? "Booking not found"} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  const b = data as BookingDetail;
  const services = b.services ?? [];
  const customerName = b.customers?.full_name ?? "Guest";
  const locationName = b.locations?.name ?? null;
  const addressLine = b.address
    ? [b.address.line1, b.address.city].filter(Boolean).join(", ")
    : locationName;

  return (
    <ScreenContainer>
      <ScreenHeader
        title={b.booking_number ?? "Booking"}
        subtitle={b.status}
        onBack={() => router.back()}
      />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="rounded-xl border border-gray-200 bg-white p-4 mb-3">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="font-semibold text-gray-900">{customerName}</Text>
            <View className={`rounded-full px-2 py-1 ${statusColor(b.status)}`}>
              <Text className="text-xs font-medium text-gray-800">{b.status}</Text>
            </View>
          </View>
          <Text className="text-sm text-gray-600">
            {b.scheduled_at ? new Date(b.scheduled_at).toLocaleString() : "—"}
          </Text>
          {addressLine ? (
            <Text className="mt-2 text-sm text-gray-500">{addressLine}</Text>
          ) : null}
          {typeof b.total_amount === "number" && (
            <Text className="mt-2 text-base font-medium text-gray-900">
              {b.currency ?? "ZAR"} {b.total_amount.toLocaleString()}
            </Text>
          )}
        </View>

        {services.length > 0 && (
          <View className="mb-3">
            <Text className="text-sm font-medium text-gray-700 mb-2">Services</Text>
            {services.map((s, i) => (
              <View key={i} className="rounded-xl border border-gray-200 bg-white p-3 mb-2">
                <Text className="font-medium text-gray-900">
                  {s.offering_name ?? "Service"}
                </Text>
                {s.staff_name && (
                  <Text className="text-sm text-gray-500">{s.staff_name}</Text>
                )}
                {s.scheduled_start_at && (
                  <Text className="text-xs text-gray-500 mt-1">
                    {new Date(s.scheduled_start_at).toLocaleTimeString()}
                    {s.duration_minutes ? ` · ${s.duration_minutes} min` : ""}
                  </Text>
                )}
                {typeof s.price === "number" && (
                  <Text className="text-sm text-gray-600 mt-1">ZAR {s.price.toLocaleString()}</Text>
                )}
              </View>
            ))}
          </View>
        )}

        {b.special_requests && (
          <View className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <Text className="text-sm font-medium text-gray-700 mb-1">Special requests</Text>
            <Text className="text-sm text-gray-600">{b.special_requests}</Text>
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
