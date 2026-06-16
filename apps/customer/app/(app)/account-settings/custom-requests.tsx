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
  Modal,
  Pressable,
  ScrollView,
} from "react-native";
import { useFocusEffect, router } from "expo-router";
import { Image } from "expo-image";
import { api } from "@/lib/api-client";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { useResponsive } from "@/hooks/useResponsive";
import { Colors } from "@/constants/colors";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";
import * as Haptics from "expo-haptics";
import { verticalFlatListPerf } from "@/lib/flatListPerformance";
import { useTranslation } from "@beautonomi/i18n";

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
  attachments?: Array<{ id: string; url: string; created_at?: string }>;
}

type OfferDetailData = {
  id: string;
  status: string;
  price?: number;
  currency?: string;
  duration_minutes?: number;
  expiration_at?: string | null;
  notes?: string | null;
  travel_fee?: number | null;
  booking_id?: string | null;
  payment_reference?: string | null;
  request?: {
    service_name?: string | null;
    description?: string | null;
    location_type?: string | null;
    preferred_start_at?: string | null;
    address_line1?: string | null;
    address_line2?: string | null;
    address_city?: string | null;
    address_state?: string | null;
    address_postal_code?: string | null;
  } | null;
};

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
    offer.status === "declined" ||
    offer.status === "finalize_failed" ||
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

