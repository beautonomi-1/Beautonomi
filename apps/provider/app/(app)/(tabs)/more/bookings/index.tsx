import { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  RefreshControl,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  format,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
} from "date-fns";
import { useApi } from "@/hooks/useApi";
import { useProvider } from "@/providers/ProviderContext";
import { useResponsive } from "@/hooks/useResponsive";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { formatCurrency } from "@/lib/format";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";
import { twStyle } from "@/lib/twStyle";
import { Colors } from "@/constants/colors";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface BookingCustomer {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
}

interface BookingService {
  id: string;
  name?: string;
  offering_name?: string;
  duration_minutes?: number;
  price?: number;
  staff_name?: string | null;
}

interface Booking {
  id: string;
  booking_number: string | null;
  status: string;
  scheduled_at: string | null;
  total_amount: number | null;
  location_type?: "at_salon" | "at_home" | null;
  customers?: BookingCustomer | null;
  services?: BookingService[];
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

type DateRange = "today" | "week" | "month" | "upcoming" | "all";

const DATE_RANGE_OPTIONS: { label: string; value: DateRange }[] = [
  { label: "Today", value: "today" },
  { label: "This week", value: "week" },
  { label: "This month", value: "month" },
  { label: "Upcoming", value: "upcoming" },
  { label: "All", value: "all" },
];

const STATUS_OPTIONS = [
  { label: "All", value: "" },
  { label: "Pending", value: "pending" },
  { label: "Awaiting payment", value: "pending_payment" },
  { label: "Confirmed", value: "confirmed" },
  { label: "Waiting", value: "waiting" },
  { label: "Checked in", value: "checked_in" },
  { label: "In progress", value: "in_progress" },
  { label: "Completed", value: "completed" },
  { label: "Cancelled", value: "cancelled" },
  { label: "No show", value: "no_show" },
];

// §Provider-launch (audit 2026-04): colour chips cover the full DB
// lifecycle including pending_payment, waiting and checked_in so the
// provider can distinguish them in the list at a glance.
const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  confirmed:       { bg: "#dcfce7", text: "#166534" },
  completed:       { bg: "#f3f4f6", text: "#374151" },
  cancelled:       { bg: "#fee2e2", text: "#991b1b" },
  no_show:         { bg: "#fee2e2", text: "#991b1b" },
  pending:         { bg: "#fef3c7", text: "#92400e" },
  pending_payment: { bg: "#fde68a", text: "#78350f" },
  waiting:         { bg: "#e0f2fe", text: "#075985" },
  checked_in:      { bg: "#ccfbf1", text: "#115e59" },
  in_progress:     { bg: "#dbeafe", text: "#1e40af" },
  booked:          { bg: "#ede9fe", text: "#5b21b6" },
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  pending_payment: "Awaiting payment",
  confirmed: "Confirmed",
  booked: "Booked",
  waiting: "Waiting",
  checked_in: "Checked in",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No show",
};

