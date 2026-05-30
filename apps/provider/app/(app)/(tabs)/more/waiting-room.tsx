import { useEffect, useRef, useMemo, useCallback, useState } from "react";
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Alert } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { format, parseISO } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { useResponsive } from "@/hooks/useResponsive";
import { useProvider } from "@/providers/ProviderContext";
import { useModuleConfig } from "@/providers/ConfigBundleProvider";
import { formatFrontDeskRangeCaption, getMetricRangeParams, type FrontDeskMetricRange } from "@beautonomi/utils";
import { buildStripDateParams } from "@/lib/bookings-list-query";
import { playRingtone } from "@/lib/on-demand/ringtone";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { twStyle } from "@/lib/twStyle";

interface WaitingRoomEntry {
  id: string;
  client_name: string;
  client_phone?: string;
  service_name?: string;
  status: "waiting" | "in_service" | "completed" | "left";
  checked_in_time: string;
  is_group_booking?: boolean;
  group_booking_id?: string | null;
}

interface TodayBookingRow {
  id: string;
  booking_number?: string;
  status: string;
  db_status?: string;
  scheduled_at: string;
  location_type?: string;
  is_group_booking?: boolean;
  group_booking_id?: string | null;
  customers?: { full_name?: string; phone?: string } | null;
  services?: { name?: string; offering_name?: string; duration_minutes?: number }[];
}

const METRIC_RANGES: { id: FrontDeskMetricRange; label: string }[] = [
  { id: "all", label: "All" },
  { id: "today", label: "Today" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "year", label: "Year" },
];

function serviceLine(s?: { name?: string; offering_name?: string; duration_minutes?: number }): string {
  const n = s?.name || s?.offering_name || "Service";
  const d = s?.duration_minutes;
  return d ? `${n} · ${d} min` : n;
}

function isActiveScheduleBooking(b: TodayBookingRow): boolean {
  return !["cancelled", "no_show", "completed"].includes(b.status);
}

/** Bookings that still need provider confirmation or payment completion before service. */
function needsConfirmation(dbStatus: string | undefined): boolean {
  return dbStatus === "pending" || dbStatus === "pending_payment";
}

