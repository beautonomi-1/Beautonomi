import { useEffect, useState, useCallback, useRef } from "react";
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
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, Stack, router } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { APP_URL } from "@/config/public-env";
import { api } from "@/lib/api-client";
import { Colors } from "@/constants/colors";
import { usePaystackPayment } from "@/hooks/usePaystackPayment";
import { useScreenTracking } from "@/hooks/useScreenTracking";
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
  const { user } = useAuth();
  const { pay, loading: payLoading, error: payError } = usePaystackPayment();
  const [booking, setBooking] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

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
        <View className="flex-1 bg-white items-center justify-center">
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </>
    );
  }

  if (error && !booking) {
    return (
      <>
        <Stack.Screen options={{ title: "Booking", headerBackTitle: "Back" }} />
        <View className="flex-1 bg-white p-6 items-center justify-center">
          <Text className="text-gray-600 mb-4">{error}</Text>
          <TouchableOpacity onPress={load} className="bg-primary px-6 py-3 rounded-xl">
            <Text className="text-white font-semibold">Retry</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }

  if (!booking) return null;

  const provider = booking.provider;
  const location = booking.location;
  const services = booking.services ?? booking.booking_services ?? [];
  const isActive = ["pending", "confirmed", "started"].includes(booking.status);
  const canCancel = isActive && booking.status !== "started";

  return (
    <>
      <Stack.Screen options={{ title: "Booking Details", headerBackTitle: "Back" }} />
      <ScrollView className="flex-1 bg-white" contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
        {/* Provider & Status */}
        <View className="mb-4 rounded-2xl bg-gray-50 p-4">
          {booking.is_group_booking && booking.group_booking_ref && (
            <View className="mb-2 pb-2 border-b border-gray-200">
              <Text className="text-xs text-gray-500">Group booking</Text>
              <Text className="text-sm font-medium text-gray-700">{booking.group_booking_ref}</Text>
            </View>
          )}
          <View className="flex-row justify-between items-start">
            <View className="flex-1">
              <Text className="text-lg font-semibold text-gray-900">
                {provider?.business_name || "Provider"}
              </Text>
              <Text className="text-gray-600 mt-1">{formatDate(booking.selected_datetime)}</Text>
              <Text className="text-gray-500 text-sm">{formatTime(booking.selected_datetime)}</Text>
            </View>
            <View
              className={`px-3 py-1 rounded-full ${
                booking.status === "confirmed"
                  ? "bg-green-100"
                  : booking.status === "cancelled"
                    ? "bg-red-100"
                    : booking.status === "completed"
                      ? "bg-blue-100"
                      : "bg-amber-100"
              }`}
            >
              <Text
                className={`text-xs font-semibold capitalize ${
                  booking.status === "confirmed"
                    ? "text-green-700"
                    : booking.status === "cancelled"
                      ? "text-red-700"
                      : booking.status === "completed"
                        ? "text-blue-700"
                        : "text-amber-700"
                }`}
              >
                {booking.status}
              </Text>
            </View>
          </View>
        </View>

        {/* Services */}
        {services.length > 0 && (
          <View className="mb-4">
            <Text className="text-sm font-semibold text-gray-900 mb-2">Services</Text>
            {services.map((svc: Record<string, unknown>, i: number) => {
              const svcName = String(svc.offering_name ?? svc.service_name ?? svc.title ?? svc.name ?? `Service ${i + 1}`);
              const duration = svc.duration_minutes ? Number(svc.duration_minutes) : null;
              const staffName = svc.staff_name ? String(svc.staff_name) : null;
              const guestName = svc.guest_name ? String(svc.guest_name) : null;
              const price = Number(svc.price ?? 0);
              return (
                <View key={i} className="flex-row justify-between items-center py-2 border-b border-gray-100">
                  <View className="flex-1">
                    <Text className="text-sm text-gray-800">{svcName}{guestName ? ` (${guestName})` : ""}</Text>
                    {duration != null && (
                      <Text className="text-xs text-gray-500">{duration} min</Text>
                    )}
                    {staffName && (
                      <Text className="text-xs text-gray-400">with {staffName}</Text>
                    )}
                  </View>
                  <Text className="text-sm font-medium text-gray-900">
                    {booking.currency} {price.toFixed(2)}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Location & Map */}
        {location && (
          <View className="mb-4">
            <Text className="text-sm font-semibold text-gray-900 mb-2">Location</Text>
            <View className="flex-row items-start">
              <Ionicons name="location-outline" size={16} color="#6b7280" style={{ marginTop: 2 }} />
              <Text className="ml-2 text-sm text-gray-600 flex-1">
                {[location.name, location.address_line1, location.city].filter(Boolean).join(", ")}
              </Text>
            </View>
            {location.latitude && location.longitude && (
              <View className="mt-2 overflow-hidden rounded-xl">
                <StaticMapImage
                  latitude={Number(location.latitude)}
                  longitude={Number(location.longitude)}
                  width={400}
                  height={150}
                  zoom={15}
                  style={{ borderRadius: 12 }}
                />
              </View>
            )}
          </View>
        )}

        {/* Payment Summary */}
        <View className="mb-4 rounded-2xl bg-gray-50 p-4">
          <Text className="text-sm font-semibold text-gray-900 mb-2">Payment</Text>
          {booking.subtotal != null && (
            <View className="flex-row justify-between mb-1">
              <Text className="text-sm text-gray-500">Subtotal</Text>
              <Text className="text-sm text-gray-700">{booking.currency} {Number(booking.subtotal).toFixed(2)}</Text>
            </View>
          )}
          {booking.tax_amount > 0 && (
            <View className="flex-row justify-between mb-1">
              <Text className="text-sm text-gray-500">Tax</Text>
              <Text className="text-sm text-gray-700">{booking.currency} {Number(booking.tax_amount).toFixed(2)}</Text>
            </View>
          )}
          {booking.discount_amount > 0 && (
            <View className="flex-row justify-between mb-1">
              <Text className="text-sm text-gray-500">Discount</Text>
              <Text className="text-sm text-green-600">-{booking.currency} {Number(booking.discount_amount).toFixed(2)}</Text>
            </View>
          )}
          <View className="flex-row justify-between border-t border-gray-200 pt-2 mt-1">
            <Text className="text-base font-bold text-gray-900">Total</Text>
            <Text className="text-base font-bold text-gray-900">
              {booking.currency} {Number(booking.total_amount || 0).toFixed(2)}
            </Text>
          </View>
          {booking.payment_status && (
            <View className="mt-2 flex-row items-center">
              <View
                className={`h-2 w-2 rounded-full mr-2 ${
                  booking.payment_status === "paid" ? "bg-green-500" : "bg-amber-500"
                }`}
              />
              <Text className="text-xs text-gray-500 capitalize">{booking.payment_status}</Text>
            </View>
          )}
        </View>

        {payError && (
          <View className="bg-red-50 rounded-xl p-3 mb-4">
            <Text className="text-red-700">{payError}</Text>
          </View>
        )}

        <SafetyPanicButton bookingId={id ?? null} />

        {/* Action buttons */}
        {needsPayment && (
          <Pressable
            onPress={handlePay}
            disabled={payLoading}
            className="bg-primary py-4 rounded-xl items-center mb-3"
            accessibilityRole="button"
            accessibilityLabel="Pay now"
          >
            {payLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text className="text-white font-semibold text-base">Pay Now</Text>
            )}
          </Pressable>
        )}

        {canCancel && (
          <View className="flex-row gap-3 mb-3">
            <TouchableOpacity
              onPress={handleReschedule}
              className="flex-1 flex-row items-center justify-center py-3.5 rounded-xl border border-gray-200"
              accessibilityRole="button"
              accessibilityLabel="Reschedule booking"
            >
              <Ionicons name="calendar-outline" size={16} color="#374151" />
              <Text className="ml-2 font-medium text-gray-700">Reschedule</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleCancel}
              disabled={cancelling}
              className="flex-1 flex-row items-center justify-center py-3.5 rounded-xl border border-red-200"
              accessibilityRole="button"
              accessibilityLabel="Cancel booking"
            >
              {cancelling ? (
                <ActivityIndicator size="small" color="#ef4444" />
              ) : (
                <>
                  <Ionicons name="close-circle-outline" size={16} color="#ef4444" />
                  <Text className="ml-2 font-medium text-red-600">Cancel</Text>
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
            className="py-4 border border-primary rounded-xl items-center mb-3"
            accessibilityRole="button"
            accessibilityLabel="Write a review"
          >
            <Text className="text-primary font-semibold">Write a Review</Text>
          </TouchableOpacity>
        )}

        {/* Rebook for completed bookings */}
        {booking.status === "completed" && provider?.slug && (
          <TouchableOpacity
            onPress={() => {
              haptic.light();
              router.push({ pathname: "/(app)/book", params: { slug: provider.slug } });
            }}
            className="py-4 bg-gray-50 rounded-xl items-center mb-3"
            accessibilityRole="button"
            accessibilityLabel="Book again with this provider"
          >
            <Text className="font-medium text-gray-700">Book Again</Text>
          </TouchableOpacity>
        )}

        {/* Share / Download actions */}
        <View className="flex-row gap-3 mb-3">
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
            className="flex-1 flex-row items-center justify-center py-3.5 rounded-xl border border-gray-200"
            accessibilityRole="button"
            accessibilityLabel="Share booking details"
          >
            <Ionicons name="share-outline" size={16} color="#374151" />
            <Text className="ml-2 font-medium text-gray-700">Share</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              haptic.light();
              Linking.openURL(`${APP_URL}/account-settings/bookings/${booking.id}?print=1`);
            }}
            className="flex-1 flex-row items-center justify-center py-3.5 rounded-xl border border-gray-200"
            accessibilityRole="button"
            accessibilityLabel="Download booking receipt"
          >
            <Ionicons name="download-outline" size={16} color="#374151" />
            <Text className="ml-2 font-medium text-gray-700">Download</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={openInBrowser}
          className="py-3 items-center"
          accessibilityRole="link"
          accessibilityLabel="Open full details in browser"
        >
          <Text className="text-sm text-gray-500 underline">Open in browser</Text>
        </TouchableOpacity>
      </ScrollView>
    </>
  );
}
