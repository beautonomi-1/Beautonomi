import { useEffect, useState, useCallback, useRef } from "react";
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Pressable, ActivityIndicator, Platform } from "react-native";
import { router } from "expo-router";
import { api } from "@/lib/api-client";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/providers/AuthProvider";
import { useResponsive } from "@/hooks/useResponsive";
import { Colors } from "@/constants/colors";
import type { Booking } from "@/types/api";

function parseValidDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function formatDate(s: string) {
  const parsed = parseValidDate(s);
  if (!parsed) return "—";
  return parsed.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}
function formatTime(s: string) {
  const parsed = parseValidDate(s);
  if (!parsed) return "—";
  return parsed.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
}

type SortPreset = "appt_desc" | "appt_asc" | "booked_desc" | "booked_asc";

function sortPresetToParams(p: SortPreset): { sort_by: string; sort_dir: string } {
  switch (p) {
    case "appt_asc":
      return { sort_by: "scheduled_at", sort_dir: "asc" };
    case "appt_desc":
      return { sort_by: "scheduled_at", sort_dir: "desc" };
    case "booked_desc":
      return { sort_by: "created_at", sort_dir: "desc" };
    case "booked_asc":
      return { sort_by: "created_at", sort_dir: "asc" };
  }
}

export default function AccountBookingsScreen() {
  const { user } = useAuth();
  const { contentPadding, contentMaxWidth, isTablet } = useResponsive();
  const constraint = (isTablet || Platform.OS === "web") ? { maxWidth: contentMaxWidth, alignSelf: "center" as const, width: "100%" as const } : {};
  const [tab, setTab] = useState<"upcoming" | "past" | "cancelled">("upcoming");
  const [sortPreset, setSortPreset] = useState<SortPreset>("appt_desc");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Ignore late responses when switching Upcoming / Past / Cancelled quickly. */
  const requestGeneration = useRef(0);

  const load = useCallback(async (isRefresh = false) => {
    const gen = ++requestGeneration.current;
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
      setBookings([]);
    }
    setError(null);
    try {
      const { sort_by, sort_dir } = sortPresetToParams(sortPreset);
      const res = await api.get<any>(
        `/api/me/bookings?status=${encodeURIComponent(tab)}&limit=100&page=1&sort_by=${encodeURIComponent(sort_by)}&sort_dir=${encodeURIComponent(sort_dir)}`
      );
      if (gen !== requestGeneration.current) return;
      if (res.error) {
        setError(res.error.message || "Failed to load");
        setBookings([]);
      } else {
        const body = res.data as Booking[] | { items?: Booking[]; data?: Booking[] } | undefined;
        const list = Array.isArray(body)
          ? body
          : (body && typeof body === "object" ? body.items ?? body.data : undefined);
        setBookings(Array.isArray(list) ? list : []);
      }
    } catch (e) {
      if (gen !== requestGeneration.current) return;
      setError(e instanceof Error ? e.message : "Failed");
      setBookings([]);
    } finally {
      if (gen === requestGeneration.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [tab, sortPreset]);

  useEffect(() => { load(); }, [load]);

  // Supabase Realtime: live booking status updates — trigger a full reload so status-tab transitions work correctly
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    if (!user?.id) return;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel(`booking-status-updates:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bookings",
          filter: `customer_id=eq.${user.id}`,
        },
        () => {
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            debounceTimer = null;
            loadRef.current(true);
          }, 500);
        },
      )
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
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
        <Text style={{ fontSize: 12, fontWeight: "600", color: Colors.gray[500], marginTop: 12, marginBottom: 6 }}>Sort</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 8 }}>
          {(
            [
              { key: "appt_desc" as const, label: "Appt · newest" },
              { key: "appt_asc" as const, label: "Appt · soonest" },
              { key: "booked_desc" as const, label: "Booked · newest" },
              { key: "booked_asc" as const, label: "Booked · oldest" },
            ] as const
          ).map((c) => {
            const active = sortPreset === c.key;
            return (
              <TouchableOpacity
                key={c.key}
                onPress={() => setSortPreset(c.key)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  borderRadius: 9999,
                  backgroundColor: active ? Colors.gray[900] : Colors.gray[100],
                  marginRight: 8,
                }}
                accessibilityRole="button"
                accessibilityLabel={`Sort: ${c.label}`}
                accessibilityState={{ selected: active }}
              >
                <Text style={{ fontSize: 12, fontWeight: "600", color: active ? Colors.white : Colors.gray[700] }}>{c.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: contentPadding, paddingBottom: 48, ...constraint }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={Colors.primary} />}>
        {error && (
          <View style={{ backgroundColor: "#FEF2F2", borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <Text style={{ color: "#B91C1C" }}>{error}</Text>
          </View>
        )}
        {bookings.length === 0 ? (
          <View style={{ paddingVertical: 48, alignItems: "center" }}>
            <Text style={{ fontSize: 18, fontWeight: "600", color: Colors.gray[900], marginBottom: 8, textAlign: "center" }}>
              {tab === "upcoming"
                ? "No appointments scheduled...yet!"
                : tab === "past"
                  ? "No past appointments yet"
                  : "No cancelled bookings"}
            </Text>
            <Text style={{ color: Colors.gray[600], textAlign: "center", marginBottom: 20 }}>
              {tab === "upcoming"
                ? "Browse providers and book your next visit."
                : tab === "past"
                  ? "Completed visits will appear here."
                  : "Cancelled appointments will show here."}
            </Text>
            <TouchableOpacity
              onPress={() => router.push("/(app)/(tabs)/search")}
              style={{ backgroundColor: Colors.primary, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 12 }}
              accessibilityRole="button"
              accessibilityLabel={tab === "upcoming" ? "Start searching for providers" : "Find providers"}
            >
              <Text style={{ color: Colors.white, fontWeight: "600" }}>
                {tab === "upcoming" ? "Start Searching" : "Find providers"}
              </Text>
            </TouchableOpacity>
          </View>
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
