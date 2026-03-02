import { useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Pressable, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { api } from "@/lib/api-client";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/providers/AuthProvider";
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
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      <View className="bg-white px-4 pt-2 pb-2">
        <View className="flex-row gap-2">
          {TABS.map((t) => (
            <TouchableOpacity key={t.key} onPress={() => setTab(t.key)} className={`px-4 py-2 rounded-full ${tab === t.key ? "bg-primary" : "bg-gray-100"}`}>
              <Text className={`font-medium ${tab === t.key ? "text-white" : "text-gray-700"}`}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 48 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={Colors.primary} />}>
        {error && <View className="bg-red-50 rounded-xl p-4 mb-4"><Text className="text-red-700">{error}</Text></View>}
        {bookings.length === 0 ? (
          <Text className="text-center text-gray-500 py-12">No bookings</Text>
        ) : (
          bookings.map((b) => (
            <Pressable key={b.id} onPress={() => router.push({ pathname: "/(app)/booking-detail", params: { id: b.id } })} className="bg-white rounded-xl p-4 mb-3 border border-gray-100">
              <View className="flex-row justify-between">
                <Text className="font-semibold text-gray-900">{(b as any).provider_name || b.services?.[0]?.offering_name || "Booking"}</Text>
                <View className={`px-2 py-0.5 rounded ${b.status === "confirmed" ? "bg-green-100" : b.status === "cancelled" ? "bg-red-100" : "bg-gray-100"}`}>
                  <Text className="text-xs font-medium">{String(b.status).charAt(0).toUpperCase() + String(b.status).slice(1)}</Text>
                </View>
              </View>
              <Text className="text-gray-600 mt-1">{formatDate(b.scheduled_at)}</Text>
              <Text className="text-gray-600">{formatTime(b.scheduled_at)}</Text>
              <Text className="font-semibold text-gray-900 mt-2">{b.currency} {b.total_amount?.toFixed(2)}</Text>
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );
}
