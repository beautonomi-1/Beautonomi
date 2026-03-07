import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  Linking,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Pressable,
  Alert,
  Share,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, Stack, router } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { useModuleConfig } from "@/providers/ConfigBundleProvider";
import { APP_URL } from "@/config/public-env";
import { api } from "@/lib/api-client";
import { Colors } from "@/constants/colors";
import { usePaystackPayment } from "@/hooks/usePaystackPayment";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { useResponsive } from "@/hooks/useResponsive";
import { StaticMapImage } from "@/components/StaticMapImage";
import { SafetyPanicButton } from "@/components/SafetyPanicButton";
import { haptic } from "@/lib/haptics";
import { supabase } from "@/lib/supabase/client";

function formatDate(s: string) {
  return new Date(s).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
function formatTime(s: string) {
  return new Date(s).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export default function BookingDetailScreen() {
  useScreenTracking("Booking Detail");
  const { id } = useLocalSearchParams<{ id: string }>();
  const { contentPadding, contentMaxWidth, isTablet } = useResponsive();
  const constraint = (isTablet || Platform.OS === "web") ? { maxWidth: contentMaxWidth, alignSelf: "center" as const, width: "100%" as const } : {};
  const { user } = useAuth();
  const onDemandConfig = useModuleConfig("on_demand");
  const { pay, loading: payLoading, error: payError } = usePaystackPayment();
  const [booking, setBooking] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [activeTab, setActiveTab] = useState<"tracking" | "receipt" | "details">("tracking");

  const load = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<any>(`/api/me/bookings/${id}`);
      if (res.error) {
        setError(res.error.message || "Failed to load");
        setBooking(null);
      } else {
        setBooking(res.data);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setBooking(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load on id change only
  }, [id]);

  // Realtime booking status updates
  useEffect(() => {
    if (!id) return;

    const channel = supabase
      .channel(`booking-detail-${id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "bookings",
          filter: `id=eq.${id}`,
        },
        (payload) => {
          if (payload.new) {
            setBooking((prev: any) => (prev ? { ...prev, ...payload.new } : prev));
            haptic.success();
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  const handleCancel = useCallback(async () => {
    if (!booking) return;
    Alert.alert(
      "Cancel Booking",
      "Are you sure you want to cancel this booking? Cancellation fees may apply.",
      [
        { text: "Keep Booking", style: "cancel" },
        {
          text: "Cancel Booking",
          style: "destructive",
          onPress: async () => {
            setCancelling(true);
            haptic.medium();
            try {
              const res = await api.post(`/api/me/bookings/${id}/cancel`, {});
              if (res.error) {
                Alert.alert("Error", res.error.message || "Failed to cancel");
              } else {
                haptic.success();
                load();
              }
            } catch (e) {
              Alert.alert("Error", e instanceof Error ? e.message : "Failed to cancel");
            } finally {
              setCancelling(false);
            }
          },
        },
      ],
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps -- load is stable
  }, [booking, id]);

  const handleReschedule = useCallback(() => {
    if (!booking) return;
    haptic.light();
    const provider = booking.provider;
    if (provider?.slug) {
      router.push({
        pathname: "/(app)/book",
        params: {
          slug: provider.slug,
          service_id: booking.services?.[0]?.offering_id ?? "",
          reschedule_booking_id: booking.id,
        },
      });
    } else {
      openInBrowser();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- openInBrowser stable
  }, [booking]);

  const needsPayment =
    booking &&
    (booking.status === "pending" || booking.payment_status === "pending") &&
    booking.total_amount > 0;

  const handlePay = async () => {
    if (!booking || !user?.email) return;
    const result = await pay({
      booking_id: booking.id,
      amount: booking.total_amount,
      email: user.email,
      currency: booking.currency || "ZAR",
    });
    if (result.dismissed) {
      load();
    }
  };

  const openInBrowser = () => {
    const url = id
      ? `${APP_URL}/account-settings/bookings/${id}`
      : `${APP_URL}/account-settings/bookings`;
    Linking.openURL(url);
  };

  if (loading && !booking) {
    return (
      <>
        <Stack.Screen options={{ title: "Booking", headerBackTitle: "Back" }} />
        <View style={{ flex: 1, backgroundColor: Colors.white, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </>
    );
  }

  if (error && !booking) {
    return (
      <>
        <Stack.Screen options={{ title: "Booking", headerBackTitle: "Back" }} />
        <View style={{ flex: 1, backgroundColor: Colors.white, padding: 24, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: Colors.gray[600], marginBottom: 16 }}>{error}</Text>
          <TouchableOpacity onPress={load} style={{ backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}>
            <Text style={{ color: Colors.white, fontWeight: "600" }}>Retry</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }

  if (!booking) return null;

  const provider = booking.provider;
  const location = booking.location;
  const services = booking.services ?? booking.booking_services ?? [];
  const isActive = ["pending", "confirmed", "started", "in_progress"].includes(booking.status);
  const canCancel = isActive && booking.status !== "started" && booking.status !== "in_progress";
  const bookingRef = booking.booking_number || (booking.id ? booking.id.slice(0, 8).toUpperCase() : "");
  const helpUrl = (onDemandConfig?.ui_copy as Record<string, string> | undefined)?.waiting_help_url?.trim();

  const isAtHome = booking.location_type === "at_home";
  const isProviderEnRoute =
    booking.current_stage === "provider_on_way" || !!(booking as any).provider_en_route_at;
  const isProviderArrived =
    booking.current_stage === "provider_arrived" || !!(booking as any).provider_arrived_at;
  const estimatedArrival = (booking as any).estimated_arrival
    ? new Date((booking as any).estimated_arrival)
    : null;

  return (
    <>
      <Stack.Screen
        options={{
          title: bookingRef ? `Booking #${bookingRef}` : "Booking Details",
          headerBackTitle: "Back",
        }}
      />
      <ScrollView style={{ flex: 1, backgroundColor: Colors.white }} contentContainerStyle={{ padding: contentPadding, paddingBottom: 48, ...constraint }}>
        {/* Acceptance / confirmation strip (for confirmed/pending/started) */}
        {isActive && (
          <View style={{ marginBottom: 16, borderRadius: 16, backgroundColor: "#F0FDF4", borderWidth: 1, borderColor: "#BBF7D0", padding: 16 }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "#DCFCE7", alignItems: "center", justifyContent: "center", marginRight: 12 }}>
                <Ionicons name="checkmark-circle" size={24} color="#16a34a" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: "600", color: Colors.gray[900] }}>Booking confirmed {formatTime(booking.selected_datetime)}</Text>
                <Text style={{ fontSize: 14, color: Colors.gray[600], marginTop: 2 }}>Your booking with {provider?.business_name || "your provider"} is confirmed.</Text>
              </View>
            </View>
            {helpUrl ? (
              <TouchableOpacity
                onPress={() => Linking.openURL(helpUrl)}
                style={{ marginTop: 12, flexDirection: "row", alignItems: "center" }}
                accessibilityRole="link"
                accessibilityLabel="Help"
              >
                <Ionicons name="help-circle-outline" size={18} color="#16a34a" />
                <Text style={{ marginLeft: 8, fontSize: 14, fontWeight: "500", color: "#15803d" }}>Help</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}

        {/* Tabs: Tracking | Receipt | Details */}
        <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: Colors.gray[200], marginBottom: 16 }}>
          {(["tracking", "receipt", "details"] as const).map((tab) => (
            <TouchableOpacity
              key={tab}
              onPress={() => { haptic.light(); setActiveTab(tab); }}
              style={{ flex: 1, paddingVertical: 12, alignItems: "center", borderBottomWidth: 2, borderBottomColor: activeTab === tab ? Colors.primary : "transparent" }}
              accessibilityRole="tab"
              accessibilityState={{ selected: activeTab === tab }}
              accessibilityLabel={tab === "tracking" ? "Tracking" : tab === "receipt" ? "Receipt" : "Details"}
            >
              <Text style={{ fontSize: 14, fontWeight: "500", color: activeTab === tab ? Colors.primary : Colors.gray[500] }}>
                {tab === "tracking" ? "Tracking" : tab === "receipt" ? "Receipt" : "Details"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {activeTab === "tracking" && (
          <>
            {/* Status block */}
            <View style={{ marginBottom: 16, borderRadius: 16, backgroundColor: "#F8FAFC", borderWidth: 1, borderColor: "#E2E8F0", padding: 20 }}>
              <Text style={{ fontSize: 18, fontWeight: "600", color: Colors.gray[900] }}>
                {booking.status === "completed"
                  ? "Service completed"
                  : booking.status === "started" || booking.status === "in_progress"
                    ? "Service in progress"
                    : booking.status === "cancelled"
                      ? "Booking cancelled"
                      : isProviderArrived
                        ? "Provider has arrived"
                        : isProviderEnRoute
                          ? "Provider on the way"
                          : "Your visit is confirmed"}
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 12 }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primaryLight, alignItems: "center", justifyContent: "center", marginRight: 12, marginBottom: 12 }}>
                  <Ionicons name="cut-outline" size={20} color={Colors.primary} />
                </View>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primaryLight, alignItems: "center", justifyContent: "center", marginRight: 12, marginBottom: 12 }}>
                  <Ionicons name="brush-outline" size={20} color={Colors.primary} />
                </View>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primaryLight, alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
                  <Ionicons name="sparkles-outline" size={20} color={Colors.primary} />
                </View>
              </View>
            </View>
            {/* ETA (at-home, when provider en route and backend provides it) */}
            {isAtHome && isProviderEnRoute && estimatedArrival && (
              <View style={{ marginBottom: 16, borderRadius: 16, backgroundColor: "#EFF6FF", borderWidth: 1, borderColor: "#BFDBFE", padding: 16 }}>
                <Text style={{ fontSize: 14, fontWeight: "500", color: "#1E3A8A" }}>Estimated arrival</Text>
                <Text style={{ fontSize: 16, color: "#1E40AF", marginTop: 2 }}>
                  {formatTime(estimatedArrival.toISOString())}
                  {" · "}
                  Arriving in ~
                  {Math.max(1, Math.ceil((estimatedArrival.getTime() - Date.now()) / 60000))} min
                </Text>
              </View>
            )}
            {/* Milestones (at-home: en route / arrived; at-salon: preparing / in progress) */}
            <View style={{ marginBottom: 16 }}>
              {(
                booking.status === "cancelled"
                  ? [
                      { key: "confirmed", label: "Booking confirmed", done: true },
                      { key: "cancelled", label: "Booking cancelled", done: true },
                    ]
                  : isAtHome
                    ? [
                        { key: "confirmed", label: "Booking confirmed", done: ["pending", "confirmed", "started", "completed", "in_progress"].includes(booking.status) || isProviderEnRoute || isProviderArrived },
                        { key: "en_route", label: "Provider en route", done: isProviderEnRoute || isProviderArrived || ["started", "completed", "in_progress"].includes(booking.status) },
                        { key: "arrived", label: "Provider arrived", done: isProviderArrived || ["started", "completed", "in_progress"].includes(booking.status) },
                        { key: "in_progress", label: "Service in progress", done: ["started", "completed", "in_progress"].includes(booking.status) },
                        { key: "completed", label: "Completed", done: booking.status === "completed" },
                      ]
                    : [
                        { key: "confirmed", label: "Booking confirmed", done: ["pending", "confirmed", "started", "completed", "in_progress"].includes(booking.status) },
                        { key: "preparing", label: "Preparing for your visit", done: ["confirmed", "started", "completed", "in_progress"].includes(booking.status) },
                        { key: "in_progress", label: "Service in progress", done: ["started", "completed", "in_progress"].includes(booking.status) },
                        { key: "completed", label: "Completed", done: booking.status === "completed" },
                      ]
              ).map((step: { key: string; label: string; done: boolean }) => (
                <View key={step.key} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8 }}>
                  <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", marginRight: 12, backgroundColor: step.done ? "#DCFCE7" : Colors.gray[100] }}>
                    {step.done ? (
                      <Ionicons name="checkmark" size={14} color="#16a34a" />
                    ) : (
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.gray[300] }} />
                    )}
                  </View>
                  <Text style={{ color: step.done ? Colors.gray[900] : Colors.gray[400], fontWeight: step.done ? "500" : "400" }}>{step.label}</Text>
                </View>
              ))}
            </View>
            {/* Scheduled time */}
            <View style={{ borderRadius: 16, backgroundColor: Colors.gray[50], padding: 16, marginBottom: 16 }}>
              <Text style={{ fontSize: 12, color: Colors.gray[500], marginBottom: 4 }}>Scheduled for</Text>
              <Text style={{ fontSize: 16, fontWeight: "600", color: Colors.gray[900] }}>{formatDate(booking.selected_datetime)}</Text>
              <Text style={{ fontSize: 14, color: Colors.gray[600], marginTop: 2 }}>{formatTime(booking.selected_datetime)}</Text>
              {provider?.business_name ? (
                <Text style={{ fontSize: 14, color: Colors.gray[500], marginTop: 8 }}>at {provider.business_name}</Text>
              ) : null}
            </View>
          </>
        )}

        {activeTab === "receipt" && (
          <>
            <View style={{ marginBottom: 16, borderRadius: 16, backgroundColor: Colors.gray[50], padding: 16 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900], marginBottom: 8 }}>Payment</Text>
              {booking.subtotal != null && (
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                  <Text style={{ fontSize: 14, color: Colors.gray[500] }}>Subtotal</Text>
                  <Text style={{ fontSize: 14, color: Colors.gray[700] }}>{booking.currency} {Number(booking.subtotal).toFixed(2)}</Text>
                </View>
              )}
              {booking.tax_amount > 0 && (
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                  <Text style={{ fontSize: 14, color: Colors.gray[500] }}>Tax</Text>
                  <Text style={{ fontSize: 14, color: Colors.gray[700] }}>{booking.currency} {Number(booking.tax_amount).toFixed(2)}</Text>
                </View>
              )}
              {booking.discount_amount > 0 && (
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                  <Text style={{ fontSize: 14, color: Colors.gray[500] }}>Discount</Text>
                  <Text style={{ fontSize: 14, color: "#16a34a" }}>-{booking.currency} {Number(booking.discount_amount).toFixed(2)}</Text>
                </View>
              )}
              <View style={{ flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: Colors.gray[200], paddingTop: 8, marginTop: 4 }}>
                <Text style={{ fontSize: 16, fontWeight: "700", color: Colors.gray[900] }}>Total</Text>
                <Text style={{ fontSize: 16, fontWeight: "700", color: Colors.gray[900] }}>{booking.currency} {Number(booking.total_amount || 0).toFixed(2)}</Text>
              </View>
              {booking.payment_status && (
                <View style={{ marginTop: 8, flexDirection: "row", alignItems: "center" }}>
                  <View style={{ height: 8, width: 8, borderRadius: 4, marginRight: 8, backgroundColor: booking.payment_status === "paid" ? "#22C55E" : "#F59E0B" }} />
                  <Text style={{ fontSize: 12, color: Colors.gray[500], textTransform: "capitalize" }}>{booking.payment_status}</Text>
                </View>
              )}
            </View>
            {payError && (
              <View style={{ backgroundColor: "#FEF2F2", borderRadius: 12, padding: 12, marginBottom: 16 }}>
                <Text style={{ color: "#B91C1C" }}>{payError}</Text>
              </View>
            )}
            {needsPayment && (
              <Pressable onPress={handlePay} disabled={payLoading} style={{ backgroundColor: Colors.primary, paddingVertical: 16, borderRadius: 12, alignItems: "center", marginBottom: 12 }} accessibilityRole="button" accessibilityLabel="Pay now">
                {payLoading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: Colors.white, fontWeight: "600", fontSize: 16 }}>Pay Now</Text>}
              </Pressable>
            )}
            <View style={{ flexDirection: "row" }}>
              <TouchableOpacity
                style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], marginRight: 12 }}
                onPress={() => {
                  haptic.light();
                  const lines = [
                    `Beautonomi Booking`,
                    `Booking #${booking.booking_number || booking.id?.slice(0, 8) || ""}`,
                    ``,
                    `Provider: ${provider?.business_name || "N/A"}`,
                    `Date: ${formatDate(booking.selected_datetime)}`,
                    `Time: ${formatTime(booking.selected_datetime)}`,
                    `Status: ${booking.status}`,
                    ``,
                    ...(services || []).map((svc: any) => `• ${svc.offering_name || svc.service_name || "Service"} – ${booking.currency} ${Number(svc.price || 0).toFixed(2)}`),
                    ``,
                    `Total: ${booking.currency} ${Number(booking.total_amount || 0).toFixed(2)}`,
                    ``,
                    `View: ${APP_URL}/account-settings/bookings/${booking.id}`,
                  ];
                  Share.share({ message: lines.join("\n"), title: "Booking" });
                }}
                accessibilityRole="button"
                accessibilityLabel="Share"
              >
                <Ionicons name="share-outline" size={16} color={Colors.gray[700]} />
                <Text style={{ marginLeft: 8, fontWeight: "500", color: Colors.gray[700] }}>Share</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { haptic.light(); Linking.openURL(`${APP_URL}/account-settings/bookings/${booking.id}?print=1`); }}
                style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200] }}
                accessibilityRole="button"
                accessibilityLabel="Download"
              >
                <Ionicons name="download-outline" size={16} color={Colors.gray[700]} />
                <Text style={{ marginLeft: 8, fontWeight: "500", color: Colors.gray[700] }}>Download</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {activeTab === "details" && (
          <>
        {/* Provider & Status */}
        <View style={{ marginBottom: 16, borderRadius: 16, backgroundColor: Colors.gray[50], padding: 16 }}>
          {booking.is_group_booking && booking.group_booking_ref && (
            <View style={{ marginBottom: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: Colors.gray[200] }}>
              <Text style={{ fontSize: 12, color: Colors.gray[500] }}>Group booking</Text>
              <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>{booking.group_booking_ref}</Text>
            </View>
          )}
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 18, fontWeight: "600", color: Colors.gray[900] }}>{provider?.business_name || "Provider"}</Text>
              <Text style={{ color: Colors.gray[600], marginTop: 4 }}>{formatDate(booking.selected_datetime)}</Text>
              <Text style={{ color: Colors.gray[500], fontSize: 14 }}>{formatTime(booking.selected_datetime)}</Text>
            </View>
            <View
              style={{
                paddingHorizontal: 12,
                paddingVertical: 4,
                borderRadius: 9999,
                backgroundColor: booking.status === "confirmed" ? "#DCFCE7" : booking.status === "cancelled" ? "#FEE2E2" : booking.status === "completed" ? "#DBEAFE" : "#FEF3C7",
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "600",
                  textTransform: "capitalize",
                  color: booking.status === "confirmed" ? "#15803d" : booking.status === "cancelled" ? "#B91C1C" : booking.status === "completed" ? "#1D4ED8" : "#B45309",
                }}
              >
                {booking.status}
              </Text>
            </View>
          </View>
        </View>

        {/* Services */}
        {services.length > 0 && (
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900], marginBottom: 8 }}>Services</Text>
            {services.map((svc: Record<string, unknown>, i: number) => {
              const svcName = String(svc.offering_name ?? svc.service_name ?? svc.title ?? svc.name ?? `Service ${i + 1}`);
              const duration = svc.duration_minutes ? Number(svc.duration_minutes) : null;
              const staffName = svc.staff_name ? String(svc.staff_name) : null;
              const guestName = svc.guest_name ? String(svc.guest_name) : null;
              const price = Number(svc.price ?? 0);
              return (
                <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.gray[100] }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, color: Colors.gray[800] }}>{svcName}{guestName ? ` (${guestName})` : ""}</Text>
                    {duration != null && (
                      <Text style={{ fontSize: 12, color: Colors.gray[500] }}>{duration} min</Text>
                    )}
                    {staffName && (
                      <Text style={{ fontSize: 12, color: Colors.gray[400] }}>with {staffName}</Text>
                    )}
                  </View>
                  <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[900] }}>
                    {booking.currency} {price.toFixed(2)}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Location & Map */}
        {location && (
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900], marginBottom: 8 }}>Location</Text>
            <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
              <Ionicons name="location-outline" size={16} color={Colors.gray[600]} style={{ marginTop: 2 }} />
              <Text style={{ marginLeft: 8, fontSize: 14, color: Colors.gray[600], flex: 1 }}>
                {(location as { address?: string }).address ||
                  [location.name, (location as { address_line1?: string }).address_line1, (location as { city?: string }).city].filter(Boolean).join(", ") ||
                  "—"}
              </Text>
            </View>
            {(location as { latitude?: number; longitude?: number }).latitude != null && (location as { longitude?: number }).longitude != null && (
              <View style={{ marginTop: 8, overflow: "hidden", borderRadius: 12 }}>
                <StaticMapImage
                  latitude={Number((location as { latitude?: number }).latitude)}
                  longitude={Number((location as { longitude?: number }).longitude)}
                  width={400}
                  height={150}
                  zoom={15}
                  style={{ borderRadius: 12 }}
                />
              </View>
            )}
          </View>
        )}

        <SafetyPanicButton bookingId={id ?? null} />

        {canCancel && (
          <View style={{ flexDirection: "row", marginBottom: 12 }}>
            <TouchableOpacity
              onPress={handleReschedule}
              style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], marginRight: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Reschedule booking"
            >
              <Ionicons name="calendar-outline" size={16} color={Colors.gray[700]} />
              <Text style={{ marginLeft: 8, fontWeight: "500", color: Colors.gray[700] }}>Reschedule</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleCancel}
              disabled={cancelling}
              style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: "#FECACA" }}
              accessibilityRole="button"
              accessibilityLabel="Cancel booking"
            >
              {cancelling ? (
                <ActivityIndicator size="small" color="#ef4444" />
              ) : (
                <>
                  <Ionicons name="close-circle-outline" size={16} color="#ef4444" style={{ marginRight: 8 }} />
                  <Text style={{ fontWeight: "500", color: "#B91C1C" }}>Cancel</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {booking.status === "completed" && (
          <TouchableOpacity
            onPress={() => {
              haptic.light();
              router.push({ pathname: "/(app)/review-write", params: { bookingId: booking.id } });
            }}
            style={{ paddingVertical: 16, borderWidth: 1, borderColor: Colors.primary, borderRadius: 12, alignItems: "center", marginBottom: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Write a review"
          >
            <Text style={{ color: Colors.primary, fontWeight: "600" }}>Write a Review</Text>
          </TouchableOpacity>
        )}

        {booking.status === "completed" && provider?.slug && (
          <TouchableOpacity
            onPress={() => {
              haptic.light();
              router.push({ pathname: "/(app)/book", params: { slug: provider.slug } });
            }}
            style={{ paddingVertical: 16, backgroundColor: Colors.gray[50], borderRadius: 12, alignItems: "center", marginBottom: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Book again with this provider"
          >
            <Text style={{ fontWeight: "500", color: Colors.gray[700] }}>Book Again</Text>
          </TouchableOpacity>
        )}

        {/* Share / Download actions */}
        <View style={{ flexDirection: "row", marginBottom: 12 }}>
          <TouchableOpacity
            onPress={() => {
              haptic.light();
              const lines = [
                `Beautonomi Booking Confirmation`,
                `Booking #${booking.booking_number || booking.id.slice(0, 8)}`,
                ``,
                `Provider: ${provider?.business_name || "N/A"}`,
                `Date: ${formatDate(booking.selected_datetime)}`,
                `Time: ${formatTime(booking.selected_datetime)}`,
                `Status: ${booking.status}`,
                ``,
                ...services.map(
                  (svc: any) =>
                    `• ${svc.service_name || svc.title || svc.name || "Service"} – ${booking.currency} ${Number(svc.price || 0).toFixed(2)}`
                ),
                ``,
                `Total: ${booking.currency} ${Number(booking.total_amount || 0).toFixed(2)}`,
                ``,
                `View online: ${APP_URL}/account-settings/bookings/${booking.id}`,
              ];
              Share.share({
                message: lines.join("\n"),
                title: "Booking Confirmation",
              });
            }}
            style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], marginRight: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Share booking details"
          >
            <Ionicons name="share-outline" size={16} color={Colors.gray[700]} style={{ marginRight: 8 }} />
            <Text style={{ fontWeight: "500", color: Colors.gray[700] }}>Share</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              haptic.light();
              Linking.openURL(`${APP_URL}/account-settings/bookings/${booking.id}?print=1`);
            }}
            style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200] }}
            accessibilityRole="button"
            accessibilityLabel="Download booking receipt"
          >
            <Ionicons name="download-outline" size={16} color={Colors.gray[700]} style={{ marginRight: 8 }} />
            <Text style={{ fontWeight: "500", color: Colors.gray[700] }}>Download</Text>
          </TouchableOpacity>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 12 }}>
          <TouchableOpacity
            onPress={openInBrowser}
            style={{ marginRight: 24 }}
            accessibilityRole="link"
            accessibilityLabel="Open full details in browser"
          >
            <Text style={{ fontSize: 14, color: Colors.gray[500], textDecorationLine: "underline" }}>Open in browser</Text>
          </TouchableOpacity>
          {helpUrl ? (
            <TouchableOpacity
              onPress={() => Linking.openURL(helpUrl)}
              accessibilityRole="link"
              accessibilityLabel="Help"
            >
              <Text style={{ fontSize: 14, color: Colors.primary, fontWeight: "500" }}>Help</Text>
            </TouchableOpacity>
          ) : null}
        </View>
          </>
        )}
      </ScrollView>
    </>
  );
}
