import { useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ChipCombobox } from "@/components/ui/ChipCombobox";
import { Avatar } from "@/components/ui/Avatar";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { formatCurrency, formatDate, formatTime } from "@/lib/format";
import { twStyle } from "@/lib/twStyle";

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
  tags?: string[] | null;
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
  const { execute: patchClient } = useApiMutation("patch");

  const onRefresh = useCallback(() => {
    refresh();
  }, [refresh]);

  const goBackToClients = useCallback(() => {
    router.replace("/(app)/(tabs)/clients" as never);
  }, [router]);

  const handleTagsChange = useCallback(
    async (tags: string[]) => {
      if (!clientId) return;
      const { error: err } = await patchClient(`/api/provider/clients/${clientId}`, { tags });
      if (err) {
        Alert.alert("Error", err);
        return;
      }
      refresh();
    },
    [clientId, patchClient, refresh]
  );

  if (loading && !client) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Client" showBack onBack={goBackToClients} />
        <View style={twStyle("flex-1 items-center justify-center py-12")}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !client) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Client" showBack onBack={goBackToClients} />
        <View style={twStyle("flex-1 justify-center px-4")}>
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  if (!client) return null;

  const customer = client.customer ?? {};
  const name = customer.full_name ?? "Client";
  const history = client.history ?? [];
  const clientTags = client.tags ?? [];

  return (
    <ScreenContainer
      scrollable={false}
      refreshing={false}
      onRefresh={onRefresh}
    >
      <ScreenHeader title="Client" showBack onBack={goBackToClients} />

      <ScrollView
        style={twStyle("flex-1")}
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor="#1a1f3c" />
        }
      >
        {/* Client info */}
        <View style={twStyle("mb-4 rounded-2xl border border-gray-100 bg-white p-4")}>
          <View style={twStyle("flex-row items-center")}>
            <Avatar name={name} size="lg" />
            <View style={twStyle("ml-4 flex-1")}>
              <Text style={twStyle("text-lg font-semibold text-gray-900")}>{name}</Text>
              {customer.phone ? (
                <Text style={twStyle("text-sm text-gray-500")}>{customer.phone}</Text>
              ) : null}
              {customer.email ? (
                <Text style={twStyle("text-sm text-gray-500")}>{customer.email}</Text>
              ) : null}
            </View>
          </View>
          <View style={twStyle("mt-3 flex-row border-t border-gray-100 pt-3")}>
            <View style={{ marginRight: 16 }}>
              <Text style={twStyle("text-xs text-gray-400")}>Bookings</Text>
              <Text style={twStyle("text-sm font-semibold text-gray-900")}>{client.total_bookings}</Text>
            </View>
            <View>
              <Text style={twStyle("text-xs text-gray-400")}>Total spent</Text>
              <Text style={twStyle("text-sm font-semibold text-gray-900")}>
                {formatCurrency(client.total_spent, "ZAR")}
              </Text>
            </View>
          </View>

          <View style={twStyle("mt-3 border-t border-gray-100 pt-3")}>
            <Text style={twStyle("mb-1 text-xs font-medium text-gray-500")}>Tags</Text>
            <ChipCombobox
              value={clientTags}
              onChange={handleTagsChange}
              staticSuggestions={[
                { value: "VIP", label: "VIP" },
                { value: "Regular", label: "Regular" },
                { value: "New", label: "New" },
              ]}
              placeholder="Add tags (e.g. VIP, Regular)"
              accessibilityLabel="Client tags"
            />
          </View>
        </View>

        {/* Booking history */}
        <View style={twStyle("rounded-2xl border border-gray-100 bg-white")}>
          <View style={twStyle("border-b border-gray-100 px-4 py-3")}>
            <Text style={twStyle("text-sm font-semibold text-gray-900")}>Booking history</Text>
            <Text style={twStyle("text-xs text-gray-500")}>
              {history.length} {history.length === 1 ? "item" : "items"}
            </Text>
          </View>
          {history.length === 0 ? (
            <View style={twStyle("items-center justify-center py-12 px-4")}>
              <Ionicons name="calendar-outline" size={40} color="#9ca3af" />
              <Text style={twStyle("mt-2 text-sm text-gray-500")}>No bookings yet</Text>
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
                  style={twStyle("flex-row items-center border-b border-gray-50 px-4 py-3 last:border-b-0")}
                >
                  <View
                    style={twStyle(`mr-3 h-10 w-10 items-center justify-center rounded-full ${
                      isAppointment ? "bg-indigo-50" : "bg-emerald-50"
                    }`)}
                  >
                    <Ionicons
                      name={isAppointment ? "calendar" : "receipt"}
                      size={20}
                      color={isAppointment ? "#6366f1" : "#10b981"}
                    />
                  </View>
                  <View style={twStyle("flex-1 min-w-0")}>
                    <Text style={twStyle("text-sm font-medium text-gray-900")} numberOfLines={1}>
                      {item.description}
                    </Text>
                    <View style={twStyle("mt-0.5 flex-row flex-wrap items-center")}>
                      <Text style={[twStyle("text-xs text-gray-500"), { marginRight: 8 }]}>
                        {formatDate(item.scheduled_at ?? item.date, "MMM d, yyyy")}
                        {item.scheduled_at ? ` at ${formatTime(item.scheduled_at)}` : ""}
                      </Text>
                      {item.status ? (
                        <Text style={[twStyle(`text-xs font-medium capitalize ${statusColor}`), { marginRight: 8 }]}>
                          {item.status.replace(/_/g, " ")}
                        </Text>
                      ) : null}
                      {item.team_member_name ? (
                        <Text style={twStyle("text-xs text-gray-500")}>with {item.team_member_name}</Text>
                      ) : null}
                    </View>
                  </View>
                  <Text style={twStyle("ml-2 text-sm font-semibold text-gray-900")}>
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
