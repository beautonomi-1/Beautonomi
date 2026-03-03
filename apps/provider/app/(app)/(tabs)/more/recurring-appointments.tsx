import { useCallback, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { BottomSheet } from "@/components/ui/BottomSheet";

interface RecurringAppointment {
  id: string;
  provider_id: string;
  customer_id: string;
  service_id: string | null;
  staff_id: string | null;
  recurrence_rule: string;
  start_date: string;
  end_date: string | null;
  start_time: string;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  customer?: { full_name?: string | null };
  service?: { title?: string | null };
}

interface RecurringListResponse {
  data: RecurringAppointment[];
  total: number;
  page: number;
  total_pages: number;
}

export default function RecurringAppointmentsScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [viewItem, setViewItem] = useState<RecurringAppointment | null>(null);

  const { data, loading, error, refresh } =
    useApi<RecurringListResponse>("/api/provider/recurring-appointments?limit=50");
  const { execute: deleteRecurring } = useApiMutation("delete");

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const list = data?.data ?? [];
  const total = data?.total ?? list.length;

  const openView = useCallback((item: RecurringAppointment) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setViewItem(item);
  }, []);

  const handleDelete = useCallback(
    (item: RecurringAppointment) => {
      Alert.alert(
        "Delete recurring appointment",
        "Remove this recurring appointment?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              const { error: err } = await deleteRecurring(
                `/api/provider/recurring-appointments/${item.id}`,
                {}
              );
              if (err) {
                Alert.alert("Error", err);
              } else {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                setViewItem(null);
                refresh();
              }
            },
          },
        ]
      );
    },
    [deleteRecurring, refresh]
  );

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Recurring Appointments" showBack />
        <View className="flex-1 items-center justify-center py-12">
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    const is403 = error.toLowerCase().includes("subscription") || error.toLowerCase().includes("upgrade");
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Recurring Appointments" showBack />
        <View className="flex-1 justify-center px-4">
          <ErrorState
            message={is403 ? "This feature requires a Starter plan or higher." : error}
            onRetry={is403 ? undefined : refresh}
          />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title="Recurring Appointments"
        showBack
        subtitle={total > 0 ? `${total} recurring` : undefined}
      />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {list.length === 0 ? (
          <EmptyState
            icon="repeat-outline"
            title="No recurring appointments"
            description="Recurring appointments let you set up repeating client schedules. Create them from the portal or when booking."
          />
        ) : (
          list.map((item) => (
            <TouchableOpacity
              key={item.id}
              onPress={() => openView(item)}
              activeOpacity={0.7}
              className="mb-3 flex-row items-center rounded-2xl border border-gray-200 bg-white p-4"
            >
              <View className="h-10 w-10 items-center justify-center rounded-xl bg-violet-100">
                <Ionicons name="repeat-outline" size={20} color="#8b5cf6" />
              </View>
              <View className="ml-3 flex-1">
                <Text className="text-base font-semibold text-gray-900" numberOfLines={1}>
                  {item.customer?.full_name ?? "Client"}
                </Text>
                <Text className="mt-0.5 text-sm text-gray-600" numberOfLines={1}>
                  {item.recurrence_rule}
                </Text>
                <Text className="mt-0.5 text-xs text-gray-500">
                  {item.start_date} · {item.start_time.slice(0, 5)}
                  {item.service?.title ? ` · ${item.service.title}` : ""}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {viewItem && (
        <BottomSheet
          visible={!!viewItem}
          onClose={() => setViewItem(null)}
          title="Recurring appointment"
          subtitle={viewItem.customer?.full_name ?? "Client"}
        >
          <View className="mb-3 rounded-xl bg-gray-50 p-3">
            <Text className="text-xs font-medium text-gray-500">Rule</Text>
            <Text className="text-sm text-gray-900">{viewItem.recurrence_rule}</Text>
          </View>
          <View className="mb-3 rounded-xl bg-gray-50 p-3">
            <Text className="text-xs font-medium text-gray-500">Start</Text>
            <Text className="text-sm text-gray-900">
              {viewItem.start_date} at {viewItem.start_time.slice(0, 5)}
            </Text>
          </View>
          {viewItem.end_date ? (
            <View className="mb-3 rounded-xl bg-gray-50 p-3">
              <Text className="text-xs font-medium text-gray-500">End date</Text>
              <Text className="text-sm text-gray-900">{viewItem.end_date}</Text>
            </View>
          ) : null}
          {viewItem.notes ? (
            <View className="mb-4 rounded-xl bg-gray-50 p-3">
              <Text className="text-xs font-medium text-gray-500">Notes</Text>
              <Text className="text-sm text-gray-900">{viewItem.notes}</Text>
            </View>
          ) : null}
          <TouchableOpacity
            onPress={() => viewItem && handleDelete(viewItem)}
            className="flex-row items-center justify-center rounded-xl border border-red-200 bg-red-50 py-3"
          >
            <Ionicons name="trash-outline" size={18} color="#dc2626" />
            <Text className="ml-2 text-sm font-medium text-red-600">Delete recurring</Text>
          </TouchableOpacity>
        </BottomSheet>
      )}
    </ScreenContainer>
  );
}
