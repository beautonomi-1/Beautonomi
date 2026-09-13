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
import { useTranslation } from "@beautonomi/i18n";
import { DirectionalIcon } from "@/components/ui/DirectionalIcon";

interface WaitingRoomEntry {
  id: string;
  client_name: string;
  client_phone?: string;
  service_name?: string;
  status: "waiting" | "in_service" | "completed" | "left";
  checked_in_time: string;
  is_group_booking?: boolean;
  group_booking_id?: string | null;
  customer_running_late_at?: string | null;
  customer_running_late_minutes?: number | null;
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
  customer_running_late_at?: string | null;
  customer_running_late_minutes?: number | null;
  customers?: { full_name?: string; phone?: string } | null;
  services?: { name?: string; offering_name?: string; duration_minutes?: number }[];
}

interface CloseOutBookingRow {
  id: string;
  booking_number?: string | null;
  scheduled_at: string;
  status: string;
  location_type?: string | null;
  suggested_close_out_action?: string | null;
  customer?: { full_name?: string | null } | null;
  booking_services?: Array<{ offerings?: { title?: string } | null }> | null;
}

interface CloseOutPayload {
  summary?: { today?: number; older?: number; total?: number };
  bookings?: CloseOutBookingRow[];
}

const METRIC_RANGE_IDS: FrontDeskMetricRange[] = ["all", "today", "week", "month", "year"];

const METRIC_RANGE_KEY: Record<FrontDeskMetricRange, string> = {
  all: "metricRangeAll",
  today: "metricRangeToday",
  week: "metricRangeWeek",
  month: "metricRangeMonth",
  year: "metricRangeYear",
};

function isActiveScheduleBooking(b: TodayBookingRow): boolean {
  return !["cancelled", "no_show", "completed"].includes(b.status);
}

/** Bookings that still need provider confirmation or payment completion before service. */
function needsConfirmation(dbStatus: string | undefined): boolean {
  return dbStatus === "pending" || dbStatus === "pending_payment";
}