function formatBookingStatusLabel(raw: string | null | undefined): string {
  const s = (raw || "").trim().toLowerCase();
  if (STATUS_LABEL[s]) return STATUS_LABEL[s];
  if (!s) return "—";
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function buildDateParams(range: DateRange): { start_date?: string; end_date?: string } {
  const now = new Date();
  switch (range) {
    case "today":
      return {
        start_date: format(startOfDay(now), "yyyy-MM-dd"),
        end_date: format(endOfDay(now), "yyyy-MM-dd"),
      };
    case "week":
      return {
        start_date: format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd"),
        end_date: format(endOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd"),
      };
    case "month":
      return {
        start_date: format(startOfMonth(now), "yyyy-MM-dd"),
        end_date: format(endOfMonth(now), "yyyy-MM-dd"),
      };
    case "upcoming":
      return { start_date: format(now, "yyyy-MM-dd") };
    case "all":
    default:
      return {};
  }
}

function formatScheduledAt(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "—";
  return parsed.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ------------------------------------------------------------------ */
/*  Screen                                                             */
/* ------------------------------------------------------------------ */

export default function BookingsListScreen() {
  const router = useRouter();
  const { screenPadding } = useResponsive();
  const { selectedLocationId } = useProvider();
  const currency = getTenantDefaultCurrency();

  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateRange, setDateRange] = useState<DateRange>("month");

  const dateParams = useMemo(() => buildDateParams(dateRange), [dateRange]);

  const queryParts: string[] = [];
  if (dateParams.start_date) queryParts.push(`start_date=${dateParams.start_date}`);
  if (dateParams.end_date) queryParts.push(`end_date=${dateParams.end_date}`);
  if (statusFilter) queryParts.push(`status=${encodeURIComponent(statusFilter)}`);
  if (selectedLocationId) queryParts.push(`location_id=${encodeURIComponent(selectedLocationId)}`);
  // §UX-audit 2026-04: list order previously relied on the API default,
  // which flipped between newest-first and oldest-first depending on
  // query variant. Owners expect chronological upcoming-first so they
  // can triage the next booking on top of the list.
  queryParts.push("sort=scheduled_at");
  queryParts.push("order=asc");
  const url = `/api/provider/bookings?${queryParts.join("&")}`;

  const { data, loading, error, refresh } = useApi<Booking[]>(url);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const filtered = useMemo(() => {
    const allBookings: Booking[] = Array.isArray(data) ? data : [];
    const q = search.trim().toLowerCase();
    if (!q) return allBookings;
    return allBookings.filter((b) => {
      const name = (b.customers?.full_name ?? "").toLowerCase();
      const num = (b.booking_number ?? "").toLowerCase();
      const service = (b.services?.[0]?.name ?? b.services?.[0]?.offering_name ?? "").toLowerCase();
      return name.includes(q) || num.includes(q) || service.includes(q);
    });
  }, [data, search]);

  const dateRangeLabel = useMemo(() => {
    const now = new Date();
    switch (dateRange) {
      case "today":     return format(now, "EEE, MMM d");
      case "week":      return `Week of ${format(startOfWeek(now, { weekStartsOn: 1 }), "MMM d")}`;
      case "month":     return format(now, "MMMM yyyy");
      case "upcoming":  return "Upcoming";
      case "all":       return "All time";
    }
  }, [dateRange]);

  const bookingKeyExtractor = useCallback((b: Booking) => b.id, []);

  const renderBookingItem = useCallback(
    ({ item: b }: { item: Booking }) => {
      const customerName = b.customers?.full_name || "Customer";
      const serviceName =
        b.services?.[0]?.name ?? b.services?.[0]?.offering_name ?? "Booking";
      const scheduled = formatScheduledAt(b.scheduled_at);
      const st = STATUS_STYLE[b.status] ?? { bg: Colors.gray[100], text: Colors.gray[700] };

      return (
        <TouchableOpacity
          onPress={() => router.push(`/(app)/(tabs)/more/bookings/${b.id}` as never)}
          style={twStyle(
            "mb-2.5 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"
          )}
          activeOpacity={0.7}
          accessibilityLabel={`Booking for ${customerName}`}
          accessibilityRole="button"
        >
          <View style={twStyle("flex-row items-start justify-between")}>
            <View style={twStyle("flex-1 pr-3")}>
              <Text
                style={twStyle("text-base font-semibold text-gray-900")}
                numberOfLines={1}
              >
                {customerName}
              </Text>
              <Text
                style={twStyle("mt-0.5 text-sm text-gray-600")}
                numberOfLines={1}
              >
                {serviceName}
                {b.services?.[0]?.staff_name
                  ? ` · ${b.services[0].staff_name}`
                  : ""}
              </Text>
              <View style={twStyle("mt-1.5 flex-row items-center gap-2")}>
                <Ionicons name="time-outline" size={13} color="#6b7280" />
                <Text style={twStyle("text-xs text-gray-500")}>{scheduled}</Text>
              </View>
              <View style={twStyle("mt-1 flex-row items-center gap-3")}>
                {b.location_type && (
                  <View style={twStyle("flex-row items-center gap-1")}>
                    <Ionicons
                      name={b.location_type === "at_home" ? "home-outline" : "business-outline"}
                      size={12}
                      color="#6b7280"
                    />
                    <Text style={twStyle("text-xs text-gray-500")}>
                      {b.location_type === "at_home" ? "House call" : "At salon"}
                    </Text>
                  </View>
                )}
                {b.total_amount != null && b.total_amount > 0 && (
                  <Text style={twStyle("text-xs font-semibold text-gray-700")}>
                    {formatCurrency(b.total_amount, currency)}
                  </Text>
                )}
                {b.booking_number && (
                  <Text style={twStyle("text-xs text-gray-400")}>#{b.booking_number}</Text>
                )}
              </View>
            </View>

            <View style={twStyle("items-end gap-1.5")}>
              <View
                style={[
                  twStyle("rounded-full px-2.5 py-1"),
                  { backgroundColor: st.bg },
                ]}
              >
                <Text
                  style={[
                    twStyle("text-xs font-medium"),
                    { color: st.text },
                  ]}
                >
                  {formatBookingStatusLabel(b.status)}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color="#d1d5db" />
            </View>
          </View>
        </TouchableOpacity>
      );
    },
    [router, currency],
  );

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Bookings" showBack />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 48 }}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Bookings" showBack />
        <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 16 }}>
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title="Bookings"
        showBack
        subtitle={`${dateRangeLabel} · ${filtered.length}`}
        rightAction={
          <TouchableOpacity
            onPress={() => router.push("/(app)/(tabs)/more/bookings/new" as never)}
            style={twStyle("flex-row items-center rounded-xl bg-indigo-600 px-4 py-2")}
            accessibilityLabel="New booking"
            accessibilityRole="button"
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={twStyle("ml-1.5 text-sm font-semibold text-white")}>New</Text>
          </TouchableOpacity>
        }
      />

      {/* ── Search bar ── */}
      <View style={[twStyle("mx-4 mb-2"), { paddingHorizontal: 0 }]}>
        <View style={twStyle("flex-row items-center rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2.5")}>
          <Ionicons name="search-outline" size={16} color="#9ca3af" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search customer, service, #number…"
            placeholderTextColor="#9ca3af"
            style={twStyle("ml-2 flex-1 text-sm text-gray-900")}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            accessibilityLabel="Search bookings"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")} accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={16} color="#9ca3af" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Date range chips ── */}
      <View style={{ marginBottom: 6 }}>
        <FlatList<{ label: string; value: DateRange }>
          horizontal
          data={DATE_RANGE_OPTIONS}
          keyExtractor={(o: { label: string; value: DateRange }) => o.value}
          contentContainerStyle={{ paddingHorizontal: screenPadding, gap: 8 }}
          showsHorizontalScrollIndicator={false}
          renderItem={({ item: opt }: { item: { label: string; value: DateRange } }) => {
            const active = dateRange === opt.value;
            return (
              <TouchableOpacity
                onPress={() => setDateRange(opt.value)}
                style={[
                  twStyle(
                    `rounded-full px-3.5 py-2 ${active ? "bg-indigo-600" : "border border-gray-200 bg-white"}`
                  ),
                  // §UI-audit 2026-04: 36px was below HIG's 44pt guidance.
                  { minHeight: 44, justifyContent: "center" },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Filter by ${opt.label}`}
                accessibilityState={{ selected: active }}
              >
                <Text style={twStyle(`text-xs font-semibold ${active ? "text-white" : "text-gray-600"}`)}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {/* ── Status filter chips ── */}
      <View style={{ marginBottom: 10 }}>
        <FlatList<(typeof STATUS_OPTIONS)[number]>
          horizontal
          data={STATUS_OPTIONS}
          keyExtractor={(o: (typeof STATUS_OPTIONS)[number]) => o.value || "all"}
          contentContainerStyle={{ paddingHorizontal: screenPadding, gap: 8 }}
          showsHorizontalScrollIndicator={false}
          renderItem={({ item: opt }: { item: (typeof STATUS_OPTIONS)[number] }) => {
            const active = statusFilter === opt.value;
            return (
              <TouchableOpacity
                onPress={() => setStatusFilter(opt.value)}
                style={[
                  twStyle(
                    `rounded-full px-3.5 py-2 ${active ? "bg-gray-900" : "border border-gray-100 bg-white"}`
                  ),
                  { minHeight: 44, justifyContent: "center" },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Filter by ${opt.label}`}
                accessibilityState={{ selected: active }}
              >
                <Text style={twStyle(`text-xs font-medium ${active ? "text-white" : "text-gray-600"}`)}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {/* ── List ── */}
      <FlashList
        data={filtered}
        keyExtractor={bookingKeyExtractor}
        renderItem={renderBookingItem}
        contentContainerStyle={{ paddingHorizontal: screenPadding, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <EmptyState
            icon="calendar-outline"
            title={search || statusFilter ? "No bookings match" : "No bookings found"}
            description={
              search || statusFilter
                ? "Try adjusting your search or filters."
                : "Create a new booking to get started."
            }
            actionLabel={!search && !statusFilter ? "New booking" : undefined}
            onAction={
              !search && !statusFilter
                ? () => router.push("/(app)/(tabs)/more/bookings/new" as never)
                : undefined
            }
          />
        }
      />
    </ScreenContainer>
  );
}
