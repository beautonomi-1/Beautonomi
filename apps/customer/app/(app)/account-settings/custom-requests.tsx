import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Platform,
  AppState,
} from "react-native";
import { useFocusEffect, router } from "expo-router";
import { Image } from "expo-image";
import { api } from "@/lib/api-client";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { useResponsive } from "@/hooks/useResponsive";
import { Colors } from "@/constants/colors";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";
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
  staff?: { id: string; name: string } | null;
  location_id?: string | null;
  location?: { id: string; name: string } | null;
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
  service_name?: string | null;
  address_line1?: string | null;
  address_city?: string | null;
  address_country?: string | null;
  offers?: CustomRequestOffer[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseValidDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function formatDate(iso: string): string {
  const parsed = parseValidDate(iso);
  if (!parsed) return "—";
  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(iso: string): string {
  const parsed = parseValidDate(iso);
  if (!parsed) return "—";
  return parsed.toLocaleString("en-US", {
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
  currency = getTenantDefaultCurrency()
): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null) return `${currency} ${min} – ${max}`;
  if (min != null) return `From ${currency} ${min}`;
  return `Up to ${currency} ${max}`;
}

function canAcceptOffer(offer: CustomRequestOffer): boolean {
  if (
    offer.status === "paid" ||
    offer.status === "expired" ||
    offer.status === "withdrawn" ||
    offer.status === "payment_pending"
  )
    return false;
  const exp = offer.expiration_at ? new Date(offer.expiration_at).getTime() : null;
  if (exp != null && exp < Date.now()) return false;
  return true;
}

function canContinuePayment(offer: CustomRequestOffer): boolean {
  if (offer.status !== "payment_pending") return false;
  if (!offer.payment_url) return false;
  const exp = offer.expiration_at ? new Date(offer.expiration_at).getTime() : null;
  if (exp != null && exp < Date.now()) return false;
  return true;
}

function canCancelRequest(item: CustomRequest): boolean {
  if (item.status === "cancelled") return false;
  const hasPaidOffer = item.offers?.some((o) => o.status === "paid");
  if (hasPaidOffer) return false;
  return item.status === "pending" || item.status === "offered";
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function RequestCard({
  item,
  onAcceptPay,
  onContinuePayment,
  onPressProvider,
  onCancel,
  refreshingOfferId,
  cancellingRequestId,
}: {
  item: CustomRequest;
  onAcceptPay: (offerId: string) => void;
  onContinuePayment: (paymentUrl: string) => void;
  onPressProvider: () => void;
  onCancel: (requestId: string) => void;
  refreshingOfferId: string | null;
  cancellingRequestId: string | null;
}) {
  const locationLabel = formatLocationLabel(item.location_type);
  const budget = formatBudget(item.budget_min, item.budget_max);
  const hasPaidOffer = item.offers?.some((o) => o.status === "paid");
  const hasPendingOffer = item.offers?.some(canAcceptOffer);
  const hasPendingPayment = !hasPaidOffer && item.offers?.some(canContinuePayment);
  const isCancelled = item.status === "cancelled";
  const statusLabel = isCancelled
    ? "Cancelled"
    : hasPaidOffer
      ? "Paid"
      : hasPendingPayment
        ? "Payment pending"
        : hasPendingOffer
          ? "Offer to accept"
          : item.status ?? "Pending";

  const statusBg = isCancelled
    ? "#FEE2E2"
    : hasPaidOffer
      ? "#DCFCE7"
      : hasPendingPayment
        ? "#EFF6FF"
        : hasPendingOffer
          ? "#FEF3C7"
          : Colors.gray[100];
  const statusText = isCancelled
    ? "#B91C1C"
    : hasPaidOffer
      ? "#166534"
      : hasPendingPayment
        ? "#1D4ED8"
        : hasPendingOffer
          ? "#92400E"
          : Colors.gray[600];
  const showCancel = canCancelRequest(item);
  const isCancelling = cancellingRequestId === item.id;

  return (
    <View style={{ backgroundColor: Colors.white, borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.gray[100] }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <TouchableOpacity onPress={onPressProvider} activeOpacity={0.7} style={{ flexDirection: "row", alignItems: "center", flex: 1, marginRight: 12 }}>
          {item.provider?.avatar_url ? (
            <Image source={{ uri: item.provider.avatar_url }} style={{ width: 36, height: 36, borderRadius: 18, marginRight: 10 }} contentFit="cover" cachePolicy="memory-disk" transition={200} />
          ) : (
            <View style={{ alignItems: "center", justifyContent: "center", backgroundColor: Colors.primaryLight, marginRight: 10, width: 36, height: 36, borderRadius: 18 }}>
              <Text style={{ color: Colors.primary, fontWeight: "700", fontSize: 14 }}>{(item.provider?.business_name ?? "P").charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <Text style={{ fontWeight: "600", color: Colors.gray[900], flex: 1 }} numberOfLines={1}>{item.provider?.business_name ?? "Provider"}</Text>
        </TouchableOpacity>
        <View style={{ paddingHorizontal: 10, paddingVertical: 2, borderRadius: 9999, backgroundColor: statusBg }}>
          <Text style={{ fontSize: 12, fontWeight: "600", color: statusText }}>{statusLabel}</Text>
        </View>
      </View>
      <Text style={{ color: Colors.gray[700], fontSize: 14, marginBottom: 8 }}>{truncate(item.description || "No description", 120)}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 4 }}>
        {budget && <Text style={{ fontSize: 12, color: Colors.gray[500], marginRight: 12 }}>{budget}</Text>}
        {locationLabel && (
          <View style={{ flexDirection: "row", alignItems: "center", marginRight: 12 }}>
            <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.gray[300], marginRight: 8 }} />
            <Text style={{ fontSize: 12, color: Colors.gray[500] }}>{locationLabel}</Text>
          </View>
        )}
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.gray[300], marginRight: 8 }} />
          <Text style={{ fontSize: 12, color: Colors.gray[400] }}>{formatDate(item.created_at)}</Text>
        </View>
      </View>
      {item.preferred_start_at && (
        <Text style={{ fontSize: 12, color: Colors.gray[500], marginBottom: 4 }}>Preferred: {formatDateTime(item.preferred_start_at)}</Text>
      )}
      {item.location_type === "at_home" && item.address_line1 && (
        <Text style={{ fontSize: 12, color: Colors.gray[400], marginBottom: 4 }}>
          Address: {[item.address_line1, item.address_city, item.address_country].filter(Boolean).join(", ")}
        </Text>
      )}
      {showCancel && (
        <TouchableOpacity
          onPress={() => onCancel(item.id)}
          disabled={isCancelling}
          style={{ alignSelf: "flex-start", marginTop: 8, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, backgroundColor: "#FEE2E2", borderWidth: 1, borderColor: "#FECACA" }}
        >
          {isCancelling ? (
            <ActivityIndicator size="small" color="#B91C1C" />
          ) : (
            <Text style={{ fontSize: 13, fontWeight: "600", color: "#B91C1C" }}>Cancel request</Text>
          )}
        </TouchableOpacity>
      )}
      {item.offers && item.offers.length > 0 && (
        <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: Colors.gray[100], paddingTop: 12 }}>
          {item.offers.map((o) => {
            const expired = o.expiration_at && new Date(o.expiration_at).getTime() < Date.now();
            const canAccept = canAcceptOffer(o);
            const isRefreshing = refreshingOfferId === o.id;
            return (
              <View
                key={o.id}
                style={{
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 8,
                  backgroundColor: o.status === "paid" ? "#F0FDF4" : Colors.gray[50],
                  borderWidth: 1,
                  borderColor: o.status === "paid" ? "#BBF7D0" : Colors.gray[100],
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
                  <View style={{ marginRight: 8, flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900] }}>{o.currency} {o.price?.toFixed(2)} · {o.duration_minutes} min</Text>
                    <Text style={{ fontSize: 12, color: Colors.gray[500], marginTop: 2 }}>Expires {formatDateTime(o.expiration_at)}{o.travel_fee != null && o.travel_fee > 0 ? ` · Travel ${o.currency} ${o.travel_fee}` : ""}</Text>
                    {(o.location?.name || o.staff?.name) && (
                      <Text style={{ fontSize: 12, color: Colors.gray[500], marginTop: 2 }}>
                        {o.location?.name ? `Venue: ${o.location.name}` : ""}{o.location?.name && o.staff?.name ? " · " : ""}{o.staff?.name ? `Staff: ${o.staff.name}` : ""}
                      </Text>
                    )}
                    {(o.scheduled_at || item.preferred_start_at) && (
                      <Text style={{ fontSize: 12, color: Colors.gray[500], marginTop: 2 }}>Scheduled: {formatDateTime(o.scheduled_at || item.preferred_start_at!)}</Text>
                    )}
                  </View>
                  {o.status === "paid" ? (
                    <Text style={{ fontSize: 14, fontWeight: "500", color: "#15803d" }}>Paid</Text>
                  ) : expired ? (
                    <Text style={{ fontSize: 14, color: Colors.gray[500] }}>Expired</Text>
                  ) : o.status === "withdrawn" ? (
                    <Text style={{ fontSize: 14, color: Colors.gray[400] }}>Withdrawn</Text>
                  ) : canContinuePayment(o) ? (
                    <TouchableOpacity
                      onPress={() => onContinuePayment(o.payment_url!)}
                      disabled={isRefreshing}
                      style={{ backgroundColor: "#1D4ED8", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12 }}
                    >
                      {isRefreshing ? (
                        <ActivityIndicator size="small" color={Colors.white} />
                      ) : (
                        <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.white }}>Continue Payment</Text>
                      )}
                    </TouchableOpacity>
                  ) : canAccept ? (
                    <TouchableOpacity onPress={() => onAcceptPay(o.id)} disabled={isRefreshing} style={{ backgroundColor: Colors.primary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12 }}>
                      {isRefreshing ? <ActivityIndicator size="small" color={Colors.white} /> : <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.white }}>Accept & Pay</Text>}
                    </TouchableOpacity>
                  ) : null}
                </View>
                {o.notes ? <Text style={{ fontSize: 12, color: Colors.gray[600], marginTop: 8 }}>{o.notes}</Text> : null}
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
  const { contentPadding, contentMaxWidth, isTablet } = useResponsive();
  const constraint = (isTablet || Platform.OS === "web") ? { maxWidth: contentMaxWidth, alignSelf: "center" as const, width: "100%" as const } : {};

  const [data, setData] = useState<CustomRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshingOfferId, setRefreshingOfferId] = useState<string | null>(null);
  const [cancellingRequestId, setCancellingRequestId] = useState<string | null>(null);

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
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      const subscription = AppState.addEventListener("change", (state) => {
        if (state === "active") load(true);
      });
      return () => subscription.remove();
    }, [load])
  );

  const doAcceptPay = useCallback(
    async (offerId: string, paymentOption: "full" | "deposit") => {
      setRefreshingOfferId(offerId);
      try {
        const res = await api.post<{ paymentUrl?: string }>(
          `/api/me/custom-offers/${offerId}/accept`,
          { payment_option: paymentOption }
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
          router.push({
            pathname: "/(app)/in-app-browser",
            params: { url: encodeURIComponent(paymentUrl), title: "Complete payment" },
          });
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

  const handleAcceptPay = useCallback(
    (offerId: string) => {
      Alert.alert(
        "Payment Option",
        "How would you like to pay?",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Pay Deposit", onPress: () => doAcceptPay(offerId, "deposit") },
          { text: "Pay in Full", onPress: () => doAcceptPay(offerId, "full"), style: "default" },
        ],
        { cancelable: true }
      );
    },
    [doAcceptPay]
  );

  const handleContinuePayment = useCallback((paymentUrl: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({
      pathname: "/(app)/in-app-browser",
      params: { url: encodeURIComponent(paymentUrl), title: "Complete payment" },
    });
  }, []);

  const handlePressProvider = useCallback((item: CustomRequest) => {
    if (item.provider?.slug) {
      router.push({
        pathname: "/(app)/partner-profile",
        params: { slug: item.provider.slug },
      });
    }
  }, []);

  const handleCancelRequest = useCallback(
    (requestId: string) => {
      Alert.alert(
        "Cancel this request?",
        "The provider will be notified. You can submit a new request later.",
        [
          { text: "Keep request", style: "cancel" },
          {
            text: "Cancel request",
            style: "destructive",
            onPress: async () => {
              setCancellingRequestId(requestId);
              try {
                const res = await api.post<{ cancelled?: boolean }>(
                  `/api/me/custom-requests/${requestId}/cancel`,
                  {}
                );
                if (res.error) {
                  Alert.alert(
                    "Error",
                    (res.error as { message?: string })?.message ?? "Failed to cancel request"
                  );
                  return;
                }
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                await load(true);
              } catch (e) {
                Alert.alert("Error", e instanceof Error ? e.message : "Failed to cancel request");
              } finally {
                setCancellingRequestId(null);
              }
            },
          },
        ]
      );
    },
    [load]
  );

  if (loading && data.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.white, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={{ color: Colors.gray[600], marginTop: 16 }}>Loading…</Text>
      </View>
    );
  }

  if (error && data.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.white, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Text style={{ textAlign: "center", color: Colors.gray[700], marginBottom: 16 }}>{error}</Text>
        <TouchableOpacity onPress={() => load()} style={{ backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}>
          <Text style={{ color: Colors.white, fontWeight: "600" }}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.gray[50] }}>
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <RequestCard
            item={item}
            onAcceptPay={handleAcceptPay}
            onContinuePayment={handleContinuePayment}
            onPressProvider={() => handlePressProvider(item)}
            onCancel={handleCancelRequest}
            refreshingOfferId={refreshingOfferId}
            cancellingRequestId={cancellingRequestId}
          />
        )}
        contentContainerStyle={{ padding: contentPadding, paddingBottom: 48, ...constraint }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={Colors.primary} />}
        ListEmptyComponent={
          <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 64 }}>
            <Text style={{ fontSize: 18, fontWeight: "600", color: Colors.gray[900], marginBottom: 8 }}>No custom requests</Text>
            <Text style={{ textAlign: "center", color: Colors.gray[500], paddingHorizontal: 32 }}>Create a custom service request from any provider profile</Text>
          </View>
        }
      />
    </View>
  );
}