export default function WaitingRoomScreen() {
  const { t } = useTranslation();
  const wr = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(`provider.mobile.screens.waitingRoom.${key}`, opts) as string,
    [t],
  );

  const serviceLine = useCallback(
    (s?: { name?: string; offering_name?: string; duration_minutes?: number }) => {
      const n = s?.name || s?.offering_name || wr("serviceFallback");
      const d = s?.duration_minutes;
      return d ? wr("serviceWithDuration", { name: n, minutes: d }) : n;
    },
    [wr],
  );

  const runningLateLabel = useCallback(
    (minutes?: number | null) =>
      minutes && minutes > 0 ? wr("runningLateMinutes", { minutes }) : wr("runningLate"),
    [wr],
  );

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
  const closeOutUrl = selectedLocationId
    ? `/api/provider/bookings/close-out?location_id=${encodeURIComponent(selectedLocationId)}`
    : "/api/provider/bookings/close-out";
  const { data: entries, loading: waitingLoading, error: waitingError, refresh: refreshWaiting } =
    useApi<WaitingRoomEntry[]>(waitingRoomUrl);
  const { data: closeOutData, refresh: refreshCloseOut } = useApi<CloseOutPayload>(closeOutUrl, {
    staleTimeMs: 30_000,
  });

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
    refreshCloseOut();
    if (selectedLocationId != null) void refreshAtHomeBookings();
  }, [refreshWaiting, refreshBookings, refreshCloseOut, refreshAtHomeBookings, selectedLocationId]);

  const unclosedBookings = useMemo(() => {
    const rows = Array.isArray(closeOutData?.bookings) ? closeOutData!.bookings! : [];
    return [...rows].sort(
      (a, b) => parseISO(a.scheduled_at).getTime() - parseISO(b.scheduled_at).getTime(),
    );
  }, [closeOutData?.bookings]);

  const unclosedTotal = closeOutData?.summary?.total ?? unclosedBookings.length;

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

  const metricRangeLabel = wr(METRIC_RANGE_KEY[metricRange] ?? "metricRangeToday");

  const headerSubtitle = useMemo(
    () =>
      wr("headerSubtitle", {
        rangeCaption: formatFrontDeskRangeCaption(metricRange, new Date()),
      }),
    [metricRange, wr],
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
        Alert.alert(wr("couldNotUpdateTitle"), error);
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
        <ScreenHeader title={wr("title")} subtitle={wr("loadingSubtitle")} showBack />
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
      <ScreenHeader title={wr("title")} subtitle={headerSubtitle} showBack />

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
            <ErrorState message={bookingsError ?? wr("loadBookingsFailed")} onRetry={onRefresh} />
          </View>
        ) : null}

        <View style={twStyle("mx-4 mb-3")}>
          <Text style={twStyle("mb-2 text-[10px] font-black uppercase tracking-widest text-gray-500")}>{wr("metricsLabel")}</Text>
          <View style={twStyle("flex-row flex-wrap")}>
            {METRIC_RANGE_IDS.map((rangeId) => {
              const active = metricRange === rangeId;
              const rangeLabel = wr(METRIC_RANGE_KEY[rangeId]);
              return (
                <TouchableOpacity
                  key={rangeId}
                  onPress={() => setMetricRange(rangeId)}
                  style={[
                    twStyle(active ? "mb-2 me-2 rounded-full bg-gray-900 px-3 py-2" : "mb-2 me-2 rounded-full border border-gray-200 bg-white px-3 py-2"),
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={wr("metricRangeA11y", { range: rangeLabel.toLowerCase() })}
                >
                  <Text style={twStyle(active ? "text-xs font-bold text-white" : "text-xs font-semibold text-gray-700")}>
                    {rangeLabel}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Attention row */}
        <View style={twStyle("mx-4 mb-4 flex-row flex-wrap")}>
          <View style={[twStyle("min-w-[30%] flex-1 rounded-xl border border-amber-200 bg-amber-50 p-3"), { marginEnd: 8, marginBottom: 8 }]}>
            <Text style={twStyle("text-xs font-semibold text-amber-800")}>{wr("needsAction")}</Text>
            <Text style={twStyle("text-2xl font-bold text-amber-900")}>{metricSummary.pendingCount}</Text>
            <Text style={twStyle("text-[10px] text-amber-700")}>{wr("pendingMetric", { range: metricRangeLabel })}</Text>
          </View>
          <View style={[twStyle("min-w-[30%] flex-1 rounded-xl border border-teal-200 bg-teal-50 p-3"), { marginEnd: 8, marginBottom: 8 }]}>
            <Text style={twStyle("text-xs font-semibold text-teal-800")}>{wr("booked")}</Text>
            <Text style={twStyle("text-2xl font-bold text-teal-900")}>{metricSummary.bookedCount}</Text>
            <Text style={twStyle("text-[10px] text-teal-700")}>{wr("activeMetric", { range: metricRangeLabel })}</Text>
          </View>
          <View style={[twStyle("min-w-[30%] flex-1 rounded-xl border border-gray-200 bg-gray-50 p-3"), { marginBottom: 8 }]}>
            <Text style={twStyle("text-xs font-semibold text-gray-700")}>{wr("checkInQueue")}</Text>
            <Text style={twStyle("text-2xl font-bold text-gray-900")}>{waitingList.length}</Text>
            <Text style={twStyle("text-[10px] text-gray-600")}>{wr("waitingNow")}</Text>
          </View>
          <View style={[twStyle("min-w-[30%] flex-1 rounded-xl border border-emerald-200 bg-emerald-50 p-3"), { marginBottom: 8 }]}>
            <Text style={twStyle("text-xs font-semibold text-emerald-800")}>{wr("completed")}</Text>
            <Text style={twStyle("text-2xl font-bold text-emerald-900")}>{metricSummary.completedCount}</Text>
            <Text style={twStyle("text-[10px] text-emerald-700")}>{wr("doneMetric", { range: metricRangeLabel })}</Text>
          </View>
          <TouchableOpacity
            onPress={() =>
              router.push({
                pathname: "/(app)/(tabs)/more/bookings",
                params: { status: "close_out" },
              } as never)
            }
            style={[twStyle("min-w-[30%] flex-1 rounded-xl border border-orange-200 bg-orange-50 p-3"), { marginBottom: 8 }]}
            accessibilityRole="button"
            accessibilityLabel={wr("unclosedA11y", { count: unclosedTotal })}
          >
            <Text style={twStyle("text-xs font-semibold text-orange-800")}>{wr("unclosed")}</Text>
            <Text style={twStyle("text-2xl font-bold text-orange-900")}>{unclosedTotal}</Text>
            <Text style={twStyle("text-[10px] text-orange-700")}>{wr("needCloseOut")}</Text>
          </TouchableOpacity>
        </View>

        {waitingError && entries === null && (
          <View style={twStyle("mx-4 mb-4")}>
            <ErrorState
              message={wr("loadQueueFailed", { error: waitingError })}
              onRetry={onRefresh}
            />
          </View>
        )}

        {pendingCount > 0 && (
          <View style={twStyle("mx-4 mb-4 rounded-xl border border-amber-300 bg-amber-100/80 p-3")}>
            <View style={twStyle("flex-row items-center")}>
              <Ionicons name="flash" size={20} color="#B45309" />
              <Text style={twStyle("ms-2 flex-1 text-sm font-bold text-amber-900")}>
                {wr("confirmBanner")}
              </Text>
            </View>
          </View>
        )}

        {/* Unclosed appointments (close-out queue) */}
        {unclosedBookings.length > 0 ? (
          <View style={twStyle("px-4 mb-6")}>
            <Text style={twStyle("mb-2 text-sm font-bold text-gray-900")}>{wr("unclosedAppointments")}</Text>
            <Text style={twStyle("mb-3 text-xs text-gray-500")}>
              {wr("unclosedHint")}
            </Text>
            {unclosedBookings.slice(0, 12).map((b) => {
              const t =
                provider?.timezone?.trim()
                  ? formatInTimeZone(parseISO(b.scheduled_at), provider.timezone, "HH:mm")
                  : format(parseISO(b.scheduled_at), "HH:mm");
              const name = b.customer?.full_name ?? wr("guest");
              const svc =
                b.booking_services?.[0]?.offerings?.title ??
                (b.location_type === "at_home" ? wr("houseCall") : wr("appointment"));
              const isHighlight = highlightTarget.length > 0 && b.id === highlightTarget;
              return (
                <TouchableOpacity
                  key={b.id}
                  onPress={() => openBooking(b)}
                  style={[
                    twStyle("mb-2 flex-row items-center rounded-xl border-2 border-orange-200 bg-orange-50/90 p-4"),
                    isHighlight ? { borderColor: "#C026D3", backgroundColor: "#FAE8FF" } : null,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={wr("unclosedBookingA11y", { name, time: t })}
                >
                  <View style={twStyle("me-3 h-10 w-10 items-center justify-center rounded-full bg-orange-200")}>
                    <Ionicons name="alert-circle-outline" size={22} color="#9A3412" />
                  </View>
                  <View style={twStyle("flex-1")}>
                    <Text style={twStyle("font-semibold text-gray-900")}>{name}</Text>
                    <Text style={twStyle("text-xs font-medium text-orange-900")}>
                      {t} · {svc} · {wr("tapToCloseOut")}
                    </Text>
                    <Text style={twStyle("mt-0.5 text-[10px] text-orange-800")}>
                      {b.status.replace(/_/g, " ")}
                      {b.location_type === "at_home" ? ` · ${wr("houseCallTag")}` : ""}
                    </Text>
                  </View>
                  <DirectionalIcon name="chevron-forward" size={20} color="#9A3412" />
                </TouchableOpacity>
              );
            })}
            {unclosedBookings.length > 12 ? (
              <TouchableOpacity
                onPress={() =>
                  router.push({
                    pathname: "/(app)/(tabs)/more/bookings",
                    params: { status: "close_out" },
                  } as never)
                }
                style={twStyle("mt-1 rounded-xl border border-orange-200 bg-white px-4 py-3")}
                accessibilityRole="button"
              >
                <Text style={twStyle("text-center text-sm font-semibold text-orange-900")}>
                  {wr("viewAllUnclosed", { count: unclosedBookings.length })}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        {/* Pending confirmations */}
        <View style={twStyle("px-4 mb-6")}>
          <Text style={twStyle("mb-2 text-sm font-bold text-gray-900")}>{wr("pendingConfirmation")}</Text>
          {pendingInRange.length === 0 ? (
            <View style={twStyle("rounded-xl border border-gray-100 bg-gray-50 p-4")}>
              <Text style={twStyle("text-center text-sm text-gray-500")}>{wr("noneCaughtUp")}</Text>
            </View>
          ) : (
            <>
            {pendingSalon.length > 0 ? (
              <Text style={twStyle("mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-500")}>{wr("atSalon")}</Text>
            ) : null}
            {pendingSalon.map((b) => {
              const t =
                provider?.timezone?.trim()
                  ? formatInTimeZone(parseISO(b.scheduled_at), provider.timezone, "HH:mm")
                  : format(parseISO(b.scheduled_at), "HH:mm");
              const name = b.customers?.full_name ?? wr("guest");
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
                  accessibilityLabel={wr("pendingBookingA11y", { name, time: t })}
                >
                  <View style={twStyle("me-3 h-10 w-10 items-center justify-center rounded-full bg-amber-200")}>
                    <Ionicons name="alert-circle" size={22} color="#92400E" />
                  </View>
                  <View style={twStyle("flex-1")}>
                    <Text style={twStyle("font-semibold text-gray-900")}>{name}</Text>
                    <Text style={twStyle("text-xs text-amber-900 font-medium")}>{t} · {wr("tapToConfirm")}</Text>
                    {svc ? <Text style={twStyle("text-xs text-gray-600 mt-0.5")}>{serviceLine(svc)}</Text> : null}
                    {b.location_type === "at_home" ? (
                      <Text style={twStyle("text-[10px] text-violet-700 font-semibold mt-1")}>{wr("houseCallTag")}</Text>
                    ) : null}
                  </View>
                  <DirectionalIcon name="chevron-forward" size={20} color="#92400E" />
                </TouchableOpacity>
              );
            })}
            {pendingHome.length > 0 ? (
              <>
                <Text style={[twStyle("mb-2 mt-3 text-[10px] font-bold uppercase tracking-wider text-violet-700"), pendingSalon.length === 0 ? { marginTop: 0 } : undefined]}>{wr("houseCalls")}</Text>
                {pendingHome.map((b) => {
              const t =
                provider?.timezone?.trim()
                  ? formatInTimeZone(parseISO(b.scheduled_at), provider.timezone, "HH:mm")
                  : format(parseISO(b.scheduled_at), "HH:mm");
              const name = b.customers?.full_name ?? wr("guest");
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
                  accessibilityLabel={wr("pendingHouseCallA11y", { name, time: t })}
                >
                  <View style={twStyle("me-3 h-10 w-10 items-center justify-center rounded-full bg-violet-200")}>
                    <Ionicons name="home" size={20} color="#5B21B6" />
                  </View>
                  <View style={twStyle("flex-1")}>
                    <Text style={twStyle("font-semibold text-gray-900")}>{name}</Text>
                    <Text style={twStyle("text-xs text-violet-900 font-medium")}>{t} · {wr("tapToConfirm")}</Text>
                    {svc ? <Text style={twStyle("text-xs text-gray-600 mt-0.5")}>{serviceLine(svc)}</Text> : null}
                    <Text style={twStyle("text-[10px] text-violet-700 font-semibold mt-1")}>{wr("houseCallTag")}</Text>
                  </View>
                  <DirectionalIcon name="chevron-forward" size={20} color="#5B21B6" />
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
            {wr("scheduleTitle", { range: metricRangeLabel })}
          </Text>
          {scheduleInRange.length === 0 ? (
            <View style={twStyle("rounded-xl border border-gray-100 bg-gray-50 p-4")}>
              <Text style={twStyle("text-center text-sm text-gray-500")}>{wr("noActiveAppointments")}</Text>
            </View>
          ) : (
            <>
            {scheduleSalon.length > 0 ? (
              <Text style={twStyle("mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-500")}>{wr("atSalon")}</Text>
            ) : null}
            {scheduleSalon.map((b) => {
              const t =
                provider?.timezone?.trim()
                  ? formatInTimeZone(parseISO(b.scheduled_at), provider.timezone, "HH:mm")
                  : format(parseISO(b.scheduled_at), "HH:mm");
              const name = b.customers?.full_name ?? wr("guest");
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
                  <View style={twStyle("me-3 h-10 w-10 items-center justify-center rounded-full bg-slate-100")}>
                    <Ionicons name="calendar" size={18} color="#475569" />
                  </View>
                  <View style={twStyle("flex-1")}>
                    <Text style={twStyle("font-medium text-gray-900")}>{name}</Text>
                    {b.customer_running_late_at ? (
                      <Text style={twStyle("mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800")}>
                        {runningLateLabel(b.customer_running_late_minutes)}
                      </Text>
                    ) : null}
                    <Text style={twStyle("text-xs text-gray-500")}>
                      {t} · {b.status.replace(/_/g, " ")}
                    </Text>
                    {svc ? <Text style={twStyle("text-xs text-gray-500 mt-0.5")}>{serviceLine(svc)}</Text> : null}
                    {b.location_type === "at_home" ? (
                      <Text style={twStyle("text-[10px] text-violet-600 font-medium mt-1")}>{wr("atClientLocation")}</Text>
                    ) : null}
                  </View>
                  <DirectionalIcon name="chevron-forward" size={18} color="#9CA3AF" />
                </TouchableOpacity>
              );
            })}
            {scheduleHome.length > 0 ? (
              <>
                <Text style={[twStyle("mb-2 mt-3 text-[10px] font-bold uppercase tracking-wider text-violet-700"), scheduleSalon.length === 0 ? { marginTop: 0 } : undefined]}>{wr("houseCalls")}</Text>
                {scheduleHome.map((b) => {
              const t =
                provider?.timezone?.trim()
                  ? formatInTimeZone(parseISO(b.scheduled_at), provider.timezone, "HH:mm")
                  : format(parseISO(b.scheduled_at), "HH:mm");
              const name = b.customers?.full_name ?? wr("guest");
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
                  <View style={twStyle("me-3 h-10 w-10 items-center justify-center rounded-full bg-violet-100")}>
                    <Ionicons name="home" size={18} color="#5B21B6" />
                  </View>
                  <View style={twStyle("flex-1")}>
                    <Text style={twStyle("font-medium text-gray-900")}>{name}</Text>
                    {b.customer_running_late_at ? (
                      <Text style={twStyle("mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800")}>
                        {runningLateLabel(b.customer_running_late_minutes)}
                      </Text>
                    ) : null}
                    <Text style={twStyle("text-xs text-gray-500")}>
                      {t} · {b.status.replace(/_/g, " ")}
                    </Text>
                    {svc ? <Text style={twStyle("text-xs text-gray-500 mt-0.5")}>{serviceLine(svc)}</Text> : null}
                    <Text style={twStyle("text-[10px] text-violet-600 font-medium mt-1")}>{wr("atClientLocation")}</Text>
                  </View>
                  <DirectionalIcon name="chevron-forward" size={18} color="#9CA3AF" />
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
          <View style={twStyle(isTablet ? "flex-1 pe-2" : "")}>
            <Text style={twStyle("mb-2 text-sm font-semibold text-gray-900")}>{wr("waitingCheckedIn")}</Text>
            <Text style={twStyle("mb-2 text-[10px] font-medium uppercase tracking-wide text-gray-500")}>
              {wr("waitingTodayOnly")}
            </Text>
            {waitingList.length === 0 ? (
              <View style={twStyle("rounded-xl border border-gray-100 bg-gray-50 p-4")}>
                <Text style={twStyle("text-center text-sm text-gray-500")}>{wr("noOneWaiting")}</Text>
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
                    <View style={twStyle("me-3 h-10 w-10 items-center justify-center rounded-full bg-amber-100")}>
                      <Ionicons name="person" size={20} color="#b45309" />
                    </View>
                    <View style={twStyle("min-w-0 flex-1")}>
                      <Text style={twStyle("font-medium text-gray-900")} numberOfLines={1}>
                        {entry.client_name}
                      </Text>
                      {entry.customer_running_late_at ? (
                        <Text style={twStyle("text-[10px] font-semibold uppercase tracking-wide text-amber-800")}>
                          {runningLateLabel(entry.customer_running_late_minutes)}
                        </Text>
                      ) : null}
                      {entry.service_name ? <Text style={twStyle("text-xs text-gray-500")}>{entry.service_name}</Text> : null}
                      <Text style={twStyle("text-xs text-gray-400")}>{wr("checkedInAt", { time: format(new Date(entry.checked_in_time), "HH:mm") })}</Text>
                    </View>
                    <DirectionalIcon name="chevron-forward" size={18} color="#9CA3AF" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setWrStatus(entry.id, "in_service")}
                    style={twStyle("ms-2 rounded-lg bg-teal-600 px-3 py-2.5")}
                    accessibilityLabel={wr("startServiceA11y")}
                    accessibilityRole="button"
                  >
                    <Ionicons name="play" size={18} color="#fff" />
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>

          <View style={twStyle(isTablet ? "flex-1 ps-2" : "mt-6")}>
            <Text style={twStyle("mb-2 text-sm font-semibold text-gray-900")}>{wr("inService")}</Text>
            {inServiceList.length === 0 ? (
              <View style={twStyle("rounded-xl border border-gray-100 bg-gray-50 p-4")}>
                <Text style={twStyle("text-center text-sm text-gray-500")}>{wr("noOneInService")}</Text>
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
                    <View style={twStyle("me-3 h-10 w-10 items-center justify-center rounded-full bg-blue-100")}>
                      <Ionicons name="person" size={20} color="#1d4ed8" />
                    </View>
                    <View style={twStyle("min-w-0 flex-1")}>
                      <Text style={twStyle("font-medium text-gray-900")} numberOfLines={1}>
                        {entry.client_name}
                      </Text>
                      {entry.service_name ? <Text style={twStyle("text-xs text-gray-500")}>{entry.service_name}</Text> : null}
                    </View>
                    <DirectionalIcon name="chevron-forward" size={18} color="#9CA3AF" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setWrStatus(entry.id, "completed")}
                    style={twStyle("ms-2 rounded-lg bg-slate-700 px-3 py-2.5")}
                    accessibilityLabel={wr("completeAppointmentA11y")}
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
