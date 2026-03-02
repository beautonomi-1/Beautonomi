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

function statusConfig(status: WaitlistStatus): {
  bg: string;
  text: string;
  label: string;
} {
  switch (status) {
    case "waiting":
      return { bg: "bg-blue-100", text: "text-blue-800", label: "Waiting" };
    case "notified":
      return { bg: "bg-green-100", text: "text-green-800", label: "Notified" };
    case "expired":
      return { bg: "bg-gray-100", text: "text-gray-600", label: "Expired" };
    default:
      return { bg: "bg-gray-100", text: "text-gray-600", label: String(status) };
  }
}

/* ------------------------------------------------------------------ */
/*  Screen                                                             */
/* ------------------------------------------------------------------ */

export default function WaitlistScreen() {
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
                const res = await api.delete(`/api/me/waitlist/${entry.id}`);
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
        <View className="bg-white rounded-xl p-4 mb-3 border border-gray-100">
          {/* Header: provider + status */}
          <View className="flex-row justify-between items-start mb-1">
            <Text className="font-semibold text-gray-900 flex-1 mr-2">
              {item.provider_name}
            </Text>
            <View className={`px-2.5 py-0.5 rounded-full ${badge.bg}`}>
              <Text className={`text-xs font-medium ${badge.text}`}>
                {badge.label}
              </Text>
            </View>
          </View>

          {/* Service */}
          <Text className="text-sm text-gray-600 mb-3">{item.service_name}</Text>

          {/* Details row */}
          <View className="flex-row justify-between items-center">
            <View>
              <Text className="text-xs text-gray-500">Date added</Text>
              <Text className="text-sm font-medium text-gray-800">
                {formatDate(item.date_added)}
              </Text>
            </View>
            <View className="items-center">
              <Text className="text-xs text-gray-500">Position</Text>
              <View className="bg-primary-light rounded-full w-8 h-8 items-center justify-center mt-0.5">
                <Text className="text-sm font-bold" style={{ color: Colors.primary }}>
                  {item.position}
                </Text>
              </View>
            </View>
          </View>

          {/* Leave button */}
          {item.status !== "expired" && (
            <View className="mt-3 pt-3 border-t border-gray-100">
              <TouchableOpacity
                onPress={() => leaveWaitlist(item)}
                disabled={isRemoving}
                className="flex-row items-center justify-center px-4 py-2 rounded-lg border border-red-200 bg-red-50"
              >
                {isRemoving ? (
                  <ActivityIndicator size="small" color={Colors.error} />
                ) : (
                  <Text className="text-sm font-medium text-red-600">
                    Leave Waitlist
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      );
    },
    [removingId, leaveWaitlist],
  );

  /* ---- Loading state ---- */
  if (loading && entries.length === 0) {
    return (
      <View className="flex-1 bg-white items-center justify-center p-6">
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text className="text-gray-600 mt-4">Loading...</Text>
      </View>
    );
  }

  /* ---- Error state ---- */
  if (error && entries.length === 0) {
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
  if (entries.length === 0) {
    return (
      <View className="flex-1 bg-white items-center justify-center p-6">
        <Text className="text-center font-semibold text-gray-900 mb-2">
          No waitlist entries
        </Text>
        <Text className="text-center text-gray-500">
          Join a waitlist when your preferred time slot is unavailable
        </Text>
      </View>
    );
  }

  /* ---- List ---- */
  return (
    <View className="flex-1 bg-white">
      <FlatList
        data={entries}
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
