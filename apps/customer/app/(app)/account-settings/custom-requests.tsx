import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { api } from "@/lib/api-client";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { Colors } from "@/constants/colors";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CustomRequestProvider {
  id: string;
  slug?: string | null;
  business_name: string;
  avatar_url?: string | null;
}

interface CustomRequestQuote {
  price: number;
  currency?: string;
  message?: string | null;
}

type CustomRequestStatus = "pending" | "accepted" | "declined" | "expired";
type LocationType = "at_salon" | "at_home";

interface CustomRequest {
  id: string;
  provider?: CustomRequestProvider | null;
  description: string;
  budget_min?: number | null;
  budget_max?: number | null;
  currency?: string;
  location_type?: LocationType | null;
  status: CustomRequestStatus;
  quote?: CustomRequestQuote | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<
  CustomRequestStatus,
  { label: string; bg: string; text: string }
> = {
  pending: { label: "Pending", bg: "bg-yellow-100", text: "text-yellow-800" },
  accepted: { label: "Accepted", bg: "bg-green-100", text: "text-green-800" },
  declined: { label: "Declined", bg: "bg-red-100", text: "text-red-800" },
  expired: { label: "Expired", bg: "bg-gray-100", text: "text-gray-600" },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max).trimEnd() + "…";
}

function formatLocationLabel(type?: LocationType | null): string | null {
  if (!type) return null;
  return type === "at_home" ? "At Home" : "At Salon";
}

function formatBudget(
  min?: number | null,
  max?: number | null,
  currency = "ZAR"
): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null) return `${currency} ${min} – ${max}`;
  if (min != null) return `From ${currency} ${min}`;
  return `Up to ${currency} ${max}`;
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: CustomRequestStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  return (
    <View className={`px-2.5 py-0.5 rounded-full ${cfg.bg}`}>
      <Text className={`text-xs font-semibold ${cfg.text}`}>{cfg.label}</Text>
    </View>
  );
}

function RequestCard({
  item,
  onPress,
}: {
  item: CustomRequest;
  onPress: () => void;
}) {
  const locationLabel = formatLocationLabel(item.location_type);
  const budget = formatBudget(item.budget_min, item.budget_max, item.currency);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      className="bg-white rounded-xl p-4 mb-3 border border-gray-100"
    >
      {/* Header row: provider info + status */}
      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-row items-center flex-1 mr-3">
          {item.provider?.avatar_url ? (
            <Image
              source={{ uri: item.provider.avatar_url }}
              style={{ width: 36, height: 36, borderRadius: 18, marginRight: 10 }}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={200}
            />
          ) : (
            <View
              className="items-center justify-center bg-primary-light mr-2.5"
              style={{ width: 36, height: 36, borderRadius: 18 }}
            >
              <Text className="text-primary font-bold text-sm">
                {(item.provider?.business_name ?? "P").charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <Text className="font-semibold text-gray-900 flex-1" numberOfLines={1}>
            {item.provider?.business_name ?? "Provider"}
          </Text>
        </View>
        <StatusBadge status={item.status} />
      </View>

      {/* Description */}
      <Text className="text-gray-700 text-sm mb-2">
        {truncate(item.description || "No description", 120)}
      </Text>

      {/* Meta row */}
      <View className="flex-row flex-wrap gap-3 mb-1">
        {budget && (
          <Text className="text-xs text-gray-500">{budget}</Text>
        )}
        {locationLabel && (
          <View className="flex-row items-center">
            <View className="w-1 h-1 rounded-full bg-gray-300 mr-2" />
            <Text className="text-xs text-gray-500">{locationLabel}</Text>
          </View>
        )}
        <View className="flex-row items-center">
          <View className="w-1 h-1 rounded-full bg-gray-300 mr-2" />
          <Text className="text-xs text-gray-400">{formatDate(item.created_at)}</Text>
        </View>
      </View>

      {/* Accepted quote */}
      {item.status === "accepted" && item.quote && (
        <View className="bg-green-50 rounded-lg p-3 mt-3 border border-green-100">
          <Text className="text-xs font-semibold text-green-800 mb-1">
            Provider&apos;s Quote
          </Text>
          <Text className="text-sm font-bold text-green-900">
            {item.quote.currency ?? item.currency ?? "ZAR"}{" "}
            {item.quote.price?.toFixed(2)}
          </Text>
          {item.quote.message ? (
            <Text className="text-xs text-green-700 mt-1">
              {item.quote.message}
            </Text>
          ) : null}
        </View>
      )}
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function CustomRequestsScreen() {
  useScreenTracking("Custom Requests");

  const [data, setData] = useState<CustomRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const res = await api.get<CustomRequest[]>("/api/me/custom-requests");
      if (res.error) {
        setError(res.error.message || "Failed to load custom requests");
        setData([]);
      } else {
        const raw = res.data;
        if (Array.isArray(raw)) {
          setData(raw);
        } else {
          const obj = raw as unknown as Record<string, unknown>;
          const items = (obj?.data ?? obj?.requests ?? []) as CustomRequest[];
          setData(Array.isArray(items) ? items : []);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load custom requests");
      setData([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.get<CustomRequest[]>("/api/me/custom-requests");
        if (cancelled) return;
        if (res.error) {
          setError(res.error.message || "Failed to load custom requests");
          setData([]);
        } else {
          const raw = res.data;
          if (Array.isArray(raw)) {
            setData(raw);
          } else {
            const obj = raw as unknown as Record<string, unknown>;
            const items = (obj?.data ?? obj?.requests ?? []) as CustomRequest[];
            setData(Array.isArray(items) ? items : []);
          }
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load custom requests");
        setData([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    init();
    return () => {
      cancelled = true;
    };
  }, []);

  const handlePress = useCallback((item: CustomRequest) => {
    if (item.provider?.slug) {
      router.push({
        pathname: "/(app)/partner-profile",
        params: { slug: item.provider.slug },
      });
    }
  }, []);

  // Loading state
  if (loading && data.length === 0) {
    return (
      <View className="flex-1 bg-white items-center justify-center">
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text className="text-gray-600 mt-4">Loading…</Text>
      </View>
    );
  }

  // Error state
  if (error && data.length === 0) {
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

  return (
    <View className="flex-1 bg-gray-50">
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <RequestCard item={item} onPress={() => handlePress(item)} />
        )}
        contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor={Colors.primary}
          />
        }
        ListEmptyComponent={
          <View className="items-center justify-center py-16">
            <Text className="text-lg font-semibold text-gray-900 mb-2">
              No custom requests
            </Text>
            <Text className="text-center text-gray-500 px-8">
              Create a custom service request from any provider profile
            </Text>
          </View>
        }
      />
    </View>
  );
}
