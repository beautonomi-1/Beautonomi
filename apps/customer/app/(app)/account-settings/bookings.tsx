import { useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Pressable, ActivityIndicator, Platform } from "react-native";
import { router } from "expo-router";
import { api } from "@/lib/api-client";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/providers/AuthProvider";
import { useResponsive } from "@/hooks/useResponsive";
import { Colors } from "@/constants/colors";
import type { Booking } from "@/types/api";

function formatDate(s: string) {
  return new Date(s).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}
function formatTime(s: string) {
  return new Date(s).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
}

export default function AccountBookingsScreen() {
  const { user } = useAuth();
  const { contentPadding, contentMaxWidth, isTablet } = useResponsive();
  const constraint = (isTablet || Platform.OS === "web") ? { maxWidth: contentMaxWidth, alignSelf: "center" as const, width: "100%" as const } : {};
  const [tab, setTab] = useState<"upcoming" | "past" | "cancelled">("upcoming");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await api.get<any>(`/api/me/bookings?status=${tab}`);
      if (res.error) {
        setError(res.error.message || "Failed to load");
        setBookings([]);
      } else {
        const body = res.data;
        setBookings(Array.isArray(body) ? body : (body?.items ?? []));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setBookings([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  // Supabase Realtime: live booking status updates
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel("booking-status-updates")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "bookings",
          filter: `customer_id=eq.${user.id}`,
        },
        (payload) => {
          const updated = payload.new as any;
          setBookings((prev) =>
            prev.map((b) =>
              b.id === updated.id
                ? {
                    ...b,
                    status: updated.status ?? b.status,
                    total_amount: updated.total_amount ?? b.total_amount,
                    scheduled_at: updated.scheduled_at ?? b.scheduled_at,
                  }
                : b,
            ),
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const TABS = [
    { key: "upcoming" as const, label: "Upcoming" },
    { key: "past" as const, label: "Past" },
    { key: "cancelled" as const, label: "Cancelled" },
  ];

  if (loading && !bookings.length) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.gray[50] }}>
      <View style={{ backgroundColor: Colors.white, paddingHorizontal: contentPadding, paddingTop: 8, paddingBottom: 8 }}>
        <View style={{ flexDirection: "row" }}>
          {TABS.map((t) => (
            <TouchableOpacity
              key={t.key}
              onPress={() => setTab(t.key)}
              style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 9999, backgroundColor: tab === t.key ? Colors.primary : Colors.gray[100], marginRight: 8 }}
            >
              <Text style={{ fontWeight: "500", color: tab === t.key ? Colors.white : Colors.gray[700] }}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: contentPadding, paddingBottom: 48, ...constraint }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={Colors.primary} />}>
        {error && (
          <View style={{ backgroundColor: "#FEF2F2", borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <Text style={{ color: "#B91C1C" }}>{error}</Text>
          </View>
        )}
        {bookings.length === 0 ? (
          <Text style={{ textAlign: "center", color: Colors.gray[500], paddingVertical: 48 }}>No bookings</Text>
        ) : (
          bookings.map((b) => (
            <Pressable
              key={b.id}
              onPress={() => router.push({ pathname: "/(app)/booking-detail", params: { id: b.id } })}
              style={{ backgroundColor: Colors.white, borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.gray[100] }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontWeight: "600", color: Colors.gray[900] }}>{(b as any).provider_name || b.services?.[0]?.offering_name || "Booking"}</Text>
                <View
                  style={{
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderRadius: 4,
                    backgroundColor: b.status === "confirmed" ? "#DCFCE7" : b.status === "cancelled" ? "#FEE2E2" : Colors.gray[100],
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "500", color: Colors.gray[900] }}>{String(b.status).charAt(0).toUpperCase() + String(b.status).slice(1)}</Text>
                </View>
              </View>
              <Text style={{ color: Colors.gray[600], marginTop: 4 }}>{formatDate(b.scheduled_at)}</Text>
              <Text style={{ color: Colors.gray[600] }}>{formatTime(b.scheduled_at)}</Text>
              <Text style={{ fontWeight: "600", color: Colors.gray[900], marginTop: 8 }}>{b.currency} {b.total_amount?.toFixed(2)}</Text>
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );
}
