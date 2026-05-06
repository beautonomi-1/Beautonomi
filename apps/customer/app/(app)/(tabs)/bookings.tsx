import { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  RefreshControl,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/providers/AuthProvider";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { useResponsive } from "@/hooks/useResponsive";
import { useBookings, type MeBookingsSortBy, type MeBookingsSortDir } from "@/features/bookings/useBookings";
import { haptic } from "@/lib/haptics";
import { AnimatedPressable } from "@/components/AnimatedPressable";
import type { Booking } from "@/types/api";
import { useTabContentPaddingBottom } from "@/hooks/useTabContentPaddingBottom";
import { Colors, Shadows } from "@/constants/colors";
import { BookingCardSkeleton } from "@/components/Skeleton";
import { supabase } from "@/lib/supabase/client";
import { getTenantLocaleTag } from "@/lib/locale";

type BookingsTabType = "upcoming" | "past" | "cancelled";

function parseValidDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

/**
 * §UX-audit 2026-04: previously locked to "en-US" which produced
 * American weekday / AM-PM formatting for every tenant regardless of
 * market (ZA defaults to 24h, en-GB/en-ZA formats differ, etc.). Use
 * the tenant-aware locale helper so the list matches receipts/payment
 * screens and never spells Saturday as "Saturday" in a French tenant.
 */
function formatDate(s: string) {
  const parsed = parseValidDate(s);
  if (!parsed) return "—";
  return parsed.toLocaleDateString(getTenantLocaleTag(), {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatTime(s: string) {
  const parsed = parseValidDate(s);
  if (!parsed) return "—";
  return parsed.toLocaleTimeString(getTenantLocaleTag(), {
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label?: string }> = {
  confirmed: { bg: "#DCFCE7", text: "#15803D" },
  pending: { bg: "#FEF9C3", text: "#A16207" },
  pending_payment: { bg: "#FEF3C7", text: "#92400E", label: "Pending Payment" },
  cancelled: { bg: "#FEE2E2", text: "#B91C1C" },
  completed: { bg: "#DBEAFE", text: "#1E40AF" },
  started: { bg: "#E0E7FF", text: "#3730A3" },
  in_progress: { bg: "#E0E7FF", text: "#3730A3", label: "In Progress" },
  no_show: { bg: "#F3F4F6", text: "#6B7280", label: "No Show" },
};

/** Empty list per tab — matches web account-settings bookings behavior; search = provider discovery (parity with web `/search`). */
function EmptyBookingsTab({ tab }: { tab: BookingsTabType }) {
  const goSearch = () => router.push("/(app)/(tabs)/search");
  const primary =
    tab === "upcoming"
      ? {
          title: "No appointments scheduled...yet!",
          body: "Unveil your radiance. It's time to pamper yourself with our expert care.",
          cta: "Start Searching",
        }
      : tab === "past"
        ? {
            title: "No past appointments yet",
            body: "Completed visits will appear here once you've attended them.",
            cta: "Find providers",
          }
        : {
            title: "No cancelled bookings",
            body: "When you cancel an appointment, it will show in this list.",
            cta: "Find providers",
          };

  return (
    <View style={{ paddingVertical: 48, alignItems: "center", paddingHorizontal: 16 }}>
      <Text style={{ fontSize: 20, fontWeight: "600", color: Colors.gray[900], marginBottom: 8, textAlign: "center" }}>
        {primary.title}
      </Text>
      <Text style={{ color: Colors.gray[600], textAlign: "center", marginBottom: 24 }}>
        {primary.body}
      </Text>
      <TouchableOpacity
        onPress={goSearch}
        style={{ backgroundColor: Colors.primary, paddingHorizontal: 32, paddingVertical: 16, borderRadius: 12 }}
        accessibilityRole="button"
        accessibilityLabel={tab === "upcoming" ? "Start searching for providers" : "Find providers to book"}
        accessibilityHint="Opens search to find providers and book"
      >
        <Text style={{ color: Colors.white, fontWeight: "600" }}>{primary.cta}</Text>
      </TouchableOpacity>
    </View>
  );
}

function BookingCard({ booking, onPress }: { booking: Booking; onPress: () => void }) {
  const name =
    (booking as unknown as Record<string, unknown>).provider_name as string | undefined ||
    booking.services?.[0]?.offering_name ||
    "Beauty Service";
  const statusEntry = STATUS_STYLES[booking.status] ?? { bg: Colors.gray[100], text: Colors.gray[700] };
  const statusStyle = statusEntry;
  const statusLabel = statusEntry.label || booking.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

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
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {booking.is_group_booking && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#fdf2f8", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 }}>
              <Ionicons name="people-outline" size={12} color="#db2777" />
              <Text style={{ fontSize: 11, fontWeight: "600", color: "#db2777" }}>
                {booking.group_booking_ref ? `Group · ${booking.group_booking_ref}` : "Group booking"}
              </Text>
            </View>
          )}
          {!booking.is_group_booking && booking.booking_source === "walk_in" && (
            <View style={{ backgroundColor: "#f0fdf4", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 }}>
              <Text style={{ fontSize: 11, fontWeight: "600", color: "#166534" }}>Walk-in</Text>
            </View>
          )}
          {!booking.is_group_booking && booking.booking_source === "online" && booking.special_requests?.startsWith("Custom order:") && (
            <View style={{ backgroundColor: "#eff6ff", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 }}>
              <Text style={{ fontSize: 11, fontWeight: "600", color: "#1d4ed8" }}>Custom offer</Text>
            </View>
          )}
        </View>
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

type SortPreset = "appt_desc" | "appt_asc" | "booked_desc" | "booked_asc";

function presetToApi(p: SortPreset): { sortBy: MeBookingsSortBy; sortDir: MeBookingsSortDir } {
  switch (p) {
    case "appt_asc":
      return { sortBy: "scheduled_at", sortDir: "asc" };
    case "appt_desc":
      return { sortBy: "scheduled_at", sortDir: "desc" };
    case "booked_desc":
      return { sortBy: "created_at", sortDir: "desc" };
    case "booked_asc":
      return { sortBy: "created_at", sortDir: "asc" };
  }
}

export default function BookingsScreen() {
  useScreenTracking("Bookings");
  const tabScrollPaddingBottom = useTabContentPaddingBottom();
  const { user } = useAuth();
  const { contentPadding, contentMaxWidth, isTablet } = useResponsive();
  const [tab, setTab] = useState<BookingsTabType>("upcoming");
  const [sortPreset, setSortPreset] = useState<SortPreset>("appt_desc");
  const { sortBy, sortDir } = presetToApi(sortPreset);
  const { data: bookings, loading, refreshing, error, refetch } = useBookings(tab, {
    sortBy,
    sortDir,
  });

  // Real-time: refresh list when any of the customer's bookings change (status updates, confirmations, etc.)
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;
  useEffect(() => {
    if (!user?.id) return;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        refetchRef.current();
      }, 600);
    };
    const channel = supabase
      .channel(`bookings-list:customer:${user.id}`)
      .on(
        "postgres_changes" as never,
        {
          event: "*",
          schema: "public",
          table: "bookings",
          filter: `customer_id=eq.${user.id}`,
        },
        scheduleRefresh,
      )
      .subscribe();
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const tabs: { key: BookingsTabType; label: string }[] = [
    { key: "upcoming", label: "Upcoming" },
    { key: "past", label: "Past" },
    { key: "cancelled", label: "Cancelled" },
  ];

  const sortChips: { key: SortPreset; label: string }[] = [
    { key: "appt_desc", label: "Appt · newest" },
    { key: "appt_asc", label: "Appt · soonest" },
    { key: "booked_desc", label: "Booked · newest" },
    { key: "booked_asc", label: "Booked · oldest" },
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
          <Text style={{ fontSize: 24, fontWeight: "700", color: Colors.gray[900], marginBottom: 12 }}>Bookings</Text>
          <TouchableOpacity
            onPress={() => {
              haptic.selection();
              router.push("/(app)/account-settings/custom-requests" as never);
            }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 16,
              paddingVertical: 12,
              paddingHorizontal: 14,
              backgroundColor: Colors.gray[50],
              borderRadius: 12,
              borderWidth: 1,
              borderColor: Colors.gray[200],
            }}
            accessibilityRole="button"
            accessibilityLabel="Custom requests and offers"
            accessibilityHint="Open quotes and custom service requests from providers"
          >
            <Ionicons name="briefcase-outline" size={22} color={Colors.primary} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={{ fontSize: 15, fontWeight: "600", color: Colors.gray[900] }}>Custom requests & offers</Text>
              <Text style={{ fontSize: 12, color: Colors.gray[500], marginTop: 2 }}>
                Review quotes and respond to providers
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.gray[400]} />
          </TouchableOpacity>
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
          <Text style={{ fontSize: 12, fontWeight: "600", color: Colors.gray[500], marginTop: 14, marginBottom: 8 }}>
            Sort
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 8 }}>
            {sortChips.map((c) => {
              const active = sortPreset === c.key;
              return (
                <TouchableOpacity
                  key={c.key}
                  onPress={() => {
                    haptic.selection();
                    setSortPreset(c.key);
                  }}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    borderRadius: 9999,
                    backgroundColor: active ? Colors.gray[900] : Colors.gray[100],
                    marginRight: 8,
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Sort bookings: ${c.label}`}
                  accessibilityState={{ selected: active }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "600", color: active ? Colors.white : Colors.gray[700] }}>
                    {c.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>

      {loading && !bookings.length ? (
        <View style={[contentWrapperStyle, { padding: contentPadding }]}>
          <BookingCardSkeleton />
          <BookingCardSkeleton />
          <BookingCardSkeleton />
        </View>
      ) : (
        <FlashList
          data={bookings}
          extraData={`${tab}:${sortPreset}`}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={{
            paddingHorizontal: contentPadding,
            paddingTop: contentPadding,
            paddingBottom: tabScrollPaddingBottom,
          }}
          refreshControl={
            // §UI-audit 2026-04: added Android `colors` so the spinner
            // adopts the brand pink (iOS `tintColor` alone is ignored).
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refetch}
              tintColor={Colors.primary}
              colors={[Colors.primary]}
            />
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
            error ? null : <EmptyBookingsTab tab={tab} />
          }
        />
      )}
    </View>
  );
}