export default function WaitingRoomScreen() {
  const router = useRouter();
  const routeParams = useLocalSearchParams<{
    highlight?: string;
    booking_id?: string;
    pending_booking_id?: string;
  }>();
  const highlightTarget =
    (typeof routeParams.pending_booking_id === "string" && routeParams.pending_booking_id.trim()) ||
    (typeof routeParams.highlight === "string" && routeParams.highlight.trim()) ||
    (typeof routeParams.booking_id === "string" && routeParams.booking_id.trim()) ||
    "";

  /** Navigate to the correct screen for a booking row (group or individual). */
  const openBooking = useCallback(
    (b: { id: string; is_group_booking?: boolean; group_booking_id?: string | null }) => {
      if (b.is_group_booking && b.group_booking_id) {
        router.push({
          pathname: "/(app)/(tabs)/more/group-bookings",
          params: { open_group_id: b.group_booking_id },
        } as never);
        return;
      }
      // Guard against synthetic group:UUID ids that slip through without the flag.
      const safeId = b.id.startsWith("group:") ? null : b.id;
      if (safeId) {
        router.push(`/(app)/(tabs)/more/bookings/${safeId}` as never);
      }
    },
    [router],
  );

  const { isTablet } = useResponsive();
  const { provider, selectedLocationId } = useProvider();
  const onDemandConfig = useModuleConfig("on_demand");
  const [metricRange, setMetricRange] = useState<FrontDeskMetricRange>("week");
  const prevWaitingQueueCountRef = useRef<number | null>(null);
  const prevPendingConfirmCountRef = useRef<number | null>(null);
  const ringtoneStopRef = useRef<(() => void) | null>(null);

  const waitingRoomUrl = selectedLocationId
    ? `/api/provider/waiting-room?location_id=${encodeURIComponent(selectedLocationId)}`
    : "/api/provider/waiting-room";
  const { data: entries, loading: waitingLoading, error: waitingError, refresh: refreshWaiting } =
    useApi<WaitingRoomEntry[]>(waitingRoomUrl);

  /** Same calendar window as web Front Desk metrics (bounded “All” = last 90 days). */
  const listRangeDates = useMemo(() => {
    let dates = getMetricRangeParams(metricRange, new Date());
    const tz = provider?.timezone?.trim();
    if (tz && metricRange === "today") {
      try {
        const ymd = formatInTimeZone(new Date(), tz, "yyyy-MM-dd");
        dates = { start: ymd, end: ymd };
      } catch {
        /* keep device-local range */
      }
    }
    if (highlightTarget) {
      const strip = buildStripDateParams(provider?.timezone);
      dates = {
        start:
          !dates.start || dates.start > strip.start_date ? strip.start_date : dates.start,
        end: !dates.end || dates.end < strip.end_date ? strip.end_date : dates.end,
      };
    }
    return dates;
  }, [metricRange, provider?.timezone, highlightTarget]);

  const bookingsRangeUrl = useMemo(() => {
    const params = new URLSearchParams();
    const dates = listRangeDates;
    if (dates.start) params.set("start_date", dates.start);
    if (dates.end) params.set("end_date", dates.end);
    params.set("limit", "1000");
    if (selectedLocationId != null) params.set("location_id", selectedLocationId);
    return `/api/provider/bookings?${params.toString()}`;
  }, [listRangeDates, selectedLocationId]);

  /** When a salon is selected, at-home bookings are excluded by location_id — merge a dedicated at_home query. */
  const atHomeBookingsUrl = useMemo(() => {
    const params = new URLSearchParams();
    const dates = listRangeDates;
    if (dates.start) params.set("start_date", dates.start);
    if (dates.end) params.set("end_date", dates.end);
    params.set("limit", "1000");
    params.set("location_type", "at_home");
    return `/api/provider/bookings?${params.toString()}`;
  }, [listRangeDates]);

  const {
    data: rawBookings,
    loading: bookingsLoading,
    error: bookingsError,
    refresh: refreshBookings,
  } = useApi<TodayBookingRow[]>(bookingsRangeUrl);

  const {
    data: rawAtHomeBookings,
    loading: atHomeBookingsLoading,
    error: atHomeBookingsError,
    refresh: refreshAtHomeBookings,
  } = useApi<TodayBookingRow[]>(atHomeBookingsUrl, { enabled: selectedLocationId != null });

  const mergedBookings = useMemo(() => {
    const main = Array.isArray(rawBookings) ? rawBookings : [];
    if (selectedLocationId == null) return main;
    const extra = Array.isArray(rawAtHomeBookings) ? rawAtHomeBookings : [];
    const seen = new Set(main.map((b) => b.id));
    return [...main, ...extra.filter((b) => !seen.has(b.id))];
  }, [rawBookings, rawAtHomeBookings, selectedLocationId]);

  const { execute: patchWaitingRoom } = useApiMutation("patch");

  const onRefresh = useCallback(() => {
    refreshWaiting();
    refreshBookings();
    if (selectedLocationId != null) void refreshAtHomeBookings();
  }, [refreshWaiting, refreshBookings, refreshAtHomeBookings, selectedLocationId]);

  useEffect(() => {
    return () => {
      ringtoneStopRef.current?.();
    };
  }, []);

  useEffect(() => {
    if (entries == null) return;
    const waitingCount = entries.filter((e) => e.status === "waiting").length;
    if (
      onDemandConfig.enabled &&
      onDemandConfig.ringtone_asset_path &&
      prevWaitingQueueCountRef.current !== null &&
      waitingCount > prevWaitingQueueCountRef.current
    ) {
      ringtoneStopRef.current?.();
      playRingtone(onDemandConfig).then((ctrl) => {
        ringtoneStopRef.current = ctrl.stop;
      });
    }
    prevWaitingQueueCountRef.current = waitingCount;
  }, [entries, onDemandConfig]);

  const waitingList = (entries ?? []).filter((e) => e.status === "waiting");
  const inServiceList = (entries ?? []).filter((e) => e.status === "in_service");

  const { pendingInRange, scheduleInRange, pendingCount } = useMemo(() => {
    const list = mergedBookings;
    const startYmd = listRangeDates.start;
    const endYmd = listRangeDates.end;
    const inSelectedRange = (b: TodayBookingRow) => {
      const d = parseISO(b.scheduled_at);
      if (!Number.isFinite(d.getTime())) return false;
      const ymd = provider?.timezone?.trim()
        ? formatInTimeZone(d, provider.timezone, "yyyy-MM-dd")
        : format(d, "yyyy-MM-dd");
      if (startYmd && endYmd) return ymd >= startYmd && ymd <= endYmd;
      return true;
    };
    const inRange = list.filter(inSelectedRange);
    const pending = inRange
      .filter((b) => needsConfirmation(b.db_status))
      .sort((a, b) => parseISO(a.scheduled_at).getTime() - parseISO(b.scheduled_at).getTime());
    const schedule = inRange
      .filter((b) => !needsConfirmation(b.db_status) && isActiveScheduleBooking(b))
      .sort((a, b) => parseISO(a.scheduled_at).getTime() - parseISO(b.scheduled_at).getTime());
    return {
      pendingInRange: pending,
      scheduleInRange: schedule,
      pendingCount: pending.length,
    };
  }, [mergedBookings, provider?.timezone, listRangeDates.start, listRangeDates.end]);

  const metricSummary = useMemo(() => {
    const list = mergedBookings;
    return {
      pendingCount: list.filter((b) => needsConfirmation(b.db_status)).length,
      bookedCount: list.filter((b) => !needsConfirmation(b.db_status) && isActiveScheduleBooking(b)).length,
      completedCount: list.filter((b) => b.status === "completed").length,
    };
  }, [mergedBookings]);

  const { pendingSalon, pendingHome, scheduleSalon, scheduleHome } = useMemo(
    () => ({
      pendingSalon: pendingInRange.filter((b) => b.location_type !== "at_home"),
      pendingHome: pendingInRange.filter((b) => b.location_type === "at_home"),
      scheduleSalon: scheduleInRange.filter((b) => b.location_type !== "at_home"),
      scheduleHome: scheduleInRange.filter((b) => b.location_type === "at_home"),
    }),
    [pendingInRange, scheduleInRange],
  );

  const metricRangeLabel = METRIC_RANGES.find((range) => range.id === metricRange)?.label ?? "Today";

  const headerSubtitle = useMemo(
    () =>
      `${formatFrontDeskRangeCaption(metricRange, new Date())} · Pending & schedule use the range above · Physical check-in queue is today only`,
    [metricRange],
  );

  useEffect(() => {
    if (
      onDemandConfig.enabled &&
      onDemandConfig.ringtone_asset_path &&
      prevPendingConfirmCountRef.current !== null &&
      pendingCount > prevPendingConfirmCountRef.current
    ) {
      ringtoneStopRef.current?.();
      playRingtone(onDemandConfig).then((ctrl) => {
        ringtoneStopRef.current = ctrl.stop;
      });
    }
    prevPendingConfirmCountRef.current = pendingCount;
  }, [pendingCount, onDemandConfig]);

  const setWrStatus = useCallback(
    async (bookingId: string, status: "waiting" | "in_service" | "completed") => {
      const { error } = await patchWaitingRoom(`/api/provider/waiting-room/${bookingId}`, { status });
      if (error) {
        Alert.alert("Could not update", error);
        return;
      }
      refreshWaiting();
    },
    [patchWaitingRoom, refreshWaiting],
  );

  /** Today's schedule — salon-scoped bookings + merged at_home rows when a location is selected */
  const scheduleStillLoading =
    bookingsLoading || (selectedLocationId != null ? atHomeBookingsLoading : false);

  if (scheduleStillLoading) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Front Desk" subtitle="Loading schedule…" showBack />
        <View style={twStyle("flex-1 items-center justify-center py-12")}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  const scheduleLoadError = Boolean(bookingsError && rawBookings === null) ||
    Boolean(selectedLocationId != null && atHomeBookingsError);

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader title="Front Desk" subtitle={headerSubtitle} showBack />

      <ScrollView
        style={twStyle("flex-1")}
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={waitingLoading || bookingsLoading || (selectedLocationId != null ? atHomeBookingsLoading : false)}
            onRefresh={onRefresh}
            tintColor="#1a1f3c"
          />
        }
      >
        {scheduleLoadError ? (
          <View style={twStyle("mx-4 mb-4")}>
            <ErrorState message={bookingsError ?? "Could not load today's bookings"} onRetry={onRefresh} />
          </View>
        ) : null}

        <View style={twStyle("mx-4 mb-3")}>
          <Text style={twStyle("mb-2 text-[10px] font-black uppercase tracking-widest text-gray-500")}>Metrics</Text>
          <View style={twStyle("flex-row flex-wrap")}>
            {METRIC_RANGES.map((range) => {
              const active = metricRange === range.id;
              return (
                <TouchableOpacity
                  key={range.id}
                  onPress={() => setMetricRange(range.id)}
                  style={[
                    twStyle(active ? "mb-2 mr-2 rounded-full bg-gray-900 px-3 py-2" : "mb-2 mr-2 rounded-full border border-gray-200 bg-white px-3 py-2"),
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`Show ${range.label.toLowerCase()} front desk metrics`}
                >
                  <Text style={twStyle(active ? "text-xs font-bold text-white" : "text-xs font-semibold text-gray-700")}>
                    {range.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Attention row */}
        <View style={twStyle("mx-4 mb-4 flex-row flex-wrap")}>
          <View style={[twStyle("min-w-[30%] flex-1 rounded-xl border border-amber-200 bg-amber-50 p-3"), { marginRight: 8, marginBottom: 8 }]}>
            <Text style={twStyle("text-xs font-semibold text-amber-800")}>Needs action</Text>
            <Text style={twStyle("text-2xl font-bold text-amber-900")}>{metricSummary.pendingCount}</Text>
            <Text style={twStyle("text-[10px] text-amber-700")}>Pending · {metricRangeLabel}</Text>
          </View>
          <View style={[twStyle("min-w-[30%] flex-1 rounded-xl border border-teal-200 bg-teal-50 p-3"), { marginRight: 8, marginBottom: 8 }]}>
            <Text style={twStyle("text-xs font-semibold text-teal-800")}>Booked</Text>
            <Text style={twStyle("text-2xl font-bold text-teal-900")}>{metricSummary.bookedCount}</Text>
            <Text style={twStyle("text-[10px] text-teal-700")}>Active · {metricRangeLabel}</Text>
          </View>
          <View style={[twStyle("min-w-[30%] flex-1 rounded-xl border border-gray-200 bg-gray-50 p-3"), { marginBottom: 8 }]}>
            <Text style={twStyle("text-xs font-semibold text-gray-700")}>Check-in queue</Text>
            <Text style={twStyle("text-2xl font-bold text-gray-900")}>{waitingList.length}</Text>
            <Text style={twStyle("text-[10px] text-gray-600")}>Waiting now</Text>
          </View>
          <View style={[twStyle("min-w-[30%] flex-1 rounded-xl border border-emerald-200 bg-emerald-50 p-3"), { marginBottom: 8 }]}>
            <Text style={twStyle("text-xs font-semibold text-emerald-800")}>Completed</Text>
            <Text style={twStyle("text-2xl font-bold text-emerald-900")}>{metricSummary.completedCount}</Text>
            <Text style={twStyle("text-[10px] text-emerald-700")}>Done · {metricRangeLabel}</Text>
          </View>
        </View>

        {waitingError && entries === null && (
          <View style={twStyle("mx-4 mb-4")}>
            <ErrorState
              message={`Could not load check-in queue: ${waitingError}. Pull down to retry.`}
              onRetry={onRefresh}
            />
          </View>
        )}

        {pendingCount > 0 && (
          <View style={twStyle("mx-4 mb-4 rounded-xl border border-amber-300 bg-amber-100/80 p-3")}>
            <View style={twStyle("flex-row items-center")}>
              <Ionicons name="flash" size={20} color="#B45309" />
              <Text style={twStyle("ml-2 flex-1 text-sm font-bold text-amber-900")}>
                Confirm these on the booking screen so clients know they are approved.
              </Text>
            </View>
          </View>
        )}

        {/* Pending confirmations */}
        <View style={twStyle("px-4 mb-6")}>
          <Text style={twStyle("mb-2 text-sm font-bold text-gray-900")}>Pending confirmation</Text>
          {pendingInRange.length === 0 ? (
            <View style={twStyle("rounded-xl border border-gray-100 bg-gray-50 p-4")}>
              <Text style={twStyle("text-center text-sm text-gray-500")}>None — you’re caught up.</Text>
            </View>
          ) : (
            <>
            {pendingSalon.length > 0 ? (
              <Text style={twStyle("mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-500")}>At salon</Text>
            ) : null}
            {pendingSalon.map((b) => {
              const t =
                provider?.timezone?.trim()
                  ? formatInTimeZone(parseISO(b.scheduled_at), provider.timezone, "HH:mm")
                  : format(parseISO(b.scheduled_at), "HH:mm");
              const name = b.customers?.full_name ?? "Guest";
              const svc = b.services?.[0];
              const isHighlight = highlightTarget.length > 0 && b.id === highlightTarget;
              return (
                <TouchableOpacity
                  key={b.id}
                  onPress={() => openBooking(b)}
                  style={[
                    twStyle("mb-2 flex-row items-center rounded-xl border-2 border-amber-300 bg-amber-50/90 p-4"),
                    isHighlight ? { borderColor: "#C026D3", backgroundColor: "#FAE8FF" } : null,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Pending booking ${name} at ${t}`}
                >
                  <View style={twStyle("mr-3 h-10 w-10 items-center justify-center rounded-full bg-amber-200")}>
                    <Ionicons name="alert-circle" size={22} color="#92400E" />
                  </View>
                  <View style={twStyle("flex-1")}>
                    <Text style={twStyle("font-semibold text-gray-900")}>{name}</Text>
                    <Text style={twStyle("text-xs text-amber-900 font-medium")}>{t} · Tap to confirm</Text>
                    {svc ? <Text style={twStyle("text-xs text-gray-600 mt-0.5")}>{serviceLine(svc)}</Text> : null}
                    {b.location_type === "at_home" ? (
                      <Text style={twStyle("text-[10px] text-violet-700 font-semibold mt-1")}>HOUSE CALL</Text>
                    ) : null}
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#92400E" />
                </TouchableOpacity>
              );
            })}
            {pendingHome.length > 0 ? (
              <>
                <Text style={[twStyle("mb-2 mt-3 text-[10px] font-bold uppercase tracking-wider text-violet-700"), pendingSalon.length === 0 ? { marginTop: 0 } : undefined]}>House calls</Text>
                {pendingHome.map((b) => {
              const t =
                provider?.timezone?.trim()
                  ? formatInTimeZone(parseISO(b.scheduled_at), provider.timezone, "HH:mm")
                  : format(parseISO(b.scheduled_at), "HH:mm");
              const name = b.customers?.full_name ?? "Guest";
              const svc = b.services?.[0];
              const isHighlight = highlightTarget.length > 0 && b.id === highlightTarget;
              return (
                <TouchableOpacity
                  key={b.id}
                  onPress={() => openBooking(b)}
                  style={[
                    twStyle("mb-2 flex-row items-center rounded-xl border-2 border-violet-200 bg-violet-50/90 p-4"),
                    isHighlight ? { borderColor: "#C026D3", backgroundColor: "#FAE8FF" } : null,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Pending house call ${name} at ${t}`}
                >
                  <View style={twStyle("mr-3 h-10 w-10 items-center justify-center rounded-full bg-violet-200")}>
                    <Ionicons name="home" size={20} color="#5B21B6" />
                  </View>
                  <View style={twStyle("flex-1")}>
                    <Text style={twStyle("font-semibold text-gray-900")}>{name}</Text>
                    <Text style={twStyle("text-xs text-violet-900 font-medium")}>{t} · Tap to confirm</Text>
                    {svc ? <Text style={twStyle("text-xs text-gray-600 mt-0.5")}>{serviceLine(svc)}</Text> : null}
                    <Text style={twStyle("text-[10px] text-violet-700 font-semibold mt-1")}>HOUSE CALL</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#5B21B6" />
                </TouchableOpacity>
              );
            })}
              </>
            ) : null}
            </>
          )}
        </View>

        {/* Schedule in selected metric range */}
        <View style={twStyle("px-4 mb-6")}>
          <Text style={twStyle("mb-2 text-sm font-bold text-gray-900")}>
            Schedule · {metricRangeLabel}
          </Text>
          {scheduleInRange.length === 0 ? (
            <View style={twStyle("rounded-xl border border-gray-100 bg-gray-50 p-4")}>
              <Text style={twStyle("text-center text-sm text-gray-500")}>No other active appointments today.</Text>
            </View>
          ) : (
            <>
            {scheduleSalon.length > 0 ? (
              <Text style={twStyle("mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-500")}>At salon</Text>
            ) : null}
            {scheduleSalon.map((b) => {
              const t =
                provider?.timezone?.trim()
                  ? formatInTimeZone(parseISO(b.scheduled_at), provider.timezone, "HH:mm")
                  : format(parseISO(b.scheduled_at), "HH:mm");
              const name = b.customers?.full_name ?? "Guest";
              const svc = b.services?.[0];
              const isHighlight = highlightTarget.length > 0 && b.id === highlightTarget;
              return (
                <TouchableOpacity
                  key={b.id}
                  onPress={() => openBooking(b)}
                  style={[
                    twStyle("mb-2 flex-row items-center rounded-xl border border-gray-100 bg-white p-4"),
                    isHighlight ? { borderColor: "#C026D3", borderWidth: 2, backgroundColor: "#FAE8FF" } : null,
                  ]}
                  accessibilityRole="button"
                >
                  <View style={twStyle("mr-3 h-10 w-10 items-center justify-center rounded-full bg-slate-100")}>
                    <Ionicons name="calendar" size={18} color="#475569" />
                  </View>
                  <View style={twStyle("flex-1")}>
                    <Text style={twStyle("font-medium text-gray-900")}>{name}</Text>
                    <Text style={twStyle("text-xs text-gray-500")}>
                      {t} · {b.status.replace(/_/g, " ")}
                    </Text>
                    {svc ? <Text style={twStyle("text-xs text-gray-500 mt-0.5")}>{serviceLine(svc)}</Text> : null}
                    {b.location_type === "at_home" ? (
                      <Text style={twStyle("text-[10px] text-violet-600 font-medium mt-1")}>At client location</Text>
                    ) : null}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
                </TouchableOpacity>
              );
            })}
            {scheduleHome.length > 0 ? (
              <>
                <Text style={[twStyle("mb-2 mt-3 text-[10px] font-bold uppercase tracking-wider text-violet-700"), scheduleSalon.length === 0 ? { marginTop: 0 } : undefined]}>House calls</Text>
                {scheduleHome.map((b) => {
              const t =
                provider?.timezone?.trim()
                  ? formatInTimeZone(parseISO(b.scheduled_at), provider.timezone, "HH:mm")
                  : format(parseISO(b.scheduled_at), "HH:mm");
              const name = b.customers?.full_name ?? "Guest";
              const svc = b.services?.[0];
              const isHighlight = highlightTarget.length > 0 && b.id === highlightTarget;
              return (
                <TouchableOpacity
                  key={b.id}
                  onPress={() => openBooking(b)}
                  style={[
                    twStyle("mb-2 flex-row items-center rounded-xl border border-violet-100 bg-violet-50/50 p-4"),
                    isHighlight ? { borderColor: "#C026D3", borderWidth: 2, backgroundColor: "#FAE8FF" } : null,
                  ]}
                  accessibilityRole="button"
                >
                  <View style={twStyle("mr-3 h-10 w-10 items-center justify-center rounded-full bg-violet-100")}>
                    <Ionicons name="home" size={18} color="#5B21B6" />
                  </View>
                  <View style={twStyle("flex-1")}>
                    <Text style={twStyle("font-medium text-gray-900")}>{name}</Text>
                    <Text style={twStyle("text-xs text-gray-500")}>
                      {t} · {b.status.replace(/_/g, " ")}
                    </Text>
                    {svc ? <Text style={twStyle("text-xs text-gray-500 mt-0.5")}>{serviceLine(svc)}</Text> : null}
                    <Text style={twStyle("text-[10px] text-violet-600 font-medium mt-1")}>At client location</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
                </TouchableOpacity>
              );
            })}
              </>
            ) : null}
            </>
          )}
        </View>

        {/* Physical check-in queue (checked in at salon) — today’s salon floor only */}
        <View style={twStyle(isTablet ? "flex-row px-4" : "px-4")}>
          <View style={twStyle(isTablet ? "flex-1 pr-2" : "")}>
            <Text style={twStyle("mb-2 text-sm font-semibold text-gray-900")}>Waiting (checked in)</Text>
            <Text style={twStyle("mb-2 text-[10px] font-medium uppercase tracking-wide text-gray-500")}>
              Today only — who is physically at the salon right now
            </Text>
            {waitingList.length === 0 ? (
              <View style={twStyle("rounded-xl border border-gray-100 bg-gray-50 p-4")}>
                <Text style={twStyle("text-center text-sm text-gray-500")}>No one in the waiting queue.</Text>
              </View>
            ) : (
              waitingList.map((entry) => (
                <View
                  key={entry.id}
                  style={[
                    twStyle("mb-2 flex-row items-center rounded-xl border border-gray-100 bg-white p-3"),
                    highlightTarget.length > 0 && entry.id === highlightTarget
                      ? { borderColor: "#C026D3", borderWidth: 2, backgroundColor: "#FAE8FF" }
                      : null,
                  ]}
                >
                  <TouchableOpacity
                    onPress={() => openBooking(entry)}
                    style={twStyle("min-w-0 flex-1 flex-row items-center")}
                    accessibilityRole="button"
                  >
                    <View style={twStyle("mr-3 h-10 w-10 items-center justify-center rounded-full bg-amber-100")}>
                      <Ionicons name="person" size={20} color="#b45309" />
                    </View>
                    <View style={twStyle("min-w-0 flex-1")}>
                      <Text style={twStyle("font-medium text-gray-900")} numberOfLines={1}>
                        {entry.client_name}
                      </Text>
                      {entry.service_name ? <Text style={twStyle("text-xs text-gray-500")}>{entry.service_name}</Text> : null}
                      <Text style={twStyle("text-xs text-gray-400")}>Checked in {format(new Date(entry.checked_in_time), "HH:mm")}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setWrStatus(entry.id, "in_service")}
                    style={twStyle("ml-2 rounded-lg bg-teal-600 px-3 py-2.5")}
                    accessibilityLabel="Start service"
                    accessibilityRole="button"
                  >
                    <Ionicons name="play" size={18} color="#fff" />
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>

          <View style={twStyle(isTablet ? "flex-1 pl-2" : "mt-6")}>
            <Text style={twStyle("mb-2 text-sm font-semibold text-gray-900")}>In service</Text>
            {inServiceList.length === 0 ? (
              <View style={twStyle("rounded-xl border border-gray-100 bg-gray-50 p-4")}>
                <Text style={twStyle("text-center text-sm text-gray-500")}>No one marked in service.</Text>
              </View>
            ) : (
              inServiceList.map((entry) => (
                <View
                  key={entry.id}
                  style={[
                    twStyle("mb-2 flex-row items-center rounded-xl border border-gray-100 bg-white p-3"),
                    highlightTarget.length > 0 && entry.id === highlightTarget
                      ? { borderColor: "#C026D3", borderWidth: 2, backgroundColor: "#FAE8FF" }
                      : null,
                  ]}
                >
                  <TouchableOpacity
                    onPress={() => openBooking(entry)}
                    style={twStyle("min-w-0 flex-1 flex-row items-center")}
                    accessibilityRole="button"
                  >
                    <View style={twStyle("mr-3 h-10 w-10 items-center justify-center rounded-full bg-blue-100")}>
                      <Ionicons name="person" size={20} color="#1d4ed8" />
                    </View>
                    <View style={twStyle("min-w-0 flex-1")}>
                      <Text style={twStyle("font-medium text-gray-900")} numberOfLines={1}>
                        {entry.client_name}
                      </Text>
                      {entry.service_name ? <Text style={twStyle("text-xs text-gray-500")}>{entry.service_name}</Text> : null}
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setWrStatus(entry.id, "completed")}
                    style={twStyle("ml-2 rounded-lg bg-slate-700 px-3 py-2.5")}
                    accessibilityLabel="Complete appointment"
                    accessibilityRole="button"
                  >
                    <Ionicons name="checkmark-done" size={18} color="#fff" />
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
