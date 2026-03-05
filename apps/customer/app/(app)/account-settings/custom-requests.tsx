import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Linking,
  Alert,
} from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { api } from "@/lib/api-client";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { Colors } from "@/constants/colors";
import * as Haptics from "expo-haptics";

// ---------------------------------------------------------------------------
// Types (aligned with API: custom_requests with offers[])
// ---------------------------------------------------------------------------

interface CustomRequestProvider {
  id: string;
  slug?: string | null;
  business_name?: string | null;
  avatar_url?: string | null;
}

interface CustomRequestOffer {
  id: string;
  price: number;
  currency: string;
  duration_minutes: number;
  expiration_at: string;
  notes?: string | null;
  status: string;
  payment_url?: string | null;
  paid_at?: string | null;
  staff_id?: string | null;
  location_id?: string | null;
  scheduled_at?: string | null;
  travel_fee?: number | null;
}

type LocationType = "at_salon" | "at_home";

interface CustomRequest {
  id: string;
  provider?: CustomRequestProvider | null;
  description: string;
  budget_min?: number | null;
  budget_max?: number | null;
  location_type?: LocationType | null;
  status: string;
  preferred_start_at?: string | null;
  created_at: string;
  offers?: CustomRequestOffer[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
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

function canAcceptOffer(offer: CustomRequestOffer): boolean {
  if (offer.status === "paid" || offer.status === "expired") return false;
  const exp = offer.expiration_at ? new Date(offer.expiration_at).getTime() : null;
  if (exp != null && exp < Date.now()) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function RequestCard({
  item,
  onAcceptPay,
  onPressProvider,
  refreshingOfferId,
}: {
  item: CustomRequest;
  onAcceptPay: (offerId: string) => void;
  onPressProvider: () => void;
  refreshingOfferId: string | null;
}) {
  const locationLabel = formatLocationLabel(item.location_type);
  const budget = formatBudget(item.budget_min, item.budget_max, "ZAR");
  const hasPaidOffer = item.offers?.some((o) => o.status === "paid");
  const hasPendingOffer = item.offers?.some(canAcceptOffer);
  const statusLabel = hasPaidOffer ? "Paid" : hasPendingOffer ? "Offer to accept" : item.status ?? "Pending";

  return (
    <View className="bg-white rounded-xl p-4 mb-3 border border-gray-100">
      {/* Header row: provider info + status */}
      <View className="flex-row items-center justify-between mb-2">
        <TouchableOpacity
          onPress={onPressProvider}
          activeOpacity={0.7}
          className="flex-row items-center flex-1 mr-3"
        >
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
        </TouchableOpacity>
        <View
          className={`px-2.5 py-0.5 rounded-full ${
            hasPaidOffer ? "bg-green-100" : hasPendingOffer ? "bg-amber-100" : "bg-gray-100"
          }`}
        >
          <Text
            className={`text-xs font-semibold ${
              hasPaidOffer ? "text-green-800" : hasPendingOffer ? "text-amber-800" : "text-gray-600"
            }`}
          >
            {statusLabel}
          </Text>
        </View>
      </View>

      {/* Description */}
      <Text className="text-gray-700 text-sm mb-2">
        {truncate(item.description || "No description", 120)}
      </Text>

      {/* Meta row */}
      <View className="flex-row flex-wrap gap-3 mb-1">
        {budget && <Text className="text-xs text-gray-500">{budget}</Text>}
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

      {/* Offers list */}
      {item.offers && item.offers.length > 0 && (
        <View className="mt-3 border-t border-gray-100 pt-3">
          {item.offers.map((o) => {
            const expired = o.expiration_at && new Date(o.expiration_at).getTime() < Date.now();
            const canAccept = canAcceptOffer(o);
            const isRefreshing = refreshingOfferId === o.id;
            return (
              <View
                key={o.id}
                className={`rounded-lg p-3 mb-2 ${
                  o.status === "paid" ? "bg-green-50 border border-green-100" : "bg-gray-50 border border-gray-100"
                }`}
              >
                <View className="flex-row items-center justify-between flex-wrap gap-2">
                  <View>
                    <Text className="text-sm font-semibold text-gray-900">
                      {o.currency} {o.price?.toFixed(2)} · {o.duration_minutes} min
                    </Text>
                    <Text className="text-xs text-gray-500 mt-0.5">
                      Expires {formatDateTime(o.expiration_at)}
                      {o.travel_fee != null && o.travel_fee > 0 && ` · Travel ${o.currency} ${o.travel_fee}`}
                    </Text>
                  </View>
                  {o.status === "paid" ? (
                    <Text className="text-sm font-medium text-green-700">Paid</Text>
                  ) : expired ? (
                    <Text className="text-sm text-gray-500">Expired</Text>
                  ) : canAccept ? (
                    <TouchableOpacity
                      onPress={() => onAcceptPay(o.id)}
                      disabled={isRefreshing}
                      className="bg-primary px-4 py-2 rounded-xl"
                    >
                      {isRefreshing ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text className="text-sm font-semibold text-white">
                          Accept & Pay
                        </Text>
                      )}
                    </TouchableOpacity>
                  ) : null}
                </View>
                {o.notes ? (
                  <Text className="text-xs text-gray-600 mt-2">{o.notes}</Text>
                ) : null}
              </View>
            );
          })}
        </View>
      )}
    </View>
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
  const [refreshingOfferId, setRefreshingOfferId] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await api.get<CustomRequest[] | { data?: CustomRequest[] }>("/api/me/custom-requests");
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
        const res = await api.get<CustomRequest[] | { data?: CustomRequest[] }>("/api/me/custom-requests");
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

  const handleAcceptPay = useCallback(
    async (offerId: string) => {
      setRefreshingOfferId(offerId);
      try {
        const res = await api.post<{ paymentUrl?: string }>(
          `/api/me/custom-offers/${offerId}/accept`,
          {}
        );
        const paymentUrl =
          (res.data as { paymentUrl?: string } | undefined)?.paymentUrl ??
          (res as { data?: { paymentUrl?: string } }).data?.paymentUrl;
        if (res.error) {
          Alert.alert(
            "Error",
            (res.error as { message?: string })?.message ?? "Failed to start payment"
          );
          return;
        }
        if (paymentUrl) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          const canOpen = await Linking.canOpenURL(paymentUrl);
          if (canOpen) {
            await Linking.openURL(paymentUrl);
          } else {
            Alert.alert("Payment", "Complete payment in your browser.", [
              { text: "OK" },
            ]);
          }
        } else {
          Alert.alert("Payment", "No payment link was returned. Please try again.");
        }
      } catch (e) {
        Alert.alert("Error", e instanceof Error ? e.message : "Failed to start payment");
      } finally {
        setRefreshingOfferId(null);
      }
    },
    []
  );

  const handlePressProvider = useCallback((item: CustomRequest) => {
    if (item.provider?.slug) {
      router.push({
        pathname: "/(app)/partner-profile",
        params: { slug: item.provider.slug },
      });
    }
  }, []);

  if (loading && data.length === 0) {
    return (
      <View className="flex-1 bg-white items-center justify-center">
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text className="text-gray-600 mt-4">Loading…</Text>
      </View>
    );
  }

  if (error && data.length === 0) {
    return (
      <View className="flex-1 bg-white items-center justify-center p-6">
        <Text className="text-center text-gray-700 mb-4">{error}</Text>
        <TouchableOpacity onPress={() => load()} className="bg-primary px-6 py-3 rounded-xl">
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
          <RequestCard
            item={item}
            onAcceptPay={handleAcceptPay}
            onPressProvider={() => handlePressProvider(item)}
            refreshingOfferId={refreshingOfferId}
          />
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
            <Text className="text-lg font-semibold text-gray-900 mb-2">No custom requests</Text>
            <Text className="text-center text-gray-500 px-8">
              Create a custom service request from any provider profile
            </Text>
          </View>
        }
      />
    </View>
  );
}