/** Parent request must be open — offer-level checks alone are not enough (e.g. cancelled request can still list stale offers). */
function requestAllowsOfferActions(item: CustomRequest): boolean {
  return item.status === "pending" || item.status === "offered";
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function RequestCard({
  item,
  onPayOffer,
  onDeclineOffer,
  onPressProvider,
  onCancel,
  onViewOfferDetail,
  cancellingRequestId,
  decliningOfferId,
}: {
  item: CustomRequest;
  /** Opens canonical checkout (Bearer verify + Paystack return), same as chat. */
  onPayOffer: (offerId: string) => void;
  onDeclineOffer: (offerId: string) => void;
  onPressProvider: () => void;
  onCancel: (requestId: string) => void;
  onViewOfferDetail: (offerId: string) => void;
  cancellingRequestId: string | null;
  decliningOfferId: string | null;
}) {
  const locationLabel = formatLocationLabel(item.location_type);
  const budget = formatBudget(item.budget_min, item.budget_max);
  const hasPaidOffer = item.offers?.some((o) => o.status === "paid");
  const actionsAllowed = requestAllowsOfferActions(item);
  const hasPendingOffer = actionsAllowed && item.offers?.some(canAcceptOffer);
  const hasPendingPayment =
    actionsAllowed && !hasPaidOffer && item.offers?.some(canContinuePayment);
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
      {item.attachments && item.attachments.length > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
          {item.attachments.slice(0, 4).map((att) => (
            <Image
              key={att.id}
              source={{ uri: att.url }}
              style={{ width: 64, height: 64, borderRadius: 8 }}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
          ))}
        </View>
      ) : null}
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
      {item.offers && item.offers.length > 0 && (() => {
        const allInactive = item.offers!.every(
          (o) => o.status === "withdrawn" || o.status === "expired" || (o.expiration_at && new Date(o.expiration_at).getTime() < Date.now())
        );
        const isOpenRequest = item.status === "pending" || item.status === "offered";
        return (
        <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: Colors.gray[100], paddingTop: 12 }}>
          {allInactive && isOpenRequest ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, backgroundColor: "#EFF6FF", marginBottom: 8 }}>
              <Text style={{ fontSize: 13, color: "#1D4ED8", flex: 1 }}>
                All offers have been withdrawn or expired. Your request is still open — a new offer may arrive.
              </Text>
            </View>
          ) : null}
          {item.offers!.map((o) => {
            const expired = o.expiration_at && new Date(o.expiration_at).getTime() < Date.now();
            const canAccept = actionsAllowed && canAcceptOffer(o);
            const canPayContinue = actionsAllowed && canContinuePayment(o);
            return (
              <TouchableOpacity
                key={o.id}
                activeOpacity={0.8}
                onPress={() => onViewOfferDetail(o.id)}
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
                  ) : o.status === "declined" ? (
                    <Text style={{ fontSize: 14, color: Colors.gray[400] }}>Declined</Text>
                  ) : o.status === "finalize_failed" ? (
                    <Text style={{ fontSize: 14, color: "#B91C1C", fontWeight: "600" }}>Needs support</Text>
                  ) : canPayContinue ? (
                    <TouchableOpacity
                      onPress={() => onPayOffer(o.id)}
                      style={{ backgroundColor: "#1D4ED8", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12 }}
                    >
                      <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.white }}>Continue Payment</Text>
                    </TouchableOpacity>
                  ) : canAccept ? (
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <TouchableOpacity
                        onPress={() => onDeclineOffer(o.id)}
                        disabled={decliningOfferId === o.id}
                        style={{ borderWidth: 1, borderColor: Colors.gray[300], paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, opacity: decliningOfferId === o.id ? 0.6 : 1 }}
                      >
                        <Text style={{ fontSize: 13, fontWeight: "600", color: Colors.gray[700] }}>
                          {decliningOfferId === o.id ? "…" : "Decline"}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => onPayOffer(o.id)} style={{ backgroundColor: Colors.primary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12 }}>
                        <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.white }}>Accept & Pay</Text>
                      </TouchableOpacity>
                    </View>
                  ) : !actionsAllowed && o.status !== "paid" ? (
                    <Text style={{ fontSize: 13, fontWeight: "500", color: Colors.gray[500] }}>Closed</Text>
                  ) : null}
                </View>
                {o.notes ? <Text style={{ fontSize: 12, color: Colors.gray[600], marginTop: 8 }}>{o.notes}</Text> : null}
              </TouchableOpacity>
            );
          })}
        </View>
        );
      })()}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function CustomRequestsScreen() {
  useScreenTracking("Custom Requests");
  const { t } = useTranslation();
  const errTitle = t("customer.mobile.screens.authLogin.errorTitle");
  const crl = useCallback(
    (key: string) => t(`customer.mobile.screens.customRequestsList.${key}`) as string,
    [t],
  );
  const { contentPadding, contentMaxWidth, isTablet } = useResponsive();
  const constraint = (isTablet || Platform.OS === "web") ? { maxWidth: contentMaxWidth, alignSelf: "center" as const, width: "100%" as const } : {};

  const [data, setData] = useState<CustomRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancellingRequestId, setCancellingRequestId] = useState<string | null>(null);
  const [decliningOfferId, setDecliningOfferId] = useState<string | null>(null);
  const [offerDetailVisible, setOfferDetailVisible] = useState(false);
  const [offerDetailLoading, setOfferDetailLoading] = useState(false);
  const [offerDetailData, setOfferDetailData] = useState<OfferDetailData | null>(null);

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

  const openCustomOfferCheckout = useCallback((offerId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({
      pathname: "/(app)/custom-offer-checkout",
      params: { offer_id: offerId },
    } as never);
  }, []);

  const handlePressProvider = useCallback((item: CustomRequest) => {
    if (item.provider?.slug) {
      router.push({
        pathname: "/(app)/partner-profile",
        params: { slug: item.provider.slug },
      });
    }
  }, []);

  const openOfferDetail = useCallback(async (offerId: string) => {
    setOfferDetailData(null);
    setOfferDetailVisible(true);
    setOfferDetailLoading(true);
    try {
      const res = await api.get<OfferDetailData>(`/api/me/custom-offers/${offerId}`);
      if (res.data) setOfferDetailData(res.data);
    } catch {
      // sheet shows error state
    } finally {
      setOfferDetailLoading(false);
    }
  }, []);

  const handleDeclineOffer = useCallback(
    (offerId: string) => {
      Alert.alert("Decline offer?", "The provider will be notified that you declined this custom offer.", [
        { text: "Keep offer", style: "cancel" },
        {
          text: "Decline",
          style: "destructive",
          onPress: async () => {
            setDecliningOfferId(offerId);
            try {
              const res = await api.post(`/api/me/custom-offers/${offerId}/decline`, {});
              if (res.error) {
                Alert.alert(errTitle, (res.error as { message?: string })?.message ?? "Failed to decline offer");
                return;
              }
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              setOfferDetailVisible(false);
              await load(true);
            } catch (e) {
              Alert.alert(errTitle, e instanceof Error ? e.message : "Failed to decline offer");
            } finally {
              setDecliningOfferId(null);
            }
          },
        },
      ]);
    },
    [errTitle, load],
  );

  const handleCancelRequest = useCallback(
    (requestId: string) => {
      Alert.alert(crl("cancelRequestTitle"), crl("cancelRequestBody"), [
        { text: crl("keepRequestCta"), style: "cancel" },
        {
          text: crl("cancelRequestCta"),
          style: "destructive",
          onPress: async () => {
            setCancellingRequestId(requestId);
            try {
              const res = await api.post<{ cancelled?: boolean }>(
                `/api/me/custom-requests/${requestId}/cancel`,
                {}
              );
              if (res.error) {
                Alert.alert(errTitle, (res.error as { message?: string })?.message ?? crl("cancelRequestFailed"));
                return;
              }
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              await load(true);
            } catch (e) {
              Alert.alert(errTitle, e instanceof Error ? e.message : crl("cancelRequestFailed"));
            } finally {
              setCancellingRequestId(null);
            }
          },
        },
      ]);
    },
    [load, crl, errTitle]
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
        {...verticalFlatListPerf}
        data={data}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <RequestCard
            item={item}
            onPayOffer={openCustomOfferCheckout}
            onDeclineOffer={handleDeclineOffer}
            onPressProvider={() => handlePressProvider(item)}
            onCancel={handleCancelRequest}
            onViewOfferDetail={openOfferDetail}
            cancellingRequestId={cancellingRequestId}
            decliningOfferId={decliningOfferId}
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

      {/* Offer Detail Sheet */}
      <Modal
        visible={offerDetailVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setOfferDetailVisible(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" }}
          onPress={() => setOfferDetailVisible(false)}
        >
          <Pressable
            style={{
              backgroundColor: Colors.white,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              paddingTop: 8,
              paddingBottom: 36,
              maxHeight: "88%",
            }}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.gray[200], alignSelf: "center", marginBottom: 14 }} />
            <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, marginBottom: 18 }}>
              <Text style={{ flex: 1, fontSize: 17, fontWeight: "700", color: Colors.gray[900] }}>Offer details</Text>
              <TouchableOpacity onPress={() => setOfferDetailVisible(false)} hitSlop={12}>
                <Text style={{ fontSize: 22, color: Colors.gray[400] }}>×</Text>
              </TouchableOpacity>
            </View>
            {offerDetailLoading ? (
              <View style={{ alignItems: "center", paddingVertical: 40 }}>
                <ActivityIndicator size="large" color={Colors.primary} />
              </View>
            ) : !offerDetailData ? (
              <View style={{ alignItems: "center", paddingVertical: 40, paddingHorizontal: 20 }}>
                <Text style={{ color: Colors.gray[500], textAlign: "center" }}>Could not load offer details.</Text>
              </View>
            ) : (() => {
              const d = offerDetailData;
              const req = d.request;
              const isExpired = d.status === "expired";
              const isWithdrawn = d.status === "withdrawn";
              const isDeclined = d.status === "declined";
              const isFinalizeFailed = d.status === "finalize_failed";
              const isPaid = d.status === "paid";
              const isPending = d.status === "pending";

              const fmtDate = (iso: string | null | undefined) => {
                if (!iso) return "—";
                return new Date(iso).toLocaleString("en-ZA", {
                  weekday: "short", day: "numeric", month: "short", year: "numeric",
                  hour: "2-digit", minute: "2-digit",
                });
              };

              const statusBadge = isFinalizeFailed
                ? { label: "Needs support", bg: "#FEE2E2", text: "#B91C1C" }
                : isDeclined
                  ? { label: "Declined", bg: "#F3F4F6", text: "#6B7280" }
                  : isWithdrawn
                ? { label: "Withdrawn", bg: "#FEF3C7", text: "#92400E" }
                : isExpired
                ? { label: "Expired", bg: "#F3F4F6", text: "#6B7280" }
                : isPaid
                ? { label: "Booked ✓", bg: "#DCFCE7", text: "#166534" }
                : d.status === "payment_pending"
                ? { label: "Payment in progress", bg: "#DBEAFE", text: "#1D4ED8" }
                : { label: "Pending acceptance", bg: "#EFF6FF", text: "#1E40AF" };

              const locLabel = req?.location_type === "at_home" ? "At home" : req?.location_type === "at_salon" ? "At salon" : req?.location_type ?? "—";
              const addrParts = [req?.address_line1, req?.address_line2, req?.address_city, req?.address_state, req?.address_postal_code].filter(Boolean);

              return (
                <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8 }} showsVerticalScrollIndicator={false}>
                  <View style={{ alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: statusBadge.bg, marginBottom: 16 }}>
                    <Text style={{ color: statusBadge.text, fontSize: 12, fontWeight: "700" }}>{statusBadge.label}</Text>
                  </View>
                  {req?.service_name ? (
                    <Text style={{ fontSize: 20, fontWeight: "700", color: Colors.gray[900], marginBottom: 4 }}>{req.service_name}</Text>
                  ) : null}
                  <Text style={{ fontSize: 28, fontWeight: "800", color: Colors.primary, marginBottom: 4 }}>
                    {d.currency || ""} {typeof d.price === "number" ? d.price.toFixed(2) : "—"}
                    {typeof d.travel_fee === "number" && d.travel_fee > 0
                      ? `  + ${d.currency} ${d.travel_fee.toFixed(2)} travel`
                      : ""}
                  </Text>
                  {req?.description ? (
                    <Text style={{ color: Colors.gray[600], fontSize: 14, marginBottom: 14, lineHeight: 20 }}>{req.description}</Text>
                  ) : null}
                  <View style={{ gap: 10 }}>
                    {d.duration_minutes ? (
                      <Text style={{ color: Colors.gray[700], fontSize: 14 }}>⏱ {d.duration_minutes} min</Text>
                    ) : null}
                    {req?.preferred_start_at ? (
                      <Text style={{ color: Colors.gray[700], fontSize: 14 }}>📅 {fmtDate(req.preferred_start_at)}</Text>
                    ) : null}
                    {d.expiration_at ? (
                      <Text style={{ color: isExpired ? "#B45309" : Colors.gray[700], fontSize: 14 }}>⏳ Offer expires: {fmtDate(d.expiration_at)}</Text>
                    ) : null}
                    {req?.location_type ? (
                      <View>
                        <Text style={{ color: Colors.gray[700], fontSize: 14 }}>📍 {locLabel}</Text>
                        {addrParts.length > 0 ? (
                          <Text style={{ color: Colors.gray[500], fontSize: 12, marginTop: 2, marginLeft: 20 }}>{addrParts.join(", ")}</Text>
                        ) : null}
                      </View>
                    ) : null}
                    {d.notes ? (
                      <Text style={{ color: Colors.gray[700], fontSize: 14, lineHeight: 20 }}>📝 {d.notes}</Text>
                    ) : null}
                  </View>
                  {isFinalizeFailed ? (
                    <Text style={{ marginTop: 16, color: "#B91C1C", fontSize: 14, lineHeight: 20 }}>
                      Payment was received but booking setup failed. Please contact support
                      {d.payment_reference ? ` and quote reference ${d.payment_reference}` : ""}.
                    </Text>
                  ) : null}
                  {isPending && d.id ? (
                    <View style={{ marginTop: 24, gap: 10 }}>
                      <TouchableOpacity
                        onPress={() => {
                          setOfferDetailVisible(false);
                          setTimeout(() => openCustomOfferCheckout(d.id), 300);
                        }}
                        style={{ borderRadius: 12, backgroundColor: Colors.primary, alignItems: "center", paddingVertical: 14 }}
                      >
                        <Text style={{ color: Colors.white, fontSize: 15, fontWeight: "700" }}>Accept & Pay</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleDeclineOffer(d.id)}
                        disabled={decliningOfferId === d.id}
                        style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[300], alignItems: "center", paddingVertical: 14, opacity: decliningOfferId === d.id ? 0.6 : 1 }}
                      >
                        <Text style={{ color: Colors.gray[700], fontSize: 15, fontWeight: "600" }}>
                          {decliningOfferId === d.id ? "Declining…" : "Decline offer"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : d.status === "payment_pending" && d.id ? (
                    <TouchableOpacity
                      onPress={() => {
                        setOfferDetailVisible(false);
                        setTimeout(() => openCustomOfferCheckout(d.id), 300);
                      }}
                      style={{ marginTop: 24, borderRadius: 12, backgroundColor: "#1D4ED8", alignItems: "center", paddingVertical: 14 }}
                    >
                      <Text style={{ color: Colors.white, fontSize: 15, fontWeight: "700" }}>Continue payment</Text>
                    </TouchableOpacity>
                  ) : isPaid && d.booking_id ? (
                    <TouchableOpacity
                      onPress={() => {
                        setOfferDetailVisible(false);
                        setTimeout(() => router.push({ pathname: "/(app)/booking-detail", params: { id: d.booking_id! } }), 300);
                      }}
                      style={{ marginTop: 24, borderRadius: 12, backgroundColor: "#166534", alignItems: "center", paddingVertical: 14 }}
                    >
                      <Text style={{ color: Colors.white, fontSize: 15, fontWeight: "700" }}>View Booking</Text>
                    </TouchableOpacity>
                  ) : null}
                </ScrollView>
              );
            })()}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
