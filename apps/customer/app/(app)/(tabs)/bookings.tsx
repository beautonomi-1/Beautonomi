import { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { useBookings } from "@/features/bookings/useBookings";
import { haptic } from "@/lib/haptics";
import { AnimatedPressable } from "@/components/AnimatedPressable";
import type { Booking } from "@/types/api";
import { SCREEN_PADDING, TAB_CONTENT_PADDING_BOTTOM } from "@/constants/layout";
import { Colors, Shadows } from "@/constants/colors";
import { BookingCardSkeleton } from "@/components/Skeleton";

type TabType = "upcoming" | "past" | "cancelled";

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

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  confirmed: { bg: "bg-green-100", text: "text-green-700" },
  pending: { bg: "bg-yellow-100", text: "text-yellow-700" },
  cancelled: { bg: "bg-red-100", text: "text-red-700" },
};

function BookingCard({ booking, onPress }: { booking: Booking; onPress: () => void }) {
  const name =
    (booking as unknown as Record<string, unknown>).provider_name as string | undefined ||
    booking.services?.[0]?.offering_name ||
    "Beauty Service";
  const style = STATUS_STYLES[booking.status] ?? { bg: "bg-gray-100", text: "text-gray-700" };
  const statusLabel = booking.status.charAt(0).toUpperCase() + booking.status.slice(1);

  return (
    <AnimatedPressable
      scaleValue={0.98}
      onPress={onPress}
      className="bg-white border border-gray-200 rounded-2xl p-5 mb-4"
      style={Shadows.cardSmall}
      accessibilityRole="button"
      accessibilityLabel={`Booking with ${name}, ${statusLabel}, ${formatDate(booking.scheduled_at)}`}
      accessibilityHint="View booking details"
    >
      <View className="flex-row justify-between items-start mb-3">
        <Text className="font-semibold text-lg text-gray-900 flex-1 mr-2" numberOfLines={1}>
          {name}
        </Text>
        <View className={`px-3 py-1 rounded-full ${style.bg}`}>
          <Text className={`text-xs font-semibold ${style.text}`}>{statusLabel}</Text>
        </View>
      </View>

      <Text className="text-gray-700 font-medium">{formatDate(booking.scheduled_at)}</Text>
      <Text className="text-gray-600 text-sm mt-1">{formatTime(booking.scheduled_at)}</Text>
      {booking.location_type === "at_salon" && (
        <Text className="text-gray-500 text-sm mt-1">At Salon</Text>
      )}
      {booking.location_type === "at_home" && (
        <Text className="text-gray-500 text-sm mt-1">At your location</Text>
      )}

      <View className="mt-4 pt-4 border-t border-gray-100">
        <Text className="text-xl font-semibold text-gray-900">
          {booking.currency} {booking.total_amount?.toFixed(2)}
        </Text>
        <Text className="text-xs text-gray-500 mt-0.5">#{booking.booking_number}</Text>
        {booking.is_group_booking && booking.group_booking_ref && (
          <Text className="text-xs text-gray-500 mt-0.5">Group: {booking.group_booking_ref}</Text>
        )}
      </View>

      <TouchableOpacity
        onPress={onPress}
        className="mt-4 py-2.5 border border-gray-300 rounded-xl items-center"
        accessibilityRole="button"
        accessibilityLabel={`View details for booking with ${name}`}
      >
        <Text className="font-medium text-gray-900">View Details</Text>
      </TouchableOpacity>
    </AnimatedPressable>
  );
}

export default function BookingsScreen() {
  useScreenTracking("Bookings");
  const { user } = useAuth();
  const [tab, setTab] = useState<TabType>("upcoming");
  const { data: bookings, loading, refreshing, error, refetch } = useBookings(tab);

  const tabs: { key: TabType; label: string }[] = [
    { key: "upcoming", label: "Upcoming" },
    { key: "past", label: "Past" },
    { key: "cancelled", label: "Cancelled" },
  ];

  const onBookingPress = useCallback(
    (b: Booking) => {
      router.push({ pathname: "/(app)/booking-detail", params: { id: b.id } });
    },
    []
  );

  const renderItem = useCallback(
    ({ item }: { item: Booking }) => (
      <BookingCard booking={item} onPress={() => onBookingPress(item)} />
    ),
    [onBookingPress]
  );

  const keyExtractor = useCallback((item: Booking) => item.id, []);

  if (!user) {
    return (
      <View className="flex-1 bg-white items-center justify-center p-8">
        <Text className="text-xl font-semibold text-gray-900 mb-2 text-center">
          Your appointments
        </Text>
        <Text className="text-gray-600 text-center mb-6">
          Log in to view and manage your bookings
        </Text>
        <TouchableOpacity
          onPress={() => router.replace("/(auth)/login")}
          className="bg-primary px-8 py-4 rounded-xl"
          accessibilityRole="button"
          accessibilityLabel="Log in"
          accessibilityHint="Navigate to the login screen"
        >
          <Text className="text-white font-semibold">Log in</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      <View className="bg-white px-4 pt-4 pb-2">
        <Text className="text-2xl font-bold text-gray-900 mb-4">Bookings</Text>
        <View className="flex-row gap-2">
          {tabs.map((t) => (
            <TouchableOpacity
              key={t.key}
              onPress={() => { haptic.selection(); setTab(t.key); }}
              className={`px-4 py-2 rounded-full ${tab === t.key ? "bg-primary" : "bg-gray-100"}`}
              accessibilityRole="button"
              accessibilityLabel={`${t.label} bookings`}
              accessibilityState={{ selected: tab === t.key }}
              accessibilityHint={`Show ${t.label.toLowerCase()} bookings`}
            >
              <Text className={`font-medium ${tab === t.key ? "text-white" : "text-gray-700"}`}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading && !bookings.length ? (
        <View className="flex-1 p-4">
          <BookingCardSkeleton />
          <BookingCardSkeleton />
          <BookingCardSkeleton />
        </View>
      ) : (
        <FlatList
          data={bookings}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={{ padding: SCREEN_PADDING, paddingBottom: TAB_CONTENT_PADDING_BOTTOM }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refetch} tintColor={Colors.primary} />
          }
          accessibilityRole="list"
          accessibilityLabel={`${tab} bookings list`}
          ListHeaderComponent={
            error ? (
              <View className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
                <Text className="text-red-700 mb-3">{error}</Text>
                <TouchableOpacity
                  onPress={() => refetch()}
                  className="bg-primary py-2.5 rounded-xl items-center"
                  accessibilityRole="button"
                  accessibilityLabel="Retry loading bookings"
                  accessibilityHint="Attempts to reload your bookings"
                >
                  <Text className="text-white font-semibold">Retry</Text>
                </TouchableOpacity>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View className="py-12 items-center">
              <Text className="text-xl font-semibold text-gray-900 mb-2">
                No appointments scheduled...yet!
              </Text>
              <Text className="text-gray-600 text-center mb-6">
                Unveil your radiance. It&apos;s time to pamper yourself with our expert care.
              </Text>
              <TouchableOpacity
                onPress={() => router.push("/(app)/(tabs)/home")}
                className="bg-primary px-8 py-4 rounded-xl"
                accessibilityRole="button"
                accessibilityLabel="Start searching for providers"
                accessibilityHint="Navigate to the home screen to find providers"
              >
                <Text className="text-white font-semibold">Start Searching</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}
    </View>
  );
}
