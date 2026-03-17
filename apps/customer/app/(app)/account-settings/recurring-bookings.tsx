import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
  ActivityIndicator,
  Platform,
} from "react-native";
import { api } from "@/lib/api-client";
import { useResponsive } from "@/hooks/useResponsive";
import { Colors } from "@/constants/colors";
import { STACK_CONTENT_PADDING_BOTTOM } from "@/constants/layout";

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

function statusStyle(status: RecurringBooking["status"]): { bg: string; text: string } {
  switch (status) {
    case "active":
      return { bg: "#DCFCE7", text: "#166534" };
    case "paused":
      return { bg: "#FEF9C3", text: "#854D0E" };
    case "cancelled":
      return { bg: "#FEE2E2", text: "#991B1B" };
    default:
      return { bg: Colors.gray[100], text: Colors.gray[800] };
  }
}

/** Map API row (enriched or raw) to RecurringBooking for display. */
function normalizeRecurringItem(row: any): RecurringBooking {
  const provider = row.provider;
  const providerName = row.provider_name ?? provider?.business_name ?? "Provider";
  const serviceName = row.service_name ?? "Recurring appointment";
  const nextDate = row.next_date ?? row.start_date ?? new Date().toISOString().split("T")[0];
  let status: RecurringBooking["status"] = "active";
  if (row.status === "cancelled" || row.status === "paused") status = row.status;
  else if (row.is_active === false) status = "paused";
  const price = typeof row.price === "number" ? row.price : 0;
  const currency = row.currency ?? "ZAR";
  return {
    id: row.id,
    service_name: serviceName,
    provider_name: providerName,
    frequency: row.frequency ?? "weekly",
    next_date: nextDate,
    price,
    currency,
    status,
  };
}

/* ------------------------------------------------------------------ */
/*  Screen                                                             */
/* ------------------------------------------------------------------ */

export default function RecurringBookingsScreen() {
  const { contentPadding, contentMaxWidth, isTablet } = useResponsive();
  const constraint = (isTablet || Platform.OS === "web") ? { maxWidth: contentMaxWidth, alignSelf: "center" as const, width: "100%" as const } : {};
  const [bookings, setBookings] = useState<RecurringBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

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
        const raw = Array.isArray(data) ? (data as unknown as any[]) : data?.recurring ?? [];
        const items = (Array.isArray(raw) ? raw : []).map(normalizeRecurringItem);
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
          const raw = Array.isArray(data) ? (data as unknown as any[]) : data?.recurring ?? [];
          const items = (Array.isArray(raw) ? raw : []).map(normalizeRecurringItem);
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

  const togglePauseResume = useCallback(
    async (booking: RecurringBooking) => {
      if (booking.status === "cancelled") return;
      setTogglingId(booking.id);
      try {
        const res = await api.patch(`/api/recurring-bookings/${booking.id}`, {
          is_active: booking.status === "paused",
        });
        if (res.error) {
          Alert.alert("Error", res.error.message || "Failed to update");
        } else {
          setBookings((prev) =>
            prev.map((b) =>
              b.id === booking.id
                ? { ...b, status: (booking.status === "paused" ? "active" : "paused") as RecurringBooking["status"] }
                : b
            )
          );
        }
      } catch {
        Alert.alert("Error", "Failed to update. Please try again.");
      } finally {
        setTogglingId(null);
      }
    },
    []
  );

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
      const badge = statusStyle(item.status);
      const isCancelling = cancellingId === item.id;
      const isToggling = togglingId === item.id;
      const canPauseResume = item.status === "active" || item.status === "paused";

      return (
        <View style={{ backgroundColor: Colors.white, borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.gray[100] }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
            <Text style={{ fontWeight: "600", color: Colors.gray[900], flex: 1, marginRight: 8 }}>{item.service_name}</Text>
            <View style={{ paddingHorizontal: 10, paddingVertical: 2, borderRadius: 9999, backgroundColor: badge.bg }}>
              <Text style={{ fontSize: 12, fontWeight: "500", color: badge.text, textTransform: "capitalize" }}>{item.status}</Text>
            </View>
          </View>
          <Text style={{ fontSize: 14, color: Colors.gray[600], marginBottom: 4 }}>{item.provider_name}</Text>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
            <View>
              <Text style={{ fontSize: 12, color: Colors.gray[500] }}>Frequency</Text>
              <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[800] }}>{item.frequency}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={{ fontSize: 12, color: Colors.gray[500] }}>Next appointment</Text>
              <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[800] }}>{formatDate(item.next_date)}</Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.gray[100] }}>
            <Text style={{ fontWeight: "600", color: Colors.gray[900] }}>{item.currency} {item.price != null && item.price > 0 ? item.price.toFixed(2) : "—"}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              {canPauseResume && (
                <TouchableOpacity
                  onPress={() => togglePauseResume(item)}
                  disabled={isToggling}
                  style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: Colors.gray[300], backgroundColor: Colors.gray[50] }}
                >
                  {isToggling ? <ActivityIndicator size="small" color={Colors.gray[600]} /> : <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>{item.status === "paused" ? "Resume" : "Pause"}</Text>}
                </TouchableOpacity>
              )}
              {item.status !== "cancelled" && (
                <TouchableOpacity
                  onPress={() => cancelBooking(item)}
                  disabled={isCancelling}
                  style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: "#FECACA", backgroundColor: "#FEF2F2" }}
                >
                  {isCancelling ? <ActivityIndicator size="small" color={Colors.error} /> : <Text style={{ fontSize: 14, fontWeight: "500", color: "#DC2626" }}>Cancel</Text>}
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      );
    },
    [cancellingId, togglingId, cancelBooking, togglePauseResume],
  );

  if (loading && bookings.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.white, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={{ color: Colors.gray[600], marginTop: 16 }}>Loading...</Text>
      </View>
    );
  }

  if (error && bookings.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.white, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Text style={{ textAlign: "center", color: Colors.gray[700], marginBottom: 16 }}>{error}</Text>
        <TouchableOpacity onPress={() => load()} style={{ backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}>
          <Text style={{ color: Colors.white, fontWeight: "600" }}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (bookings.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.white, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Text style={{ textAlign: "center", fontWeight: "600", color: Colors.gray[900], marginBottom: 8 }}>No recurring bookings yet</Text>
        <Text style={{ textAlign: "center", color: Colors.gray[500] }}>Set up recurring appointments from any booking detail page</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.white }}>
      <FlatList
        data={bookings}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{
          padding: contentPadding,
          paddingBottom: STACK_CONTENT_PADDING_BOTTOM,
          ...constraint,
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
