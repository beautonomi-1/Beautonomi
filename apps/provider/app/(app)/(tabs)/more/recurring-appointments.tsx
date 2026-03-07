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
import { useResponsive } from "@/hooks/useResponsive";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Colors } from "@/constants/colors";

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
  const { screenPadding } = useResponsive();
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
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 48 }}>
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
        <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 16 }}>
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
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: screenPadding, paddingBottom: 120 }}
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
              style={{ marginBottom: 12, flexDirection: "row", alignItems: "center", borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, padding: 16 }}
            >
              <View style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#ede9fe" }}>
                <Ionicons name="repeat-outline" size={20} color="#8b5cf6" />
              </View>
              <View style={{ marginLeft: 12, flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: "600", color: Colors.gray[900] }} numberOfLines={1}>
                  {item.customer?.full_name ?? "Client"}
                </Text>
                <Text style={{ marginTop: 2, fontSize: 14, color: Colors.gray[600] }} numberOfLines={1}>
                  {item.recurrence_rule}
                </Text>
                <Text style={{ marginTop: 2, fontSize: 12, color: Colors.gray[500] }}>
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
          <View style={{ marginBottom: 12, borderRadius: 12, backgroundColor: Colors.gray[50], padding: 12 }}>
            <Text style={{ fontSize: 12, fontWeight: "500", color: Colors.gray[500] }}>Rule</Text>
            <Text style={{ fontSize: 14, color: Colors.gray[900] }}>{viewItem.recurrence_rule}</Text>
          </View>
          <View style={{ marginBottom: 12, borderRadius: 12, backgroundColor: Colors.gray[50], padding: 12 }}>
            <Text style={{ fontSize: 12, fontWeight: "500", color: Colors.gray[500] }}>Start</Text>
            <Text style={{ fontSize: 14, color: Colors.gray[900] }}>
              {viewItem.start_date} at {viewItem.start_time.slice(0, 5)}
            </Text>
          </View>
          {viewItem.end_date ? (
            <View style={{ marginBottom: 12, borderRadius: 12, backgroundColor: Colors.gray[50], padding: 12 }}>
              <Text style={{ fontSize: 12, fontWeight: "500", color: Colors.gray[500] }}>End date</Text>
              <Text style={{ fontSize: 14, color: Colors.gray[900] }}>{viewItem.end_date}</Text>
            </View>
          ) : null}
          {viewItem.notes ? (
            <View style={{ marginBottom: 16, borderRadius: 12, backgroundColor: Colors.gray[50], padding: 12 }}>
              <Text style={{ fontSize: 12, fontWeight: "500", color: Colors.gray[500] }}>Notes</Text>
              <Text style={{ fontSize: 14, color: Colors.gray[900] }}>{viewItem.notes}</Text>
            </View>
          ) : null}
          <TouchableOpacity
            onPress={() => viewItem && handleDelete(viewItem)}
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 12, borderWidth: 1, borderColor: "#fecaca", backgroundColor: "#fef2f2", paddingVertical: 12 }}
          >
            <Ionicons name="trash-outline" size={18} color="#dc2626" />
            <Text style={{ marginLeft: 8, fontSize: 14, fontWeight: "500", color: "#dc2626" }}>Delete recurring</Text>
          </TouchableOpacity>
        </BottomSheet>
      )}
    </ScreenContainer>
  );
}
