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
import { useRouter } from "expo-router";
import { api } from "@/lib/api-client";
import { useResponsive } from "@/hooks/useResponsive";
import { Colors } from "@/constants/colors";
import { STACK_CONTENT_PADDING_BOTTOM } from "@/constants/layout";
import { Ionicons } from "@expo/vector-icons";
import { getTenantLocaleTag } from "@/lib/locale";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type WaitlistStatus = "waiting" | "notified" | "expired";

interface WaitlistEntry {
  id: string;
  provider_name: string;
  provider_slug?: string | null;
  service_name: string;
  date_added: string;
  position: number;
  status: WaitlistStatus;
  preferred_date?: string | null;
  preferred_time_start?: string | null;
  preferred_time_end?: string | null;
  slot_passed?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function parseValidDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function formatDate(iso: string): string {
  const parsed = parseValidDate(iso);
  if (!parsed) return "—";
  return parsed.toLocaleDateString(getTenantLocaleTag(), {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatPreferredSlot(entry: WaitlistEntry): string | null {
  if (!entry.preferred_date) return null;
  const dateStr = formatDate(entry.preferred_date);
  const start = entry.preferred_time_start;
  const end = entry.preferred_time_end;
  if (start && end) return `${dateStr}, ${start}–${end}`;
  if (start) return `${dateStr}, from ${start}`;
  return dateStr;
}

function statusConfig(status: WaitlistStatus): { bg: string; text: string; label: string } {
  switch (status) {
    case "waiting":
      return { bg: "#DBEAFE", text: "#1E40AF", label: "Waiting" };
    case "notified":
      return { bg: "#DCFCE7", text: "#166534", label: "Notified" };
    case "expired":
      return { bg: Colors.gray[100], text: Colors.gray[600], label: "Expired" };
    default:
      return { bg: Colors.gray[100], text: Colors.gray[600], label: String(status) };
  }
}

/* ------------------------------------------------------------------ */
/*  Screen                                                             */
/* ------------------------------------------------------------------ */

function normalizeEntries(data: unknown): WaitlistEntry[] {
  if (Array.isArray(data)) return data as WaitlistEntry[];
  const obj = data as { entries?: WaitlistEntry[] } | null;
  return obj?.entries ?? [];
}

export default function WaitlistScreen() {
  const router = useRouter();
  const { contentPadding, contentMaxWidth, isTablet } = useResponsive();
  const constraint = (isTablet || Platform.OS === "web") ? { maxWidth: contentMaxWidth, alignSelf: "center" as const, width: "100%" as const } : {};
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await api.get<WaitlistEntry[] | { entries: WaitlistEntry[] }>("/api/me/waitlist");
      if (res.error) {
        setError(res.error.message || "Failed to load waitlist");
        setEntries([]);
      } else {
        setEntries(normalizeEntries(res.data));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load waitlist");
      setEntries([]);
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
        const res = await api.get<WaitlistEntry[] | { entries: WaitlistEntry[] }>("/api/me/waitlist");
        if (cancelled) return;
        if (res.error) {
          setError(res.error.message || "Failed to load waitlist");
          setEntries([]);
        } else {
          setEntries(normalizeEntries(res.data));
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load waitlist");
        setEntries([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    return () => { cancelled = true; };
  }, []);

  const leaveWaitlist = useCallback(
    (entry: WaitlistEntry) => {
      const isExpired = entry.status === "expired";
      Alert.alert(
        isExpired ? "Remove from list" : "Leave Waitlist",
        isExpired
          ? `Remove "${entry.service_name}" at ${entry.provider_name} from your list?`
          : `Are you sure you want to leave the waitlist for "${entry.service_name}" at ${entry.provider_name}?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: isExpired ? "Remove" : "Leave",
            style: "destructive",
            onPress: async () => {
              setRemovingId(entry.id);
              try {
                const res = await api.delete(`/api/me/waitlist?id=${encodeURIComponent(entry.id)}`);
                if (res.error) {
                  Alert.alert(
                    "Error",
                    res.error.message || "Failed to leave waitlist",
                  );
                } else {
                  setEntries((prev) => prev.filter((e) => e.id !== entry.id));
                }
              } catch {
                Alert.alert(
                  "Error",
                  "Failed to leave waitlist. Please try again.",
                );
              } finally {
                setRemovingId(null);
              }
            },
          },
        ],
      );
    },
    [],
  );

  const openBookWithProvider = useCallback(
    (slug: string | null | undefined) => {
      if (slug) router.push({ pathname: "/(app)/book", params: { slug } } as never);
    },
    [router],
  );

  const renderItem = useCallback(
    ({ item }: { item: WaitlistEntry }) => {
      const badge = statusConfig(item.status);
      const isRemoving = removingId === item.id;
      const preferredSlotStr = formatPreferredSlot(item);
      const canBookNow = item.status === "notified" && !item.slot_passed && item.provider_slug;
      const canBookAgain = item.status === "expired" && item.provider_slug;

      return (
        <View style={{ backgroundColor: Colors.white, borderRadius: 16, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: Colors.gray[100], shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 2 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
            <Text style={{ fontWeight: "600", fontSize: 16, color: Colors.gray[900], flex: 1, marginRight: 10 }} numberOfLines={1}>
              {item.provider_name || "Provider"}
            </Text>
            <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 9999, backgroundColor: badge.bg }}>
              <Text style={{ fontSize: 12, fontWeight: "600", color: badge.text }}>{badge.label}</Text>
            </View>
          </View>
          <Text style={{ fontSize: 14, color: Colors.gray[600], marginBottom: 10 }} numberOfLines={2}>{item.service_name || "Service"}</Text>
          {preferredSlotStr ? (
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
              <Ionicons name="calendar-outline" size={14} color={Colors.gray[500]} style={{ marginRight: 6 }} />
              <Text style={{ fontSize: 13, color: Colors.gray[600] }}>{preferredSlotStr}</Text>
            </View>
          ) : null}
          {item.slot_passed && item.status === "expired" ? (
            <Text style={{ fontSize: 12, color: Colors.gray[500], fontStyle: "italic", marginBottom: 10 }}>This slot has passed. You can book a new time below.</Text>
          ) : null}
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
            <View>
              <Text style={{ fontSize: 11, color: Colors.gray[400], textTransform: "uppercase", letterSpacing: 0.5 }}>Date added</Text>
              <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[800] }}>{formatDate(item.date_added)}</Text>
            </View>
            <View style={{ alignItems: "center" }}>
              <Text style={{ fontSize: 11, color: Colors.gray[400], textTransform: "uppercase", letterSpacing: 0.5 }}>Position</Text>
              <View style={{ backgroundColor: Colors.primaryLight, borderRadius: 9999, width: 36, height: 36, alignItems: "center", justifyContent: "center", marginTop: 2 }}>
                <Text style={{ fontSize: 15, fontWeight: "700", color: Colors.primary }}>{item.position}</Text>
              </View>
            </View>
          </View>
          <View style={{ marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: Colors.gray[100], gap: 10 }}>
            {canBookNow && (
              <TouchableOpacity
                onPress={() => openBookWithProvider(item.provider_slug)}
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 12, borderRadius: 10, backgroundColor: Colors.primary }}
              >
                <Ionicons name="calendar" size={18} color="#fff" style={{ marginRight: 8 }} />
                <Text style={{ fontSize: 15, fontWeight: "600", color: "#fff" }}>Book now</Text>
              </TouchableOpacity>
            )}
            {canBookAgain && !canBookNow && (
              <TouchableOpacity
                onPress={() => openBookWithProvider(item.provider_slug)}
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: Colors.primary, backgroundColor: "transparent" }}
              >
                <Ionicons name="calendar-outline" size={18} color={Colors.primary} style={{ marginRight: 8 }} />
                <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.primary }}>Book again with this provider</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => leaveWaitlist(item)}
              disabled={isRemoving}
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: "#FECACA", backgroundColor: "#FEF2F2" }}
            >
              {isRemoving ? (
                <ActivityIndicator size="small" color={Colors.error} />
              ) : (
                <>
                  <Ionicons name={item.status === "expired" ? "trash-outline" : "exit-outline"} size={18} color="#DC2626" style={{ marginRight: 8 }} />
                  <Text style={{ fontSize: 14, fontWeight: "500", color: "#DC2626" }}>
                    {item.status === "expired" ? "Remove from list" : "Leave waitlist"}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      );
    },
    [removingId, leaveWaitlist, openBookWithProvider],
  );

  if (loading && entries.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.white, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={{ color: Colors.gray[600], marginTop: 16 }}>Loading waitlist…</Text>
      </View>
    );
  }

  if (error && entries.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.white, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Ionicons name="alert-circle-outline" size={48} color={Colors.gray[400]} style={{ marginBottom: 16 }} />
        <Text style={{ textAlign: "center", color: Colors.gray[700], marginBottom: 20 }}>{error}</Text>
        <TouchableOpacity onPress={() => load()} style={{ backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}>
          <Text style={{ color: Colors.white, fontWeight: "600" }}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (entries.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.white, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.gray[100], alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
          <Ionicons name="hourglass-outline" size={36} color={Colors.gray[400]} />
        </View>
        <Text style={{ textAlign: "center", fontWeight: "600", fontSize: 18, color: Colors.gray[900], marginBottom: 8 }}>No waitlist entries</Text>
        <Text style={{ textAlign: "center", color: Colors.gray[500], paddingHorizontal: 24 }}>When your preferred time isn’t available, you can join a waitlist on the provider’s booking page. We’ll notify you when a slot opens.</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.white }}>
      <FlatList
        data={entries}
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
