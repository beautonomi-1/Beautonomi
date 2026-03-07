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

type WaitlistStatus = "waiting" | "notified" | "expired";

interface WaitlistEntry {
  id: string;
  provider_name: string;
  service_name: string;
  date_added: string;
  position: number;
  status: WaitlistStatus;
}

interface WaitlistResponse {
  entries: WaitlistEntry[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-ZA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
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

export default function WaitlistScreen() {
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
      const res = await api.get<WaitlistResponse>("/api/me/waitlist");
      if (res.error) {
        setError(res.error.message || "Failed to load waitlist");
        setEntries([]);
      } else {
        const data = res.data;
        const items = Array.isArray(data)
          ? (data as unknown as WaitlistEntry[])
          : data?.entries ?? [];
        setEntries(items);
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
        const res = await api.get<WaitlistResponse>("/api/me/waitlist");
        if (cancelled) return;
        if (res.error) {
          setError(res.error.message || "Failed to load waitlist");
          setEntries([]);
        } else {
          const data = res.data;
          const items = Array.isArray(data)
            ? (data as unknown as WaitlistEntry[])
            : data?.entries ?? [];
          setEntries(items);
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load waitlist");
        setEntries([]);
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

  const leaveWaitlist = useCallback(
    (entry: WaitlistEntry) => {
      Alert.alert(
        "Leave Waitlist",
        `Are you sure you want to leave the waitlist for "${entry.service_name}" at ${entry.provider_name}?`,
        [
          { text: "Stay", style: "cancel" },
          {
            text: "Leave",
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

  const renderItem = useCallback(
    ({ item }: { item: WaitlistEntry }) => {
      const badge = statusConfig(item.status);
      const isRemoving = removingId === item.id;

      return (
        <View style={{ backgroundColor: Colors.white, borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.gray[100] }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
            <Text style={{ fontWeight: "600", color: Colors.gray[900], flex: 1, marginRight: 8 }}>{item.provider_name}</Text>
            <View style={{ paddingHorizontal: 10, paddingVertical: 2, borderRadius: 9999, backgroundColor: badge.bg }}>
              <Text style={{ fontSize: 12, fontWeight: "500", color: badge.text }}>{badge.label}</Text>
            </View>
          </View>
          <Text style={{ fontSize: 14, color: Colors.gray[600], marginBottom: 12 }}>{item.service_name}</Text>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View>
              <Text style={{ fontSize: 12, color: Colors.gray[500] }}>Date added</Text>
              <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[800] }}>{formatDate(item.date_added)}</Text>
            </View>
            <View style={{ alignItems: "center" }}>
              <Text style={{ fontSize: 12, color: Colors.gray[500] }}>Position</Text>
              <View style={{ backgroundColor: Colors.primaryLight, borderRadius: 9999, width: 32, height: 32, alignItems: "center", justifyContent: "center", marginTop: 2 }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: Colors.primary }}>{item.position}</Text>
              </View>
            </View>
          </View>
          {item.status !== "expired" && (
            <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.gray[100] }}>
              <TouchableOpacity
                onPress={() => leaveWaitlist(item)}
                disabled={isRemoving}
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: "#FECACA", backgroundColor: "#FEF2F2" }}
              >
                {isRemoving ? (
                  <ActivityIndicator size="small" color={Colors.error} />
                ) : (
                  <Text style={{ fontSize: 14, fontWeight: "500", color: "#DC2626" }}>Leave Waitlist</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      );
    },
    [removingId, leaveWaitlist],
  );

  if (loading && entries.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.white, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={{ color: Colors.gray[600], marginTop: 16 }}>Loading...</Text>
      </View>
    );
  }

  if (error && entries.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.white, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Text style={{ textAlign: "center", color: Colors.gray[700], marginBottom: 16 }}>{error}</Text>
        <TouchableOpacity onPress={() => load()} style={{ backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}>
          <Text style={{ color: Colors.white, fontWeight: "600" }}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (entries.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.white, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Text style={{ textAlign: "center", fontWeight: "600", color: Colors.gray[900], marginBottom: 8 }}>No waitlist entries</Text>
        <Text style={{ textAlign: "center", color: Colors.gray[500] }}>Join a waitlist when your preferred time slot is unavailable</Text>
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
