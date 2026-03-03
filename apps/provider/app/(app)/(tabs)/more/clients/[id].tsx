import { useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useApi } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Avatar } from "@/components/ui/Avatar";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { formatCurrency, formatDate, formatTime } from "@/lib/format";

interface ClientCustomer {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
}

interface HistoryItem {
  id: string;
  type: "appointment" | "sale";
  date: string;
  description: string;
  amount: number;
  team_member_name?: string | null;
  status?: string;
  booking_number?: string;
  scheduled_at?: string;
}

interface ClientDetail {
  id: string;
  customer_id: string;
  customer: ClientCustomer;
  notes: string | null;
  total_bookings: number;
  total_spent: number;
  history: HistoryItem[];
}

const STATUS_COLORS: Record<string, string> = {
  completed: "text-green-600",
  confirmed: "text-blue-600",
  booked: "text-amber-600",
  pending: "text-amber-600",
  started: "text-pink-600",
  in_progress: "text-pink-600",
  cancelled: "text-red-600",
  no_show: "text-red-600",
};

export default function ClientDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const clientId = typeof id === "string" ? id : Array.isArray(id) ? id[0] : undefined;

  const {
    data: client,
    loading,
    error,
    refresh,
  } = useApi<ClientDetail>(`/api/provider/clients/${clientId}`, {
    enabled: !!clientId,
  });

  const onRefresh = useCallback(() => {
    refresh();
  }, [refresh]);

  const goBackToClients = useCallback(() => {
    router.replace("/(app)/(tabs)/clients" as never);
  }, [router]);

  if (loading && !client) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Client" showBack onBack={goBackToClients} />
        <View className="flex-1 items-center justify-center py-12">
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !client) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Client" showBack onBack={goBackToClients} />
        <View className="flex-1 justify-center px-4">
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  if (!client) return null;

  const customer = client.customer ?? {};
  const name = customer.full_name ?? "Client";
  const history = client.history ?? [];

  return (
    <ScreenContainer
      scrollable={false}
      refreshing={false}
      onRefresh={onRefresh}
    >
      <ScreenHeader title="Client" showBack onBack={goBackToClients} />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor="#1a1f3c" />
        }
      >
        {/* Client info */}
        <View className="mb-4 rounded-2xl border border-gray-100 bg-white p-4">
          <View className="flex-row items-center">
            <Avatar name={name} size="lg" />
            <View className="ml-4 flex-1">
              <Text className="text-lg font-semibold text-gray-900">{name}</Text>
              {customer.phone ? (
                <Text className="text-sm text-gray-500">{customer.phone}</Text>
              ) : null}
              {customer.email ? (
                <Text className="text-sm text-gray-500">{customer.email}</Text>
              ) : null}
            </View>
          </View>
          <View className="mt-3 flex-row gap-4 border-t border-gray-100 pt-3">
            <View>
              <Text className="text-xs text-gray-400">Bookings</Text>
              <Text className="text-sm font-semibold text-gray-900">{client.total_bookings}</Text>
            </View>
            <View>
              <Text className="text-xs text-gray-400">Total spent</Text>
              <Text className="text-sm font-semibold text-gray-900">
                {formatCurrency(client.total_spent, "ZAR")}
              </Text>
            </View>
          </View>
        </View>

        {/* Booking history */}
        <View className="rounded-2xl border border-gray-100 bg-white">
          <View className="border-b border-gray-100 px-4 py-3">
            <Text className="text-sm font-semibold text-gray-900">Booking history</Text>
            <Text className="text-xs text-gray-500">
              {history.length} {history.length === 1 ? "item" : "items"}
            </Text>
          </View>
          {history.length === 0 ? (
            <View className="items-center justify-center py-12 px-4">
              <Ionicons name="calendar-outline" size={40} color="#9ca3af" />
              <Text className="mt-2 text-sm text-gray-500">No bookings yet</Text>
            </View>
          ) : (
            history.map((item) => {
              const isAppointment = item.type === "appointment";
              const statusColor = item.status ? STATUS_COLORS[item.status] ?? "text-gray-600" : "text-gray-600";
              return (
                <TouchableOpacity
                  key={`${item.type}-${item.id}`}
                  onPress={() => {
                    if (isAppointment) {
                      router.push(`/(app)/(tabs)/more/bookings/${item.id}` as never);
                    }
                  }}
                  disabled={!isAppointment}
                  activeOpacity={isAppointment ? 0.7 : 1}
                  className="flex-row items-center border-b border-gray-50 px-4 py-3 last:border-b-0"
                >
                  <View
                    className={`mr-3 h-10 w-10 items-center justify-center rounded-full ${
                      isAppointment ? "bg-indigo-50" : "bg-emerald-50"
                    }`}
                  >
                    <Ionicons
                      name={isAppointment ? "calendar" : "receipt"}
                      size={20}
                      color={isAppointment ? "#6366f1" : "#10b981"}
                    />
                  </View>
                  <View className="flex-1 min-w-0">
                    <Text className="text-sm font-medium text-gray-900" numberOfLines={1}>
                      {item.description}
                    </Text>
                    <View className="mt-0.5 flex-row flex-wrap items-center gap-2">
                      <Text className="text-xs text-gray-500">
                        {formatDate(item.scheduled_at ?? item.date, "MMM d, yyyy")}
                        {item.scheduled_at ? ` at ${formatTime(item.scheduled_at)}` : ""}
                      </Text>
                      {item.status ? (
                        <Text className={`text-xs font-medium capitalize ${statusColor}`}>
                          {item.status.replace(/_/g, " ")}
                        </Text>
                      ) : null}
                      {item.team_member_name ? (
                        <Text className="text-xs text-gray-500">with {item.team_member_name}</Text>
                      ) : null}
                    </View>
                  </View>
                  <Text className="ml-2 text-sm font-semibold text-gray-900">
                    {formatCurrency(item.amount, "ZAR")}
                  </Text>
                  {isAppointment ? (
                    <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
                  ) : null}
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
