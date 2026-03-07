import { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { useResponsive } from "@/hooks/useResponsive";
import { useBookings } from "@/features/bookings/useBookings";
import { haptic } from "@/lib/haptics";
import { AnimatedPressable } from "@/components/AnimatedPressable";
import type { Booking } from "@/types/api";
import { TAB_CONTENT_PADDING_BOTTOM } from "@/constants/layout";
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
  confirmed: { bg: "#DCFCE7", text: "#15803D" },
  pending: { bg: "#FEF9C3", text: "#A16207" },
  cancelled: { bg: "#FEE2E2", text: "#B91C1C" },
};

function BookingCard({ booking, onPress }: { booking: Booking; onPress: () => void }) {
  const name =
    (booking as unknown as Record<string, unknown>).provider_name as string | undefined ||
    booking.services?.[0]?.offering_name ||
    "Beauty Service";
  const statusStyle = STATUS_STYLES[booking.status] ?? { bg: Colors.gray[100], text: Colors.gray[700] };
  const statusLabel = booking.status.charAt(0).toUpperCase() + booking.status.slice(1);

  return (
    <AnimatedPressable
      scaleValue={0.98}
      onPress={onPress}
      style={[
        { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.gray[200], borderRadius: 16, padding: 20, marginBottom: 16 },
        Shadows.cardSmall,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Booking with ${name}, ${statusLabel}, ${formatDate(booking.scheduled_at)}`}
      accessibilityHint="View booking details"
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <Text style={{ fontWeight: "600", fontSize: 18, color: Colors.gray[900], flex: 1, marginRight: 8 }} numberOfLines={1}>
          {name}
        </Text>
        <View style={{ paddingHorizontal: 12, paddingVertical: 4, borderRadius: 9999, backgroundColor: statusStyle.bg }}>
          <Text style={{ fontSize: 12, fontWeight: "600", color: statusStyle.text }}>{statusLabel}</Text>
        </View>
      </View>

      <Text style={{ color: Colors.gray[700], fontWeight: "500" }}>{formatDate(booking.scheduled_at)}</Text>
      <Text style={{ color: Colors.gray[600], fontSize: 14, marginTop: 4 }}>{formatTime(booking.scheduled_at)}</Text>
      {booking.location_type === "at_salon" && (
        <Text style={{ color: Colors.gray[500], fontSize: 14, marginTop: 4 }}>At Salon</Text>
      )}
      {booking.location_type === "at_home" && (
        <Text style={{ color: Colors.gray[500], fontSize: 14, marginTop: 4 }}>At your location</Text>
      )}

      <View style={{ marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: Colors.gray[100] }}>
        <Text style={{ fontSize: 20, fontWeight: "600", color: Colors.gray[900] }}>
          {booking.currency} {booking.total_amount?.toFixed(2)}
        </Text>
        <Text style={{ fontSize: 12, color: Colors.gray[500], marginTop: 2 }}>#{booking.booking_number}</Text>
        {booking.is_group_booking && booking.group_booking_ref && (
          <Text style={{ fontSize: 12, color: Colors.gray[500], marginTop: 2 }}>Group: {booking.group_booking_ref}</Text>
        )}
      </View>

      <TouchableOpacity
        onPress={onPress}
        style={{ marginTop: 16, paddingVertical: 10, borderWidth: 1, borderColor: Colors.gray[300], borderRadius: 12, alignItems: "center" }}
        accessibilityRole="button"
        accessibilityLabel={`View details for booking with ${name}`}
      >
        <Text style={{ fontWeight: "500", color: Colors.gray[900] }}>View Details</Text>
      </TouchableOpacity>
    </AnimatedPressable>
  );
}

export default function BookingsScreen() {
  useScreenTracking("Bookings");
  const { user } = useAuth();
  const { contentPadding, contentMaxWidth, isTablet } = useResponsive();
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
      <View style={{ flex: 1, backgroundColor: Colors.white }}>
        <SafeAreaView edges={["top"]} style={{ backgroundColor: Colors.white }} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
          <Text style={{ fontSize: 20, fontWeight: "600", color: Colors.gray[900], marginBottom: 8, textAlign: "center" }}>
            Your appointments
          </Text>
          <Text style={{ color: Colors.gray[600], textAlign: "center", marginBottom: 24 }}>
            Log in to view and manage your bookings
          </Text>
          <TouchableOpacity
            onPress={() => router.replace("/(auth)/login")}
            style={{ backgroundColor: Colors.primary, paddingHorizontal: 32, paddingVertical: 16, borderRadius: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Log in"
            accessibilityHint="Navigate to the login screen"
          >
            <Text style={{ color: Colors.white, fontWeight: "600" }}>Log in</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const contentContainerStyle = isTablet
    ? { maxWidth: contentMaxWidth, alignSelf: "center" as const, width: "100%" as const }
    : {};
  const contentWrapperStyle = { ...contentContainerStyle, flex: 1 };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.gray[50] }}>
      <SafeAreaView edges={["top"]} style={{ backgroundColor: Colors.gray[50] }} />
      <View style={[contentContainerStyle, { backgroundColor: Colors.white, paddingTop: contentPadding, paddingBottom: 8 }]}>
        <View style={{ paddingHorizontal: contentPadding }}>
          <Text style={{ fontSize: 24, fontWeight: "700", color: Colors.gray[900], marginBottom: 16 }}>Bookings</Text>
          <View style={{ flexDirection: "row" }}>
            {tabs.map((t) => (
              <TouchableOpacity
                key={t.key}
                onPress={() => { haptic.selection(); setTab(t.key); }}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  borderRadius: 9999,
                  backgroundColor: tab === t.key ? Colors.primary : Colors.gray[100],
                  marginRight: 8,
                }}
                accessibilityRole="button"
                accessibilityLabel={`${t.label} bookings`}
                accessibilityState={{ selected: tab === t.key }}
                accessibilityHint={`Show ${t.label.toLowerCase()} bookings`}
              >
                <Text style={{ fontWeight: "500", color: tab === t.key ? Colors.white : Colors.gray[700] }}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      {loading && !bookings.length ? (
        <View style={[contentWrapperStyle, { padding: contentPadding }]}>
          <BookingCardSkeleton />
          <BookingCardSkeleton />
          <BookingCardSkeleton />
        </View>
      ) : (
        <FlatList
          data={bookings}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          style={contentWrapperStyle}
          contentContainerStyle={{
            paddingHorizontal: contentPadding,
            paddingTop: contentPadding,
            paddingBottom: TAB_CONTENT_PADDING_BOTTOM,
          }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refetch} tintColor={Colors.primary} />
          }
          accessibilityRole="list"
          accessibilityLabel={`${tab} bookings list`}
          ListHeaderComponent={
            error ? (
              <View style={{ backgroundColor: "#FEF2F2", borderWidth: 1, borderColor: "#FECACA", borderRadius: 12, padding: 16, marginBottom: 16 }}>
                <Text style={{ color: "#B91C1C", marginBottom: 12 }}>{error}</Text>
                <TouchableOpacity
                  onPress={() => refetch()}
                  style={{ backgroundColor: Colors.primary, paddingVertical: 10, borderRadius: 12, alignItems: "center" }}
                  accessibilityRole="button"
                  accessibilityLabel="Retry loading bookings"
                  accessibilityHint="Attempts to reload your bookings"
                >
                  <Text style={{ color: Colors.white, fontWeight: "600" }}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={{ paddingVertical: 48, alignItems: "center" }}>
              <Text style={{ fontSize: 20, fontWeight: "600", color: Colors.gray[900], marginBottom: 8 }}>
                No appointments scheduled...yet!
              </Text>
              <Text style={{ color: Colors.gray[600], textAlign: "center", marginBottom: 24 }}>
                Unveil your radiance. It&apos;s time to pamper yourself with our expert care.
              </Text>
              <TouchableOpacity
                onPress={() => router.push("/(app)/(tabs)/home")}
                style={{ backgroundColor: Colors.primary, paddingHorizontal: 32, paddingVertical: 16, borderRadius: 12 }}
                accessibilityRole="button"
                accessibilityLabel="Start searching for providers"
                accessibilityHint="Navigate to the home screen to find providers"
              >
                <Text style={{ color: Colors.white, fontWeight: "600" }}>Start Searching</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}
    </View>
  );
}
