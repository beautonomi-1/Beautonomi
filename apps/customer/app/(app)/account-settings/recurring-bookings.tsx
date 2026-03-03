import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from "react-native";
import { api } from "@/lib/api-client";
import { Colors } from "@/constants/colors";
import { SCREEN_PADDING, STACK_CONTENT_PADDING_BOTTOM } from "@/constants/layout";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface RecurringBooking {
  id: string;
  service_name: string;
  provider_name: string;
  frequency: string;
  next_date: string;
  price: number;
  currency: string;
  status: "active" | "paused" | "cancelled";
}

interface RecurringBookingsResponse {
  recurring: RecurringBooking[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-ZA", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function statusColor(status: RecurringBooking["status"]): {
  bg: string;
  text: string;
} {
  switch (status) {
    case "active":
      return { bg: "bg-green-100", text: "text-green-800" };
    case "paused":
      return { bg: "bg-yellow-100", text: "text-yellow-800" };
    case "cancelled":
      return { bg: "bg-red-100", text: "text-red-800" };
    default:
      return { bg: "bg-gray-100", text: "text-gray-800" };
  }
}

/* ------------------------------------------------------------------ */
/*  Screen                                                             */
/* ------------------------------------------------------------------ */

export default function RecurringBookingsScreen() {
  const [bookings, setBookings] = useState<RecurringBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await api.get<RecurringBookingsResponse>("/api/recurring-bookings");
      if (res.error) {
        setError(res.error.message || "Failed to load recurring bookings");
        setBookings([]);
      } else {
        const data = res.data;
        const items = Array.isArray(data)
          ? (data as unknown as RecurringBooking[])
          : data?.recurring ?? [];
        setBookings(items);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load recurring bookings");
      setBookings([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.get<RecurringBookingsResponse>("/api/recurring-bookings");
        if (cancelled) return;
        if (res.error) {
          setError(res.error.message || "Failed to load recurring bookings");
          setBookings([]);
        } else {
          const data = res.data;
          const items = Array.isArray(data)
            ? (data as unknown as RecurringBooking[])
            : data?.recurring ?? [];
          setBookings(items);
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load recurring bookings");
        setBookings([]);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchData();
    return () => {
      cancelled = true;
    };
  }, []);

  const cancelBooking = useCallback(
    (booking: RecurringBooking) => {
      Alert.alert(
        "Cancel Recurring Booking",
        `Are you sure you want to cancel "${booking.service_name}" with ${booking.provider_name}?`,
        [
          { text: "Keep", style: "cancel" },
          {
            text: "Cancel Booking",
            style: "destructive",
            onPress: async () => {
              setCancellingId(booking.id);
              try {
                const res = await api.delete(`/api/recurring-bookings/${booking.id}`);
                if (res.error) {
                  Alert.alert("Error", res.error.message || "Failed to cancel booking");
                } else {
                  setBookings((prev) => prev.filter((b) => b.id !== booking.id));
                }
              } catch {
                Alert.alert("Error", "Failed to cancel booking. Please try again.");
              } finally {
                setCancellingId(null);
              }
            },
          },
        ],
      );
    },
    [],
  );

  const renderItem = useCallback(
    ({ item }: { item: RecurringBooking }) => {
      const badge = statusColor(item.status);
      const isCancelling = cancellingId === item.id;

      return (
        <View className="bg-white rounded-xl p-4 mb-3 border border-gray-100">
          {/* Header: service name + status */}
          <View className="flex-row justify-between items-start mb-2">
            <Text className="font-semibold text-gray-900 flex-1 mr-2">
              {item.service_name}
            </Text>
            <View className={`px-2.5 py-0.5 rounded-full ${badge.bg}`}>
              <Text className={`text-xs font-medium capitalize ${badge.text}`}>
                {item.status}
              </Text>
            </View>
          </View>

          {/* Provider */}
          <Text className="text-sm text-gray-600 mb-1">{item.provider_name}</Text>

          {/* Frequency + next date */}
          <View className="flex-row justify-between items-center mt-2">
            <View>
              <Text className="text-xs text-gray-500">Frequency</Text>
              <Text className="text-sm font-medium text-gray-800">{item.frequency}</Text>
            </View>
            <View className="items-end">
              <Text className="text-xs text-gray-500">Next appointment</Text>
              <Text className="text-sm font-medium text-gray-800">
                {formatDate(item.next_date)}
              </Text>
            </View>
          </View>

          {/* Price + cancel */}
          <View className="flex-row justify-between items-center mt-3 pt-3 border-t border-gray-100">
            <Text className="font-semibold text-gray-900">
              {item.currency ?? "ZAR"} {item.price?.toFixed(2)}
            </Text>
            {item.status !== "cancelled" && (
              <TouchableOpacity
                onPress={() => cancelBooking(item)}
                disabled={isCancelling}
                className="px-4 py-2 rounded-lg border border-red-200 bg-red-50"
              >
                {isCancelling ? (
                  <ActivityIndicator size="small" color={Colors.error} />
                ) : (
                  <Text className="text-sm font-medium text-red-600">Cancel</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      );
    },
    [cancellingId, cancelBooking],
  );

  /* ---- Loading state ---- */
  if (loading && bookings.length === 0) {
    return (
      <View className="flex-1 bg-white items-center justify-center p-6">
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text className="text-gray-600 mt-4">Loading...</Text>
      </View>
    );
  }

  /* ---- Error state ---- */
  if (error && bookings.length === 0) {
    return (
      <View className="flex-1 bg-white items-center justify-center p-6">
        <Text className="text-center text-gray-700 mb-4">{error}</Text>
        <TouchableOpacity
          onPress={() => load()}
          className="bg-primary px-6 py-3 rounded-xl"
        >
          <Text className="text-white font-semibold">Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  /* ---- Empty state ---- */
  if (bookings.length === 0) {
    return (
      <View className="flex-1 bg-white items-center justify-center p-6">
        <Text className="text-center font-semibold text-gray-900 mb-2">
          No recurring bookings yet
        </Text>
        <Text className="text-center text-gray-500">
          Set up recurring appointments from any booking detail page
        </Text>
      </View>
    );
  }

  /* ---- List ---- */
  return (
    <View className="flex-1 bg-white">
      <FlatList
        data={bookings}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{
          padding: SCREEN_PADDING,
          paddingBottom: STACK_CONTENT_PADDING_BOTTOM,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}
