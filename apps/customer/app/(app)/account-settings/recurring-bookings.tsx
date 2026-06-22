import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "@beautonomi/i18n";
import { View, Text, FlatList, TouchableOpacity, RefreshControl, Alert, ActivityIndicator, Platform, Modal, Switch, TextInput, Pressable, ScrollView } from "react-native";
import { AppKeyboardAvoidingView as KeyboardAvoidingView } from "@/components/AppKeyboardAvoidingView";
import { router } from "expo-router";
import { api } from "@/lib/api-client";
import { API_RECURRING_BOOKINGS, apiRecurringBookingPath } from "@/lib/customer-api-paths";
import { useResponsive } from "@/hooks/useResponsive";
import { Colors } from "@/constants/colors";
import { STACK_CONTENT_PADDING_BOTTOM } from "@/constants/layout";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";
import { getTenantLocaleTag } from "@/lib/locale";
import { verticalFlatListPerf } from "@/lib/flatListPerformance";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type SimpleFrequency = "weekly" | "biweekly" | "monthly";

interface RecurringBooking {
  id: string;
  service_name: string;
  provider_name: string;
  provider_slug?: string | null;
  frequency: string;
  next_date: string;
  price: number;
  currency: string;
  status: "active" | "paused" | "cancelled";
  preferred_time: string;
  end_date: string | null;
  recurrence_rule: string | null;
  simple_frequency: SimpleFrequency;
  location_type?: string;
  /** From series row: how each auto-booked visit is expected to be paid (cron does not charge). */
  payment_method?: string | null;
  /** Last calendar day an occurrence was materialized by the daily job. */
  last_booking_date?: string | null;
}

interface RecurringBookingsResponse {
  recurring: RecurringBooking[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function preferredTimeToInputValue(preferred: string | null | undefined): string {
  const t = (preferred || "").trim();
  if (/^\d{2}:\d{2}:\d{2}/.test(t)) return t.slice(0, 5);
  if (/^\d{2}:\d{2}$/.test(t)) return t;
  return "10:00";
}

function normalizeFrequency(
  f: string | null | undefined,
  recurrenceRule?: string | null
): SimpleFrequency {
  const v = (f || "").toLowerCase();
  if (v === "weekly" || v === "biweekly" || v === "monthly") return v;
  const rr = (recurrenceRule || "").toUpperCase();
  if (rr.includes("FREQ=WEEKLY") && rr.includes("INTERVAL=2")) return "biweekly";
  if (rr.includes("FREQ=WEEKLY")) return "weekly";
  if (rr.includes("FREQ=MONTHLY")) return "monthly";
  return "weekly";
}

function parseValidDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

/** Translation helper for `customer.mobile.screens.recurringBookings.*` */
type Rb = (key: string, options?: Record<string, string | number>) => string;

function formatDate(iso: string, rb: Rb): string {
  if (!iso) return rb("dash");
  const parsed = parseValidDate(iso);
  if (!parsed) return rb("dash");
  return parsed.toLocaleDateString(getTenantLocaleTag(), {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function statusStyle(status: RecurringBooking["status"]): { bg: string; text: string } {
  switch (status) {
    case "active":
      return { bg: "#DCFCE7", text: "#166534" };
    case "paused":
      return { bg: "#FEF9C3", text: "#854D0E" };
    case "cancelled":
      return { bg: "#FEE2E2", text: "#991B1B" };
    default:
      return { bg: Colors.gray[100], text: Colors.gray[800] };
  }
}

function formatFrequencyLabel(raw: string | undefined, rb: Rb): string {
  const f = (raw ?? "weekly").toLowerCase();
  if (f === "biweekly") return rb("freqEvery2Weeks");
  if (f === "monthly") return rb("freqMonthly");
  if (f === "weekly") return rb("freqWeekly");
  return raw ?? rb("freqRecurring");
}

function humanizeRecurrenceRule(rule: string, rb: Rb): string {
  if (!rule) return rb("freqRecurring");
  const r = rule.toUpperCase();
  if (r.startsWith("FREQ=")) {
    const match = r.match(/FREQ=(\w+)/);
    const interval = r.match(/INTERVAL=(\d+)/);
    const freq = match?.[1];
    const n = interval ? parseInt(interval[1]!, 10) : 1;
    if (freq === "DAILY") return n === 1 ? rb("everyDay") : rb("everyNDays", { n: String(n) });
    if (freq === "WEEKLY") return n === 1 ? rb("everyWeek") : rb("everyNWeeks", { n: String(n) });
    if (freq === "BIWEEKLY") return rb("every2WeeksRrule");
    if (freq === "MONTHLY") return n === 1 ? rb("everyMonth") : rb("everyNMonths", { n: String(n) });
    if (freq === "YEARLY") return rb("everyYear");
    return rule;
  }
  const simple: Record<string, string> = {
    DAILY: rb("everyDay"),
    WEEKLY: rb("everyWeek"),
    BIWEEKLY: rb("every2WeeksRrule"),
    MONTHLY: rb("everyMonth"),
    YEARLY: rb("everyYear"),
    "2WEEKLY": rb("every2WeeksRrule"),
    "4WEEKLY": rb("everyNWeeks", { n: "4" }),
  };
  return simple[r] ?? rule;
}

function scheduleLabelFromRow(row: { frequency?: string | null; recurrence_rule?: string | null }, rb: Rb): string {
  if (row.frequency && String(row.frequency).trim()) {
    return formatFrequencyLabel(String(row.frequency), rb);
  }
  if (row.recurrence_rule && String(row.recurrence_rule).trim()) {
    return humanizeRecurrenceRule(String(row.recurrence_rule), rb);
  }
  return rb("freqRecurring");
}

function normalizeRecurringItem(row: any, rb: Rb): RecurringBooking {
  const provider = row.provider;
  const providerName = row.provider_name ?? provider?.business_name ?? rb("providerFallback");
  const providerSlug = provider?.slug ?? null;
  const serviceName = row.service_name ?? rb("serviceFallback");
  const nextDate =
    typeof row.next_date === "string" && row.next_date
      ? row.next_date
      : typeof row.start_date === "string" && row.start_date
        ? row.start_date
        : "";
  let status: RecurringBooking["status"] = "active";
  if (row.status === "cancelled" || row.status === "paused" || row.status === "active") {
    status = row.status;
  } else if (row.is_active === false) {
    status = "paused";
  }
  const price = typeof row.price === "number" ? row.price : 0;
  const currency = row.currency ?? getTenantDefaultCurrency();
  const endDate = row.end_date != null ? String(row.end_date).slice(0, 10) : null;
  const recurrenceRule = row.recurrence_rule != null ? String(row.recurrence_rule) : null;
  const simple = normalizeFrequency(row.frequency, recurrenceRule);
  const preferred =
    typeof row.preferred_time === "string" && row.preferred_time.trim()
      ? row.preferred_time
      : typeof row.start_time === "string" && row.start_time.trim()
        ? row.start_time
        : "10:00:00";

  const lastBooking =
    typeof row.last_booking_date === "string" && row.last_booking_date.trim()
      ? String(row.last_booking_date).slice(0, 10)
      : null;
  const payment_method =
    typeof row.payment_method === "string" && row.payment_method.trim() ? row.payment_method.trim() : null;

  return {
    id: row.id,
    service_name: serviceName,
    provider_name: providerName,
    provider_slug: providerSlug,
    frequency: scheduleLabelFromRow(row, rb),
    next_date: nextDate,
    price,
    currency,
    status,
    preferred_time: preferred,
    end_date: endDate,
    recurrence_rule: recurrenceRule,
    simple_frequency: simple,
    location_type: row.location_type,
    payment_method,
    last_booking_date: lastBooking,
  };
}

function paymentMethodLabel(method: string | null | undefined, rb: Rb): string {
  const m = (method || "").toLowerCase();
  if (m === "cash") return rb("payCash");
  if (m === "card") return rb("payCard");
  return rb("payDefault");
}

function locationLabel(locationType: string | undefined, rb: Rb): string {
  const loc = (locationType || "").toLowerCase();
  if (loc === "at_home") return rb("locAtHome");
  if (loc === "at_salon") return rb("locAtSalon");
  return rb("dash");
}

function statusLabel(status: RecurringBooking["status"], rb: Rb): string {
  switch (status) {
    case "active":
      return rb("statusActive");
    case "paused":
      return rb("statusPaused");
    case "cancelled":
      return rb("statusCancelled");
    default:
      return status;
  }
}

const detailLabelStyle = { fontSize: 12, fontWeight: "600" as const, color: Colors.gray[500], marginBottom: 4 };
const detailValueStyle = { fontSize: 15, color: Colors.gray[900], lineHeight: 22 as const };

/* ------------------------------------------------------------------ */
/*  Screen                                                             */
/* ------------------------------------------------------------------ */

export default function RecurringBookingsScreen() {
  const { t } = useTranslation();
  const rb = useCallback(
    (key: string, options?: Record<string, string | number>) => {
      const fullKey = `customer.mobile.screens.recurringBookings.${key}`;
      return (options != null ? t(fullKey, options as never) : t(fullKey)) as string;
    },
    [t],
  );
  const errTitle = t("customer.mobile.screens.authLogin.errorTitle");
  const { contentPadding, contentMaxWidth, isTablet } = useResponsive();
  const constraint =
    isTablet || Platform.OS === "web"
      ? { maxWidth: contentMaxWidth, alignSelf: "center" as const, width: "100%" as const }
      : {};
  const [bookings, setBookings] = useState<RecurringBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringBooking | null>(null);
  const [editPreferredTime, setEditPreferredTime] = useState("10:00");
  const [editFrequency, setEditFrequency] = useState<SimpleFrequency>("weekly");
  const [editEndDate, setEditEndDate] = useState("");
  const [editSeriesNoEnd, setEditSeriesNoEnd] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [detailItem, setDetailItem] = useState<RecurringBooking | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await api.get<RecurringBookingsResponse>(API_RECURRING_BOOKINGS, {
        cache: "no-store",
      });
      if (res.error) {
        setError(res.error.message || rb("loadFailed"));
      } else {
        const data = res.data;
        const raw = Array.isArray(data) ? (data as unknown as any[]) : data?.recurring ?? [];
        const items = (Array.isArray(raw) ? raw : []).map((row) => normalizeRecurringItem(row, rb));
        setBookings(items);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : rb("loadFailed"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [rb]);

  useEffect(() => {
    load();
  }, [load]);

  const openEdit = useCallback((booking: RecurringBooking) => {
    setEditing(booking);
    setEditPreferredTime(preferredTimeToInputValue(booking.preferred_time));
    setEditFrequency(booking.simple_frequency);
    const end = booking.end_date?.slice(0, 10) ?? "";
    setEditEndDate(end);
    setEditSeriesNoEnd(!booking.end_date);
    setEditOpen(true);
  }, []);

  const saveSchedule = useCallback(async () => {
    if (!editing) return;
    if (!editSeriesNoEnd && !editEndDate.trim()) {
      Alert.alert(rb("endDateTitle"), rb("endDateBody"));
      return;
    }
    setSavingSchedule(true);
    try {
      const payload: Record<string, unknown> = {
        preferred_time: editPreferredTime,
        frequency: editFrequency,
      };
      if (editSeriesNoEnd) {
        payload.end_date = null;
      } else if (editEndDate.trim()) {
        payload.end_date = editEndDate.trim();
      }
      const res = await api.patch(apiRecurringBookingPath(editing.id), payload);
      if (res.error) {
        Alert.alert(errTitle, res.error.message || rb("updateScheduleError"));
      } else {
        setEditOpen(false);
        setEditing(null);
        await load(true);
      }
    } catch {
      Alert.alert(errTitle, rb("updateScheduleError"));
    } finally {
      setSavingSchedule(false);
    }
  }, [editing, editPreferredTime, editFrequency, editEndDate, editSeriesNoEnd, load, errTitle, rb]);

  const togglePauseResume = useCallback(async (booking: RecurringBooking) => {
    if (booking.status === "cancelled") return;
    setTogglingId(booking.id);
    try {
      const res = await api.patch(apiRecurringBookingPath(booking.id), {
        is_active: booking.status === "paused",
      });
      if (res.error) {
        Alert.alert(errTitle, res.error.message || rb("updateFailed"));
      } else {
        await load(true);
      }
    } catch {
      Alert.alert(errTitle, rb("updateRetry"));
    } finally {
      setTogglingId(null);
    }
  }, [load, errTitle, rb]);

  const cancelBooking = useCallback(
    (booking: RecurringBooking) => {
      Alert.alert(
        rb("cancelRecurringTitle"),
        rb("cancelRecurringBody", { serviceName: booking.service_name, providerName: booking.provider_name }),
        [
          { text: rb("keepCta"), style: "cancel" },
          {
            text: rb("endSeriesCta"),
            style: "destructive",
            onPress: async () => {
              setCancellingId(booking.id);
              try {
                const res = await api.delete(apiRecurringBookingPath(booking.id));
                if (res.error) {
                  Alert.alert(errTitle, res.error.message || rb("cancelBookingError"));
                } else {
                  setDetailItem((d) => (d?.id === booking.id ? null : d));
                  await load(true);
                }
              } catch {
                Alert.alert(errTitle, rb("cancelBookingRetry"));
              } finally {
                setCancellingId(null);
              }
            },
          },
        ],
      );
    },
    [load, rb, errTitle],
  );

  const renderItem = useCallback(
    ({ item }: { item: RecurringBooking }) => {
      const badge = statusStyle(item.status);
      const isCancelling = cancellingId === item.id;
      const isToggling = togglingId === item.id;
      const canPauseResume = item.status === "active" || item.status === "paused";
      const canEditSchedule = item.status !== "cancelled";

      return (
        <View
          style={{
            backgroundColor: Colors.white,
            borderRadius: 12,
            marginBottom: 12,
            borderWidth: 1,
            borderColor: Colors.gray[100],
            overflow: "hidden",
          }}
        >
          <TouchableOpacity
            onPress={() => setDetailItem(item)}
            activeOpacity={0.92}
            accessibilityRole="button"
            accessibilityLabel={rb("detailsA11y", { name: item.service_name })}
            style={{ padding: 16, paddingBottom: 12 }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={{ fontWeight: "600", color: Colors.gray[900] }}>{item.service_name}</Text>
                <Text style={{ fontSize: 12, color: Colors.primary, fontWeight: "600", marginTop: 4 }}>{rb("tapForDetails")}</Text>
              </View>
              <View style={{ paddingHorizontal: 10, paddingVertical: 2, borderRadius: 9999, backgroundColor: badge.bg }}>
                <Text style={{ fontSize: 12, fontWeight: "500", color: badge.text }}>{statusLabel(item.status, rb)}</Text>
              </View>
            </View>
            <Text style={{ fontSize: 14, color: Colors.gray[600], marginBottom: 4 }}>{item.provider_name}</Text>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
              <View>
                <Text style={{ fontSize: 12, color: Colors.gray[500] }}>{rb("labelFrequency")}</Text>
                <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[800] }}>{item.frequency}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ fontSize: 12, color: Colors.gray[500] }}>{rb("labelNextAppointment")}</Text>
                <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[800] }}>{formatDate(item.next_date, rb)}</Text>
              </View>
            </View>
            <Text style={{ fontSize: 12, color: Colors.gray[500], marginTop: 8 }}>
              {rb("preferredTimeLine", { time: preferredTimeToInputValue(item.preferred_time) })}
            </Text>
            <Text style={{ fontSize: 12, color: Colors.gray[600], marginTop: 4 }}>
              {item.end_date ? rb("endsOn", { date: formatDate(item.end_date, rb) }) : rb("noEndDateRuns")}
            </Text>
          </TouchableOpacity>
          {item.provider_slug ? (
            <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
              <TouchableOpacity
                onPress={() =>
                  router.push({ pathname: "/(app)/partner-profile", params: { slug: item.provider_slug! } })
                }
              >
                <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.primary }}>{rb("viewSalon")}</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              paddingHorizontal: 16,
              paddingTop: 12,
              paddingBottom: 16,
              borderTopWidth: 1,
              borderTopColor: Colors.gray[100],
            }}
          >
            <Text style={{ fontWeight: "600", color: Colors.gray[900] }}>
              {item.currency} {item.price != null && item.price > 0 ? item.price.toFixed(2) : "—"}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              {canEditSchedule && (
                <TouchableOpacity
                  onPress={() => openEdit(item)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: Colors.primary,
                    backgroundColor: "#EFF6FF",
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: "600", color: Colors.primary }}>{rb("editSchedule")}</Text>
                </TouchableOpacity>
              )}
              {canPauseResume && (
                <TouchableOpacity
                  onPress={() => togglePauseResume(item)}
                  disabled={isToggling}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: Colors.gray[300],
                    backgroundColor: Colors.gray[50],
                  }}
                >
                  {isToggling ? (
                    <ActivityIndicator size="small" color={Colors.gray[600]} />
                  ) : (
                    <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>
                      {item.status === "paused" ? rb("resume") : rb("pause")}
                    </Text>
                  )}
                </TouchableOpacity>
              )}
              {item.status !== "cancelled" && (
                <TouchableOpacity
                  onPress={() => cancelBooking(item)}
                  disabled={isCancelling}
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: "#FECACA",
                    backgroundColor: "#FEF2F2",
                  }}
                >
                  {isCancelling ? (
                    <ActivityIndicator size="small" color={Colors.error} />
                  ) : (
                    <Text style={{ fontSize: 14, fontWeight: "500", color: "#DC2626" }}>{t("common.cancel")}</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      );
    },
    [cancellingId, togglingId, cancelBooking, togglePauseResume, openEdit, rb, t]
  );

  if (loading && bookings.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.white, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={{ color: Colors.gray[600], marginTop: 16 }}>{t("common.loading")}</Text>
      </View>
    );
  }

  if (error && bookings.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.white, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Text style={{ textAlign: "center", color: Colors.gray[700], marginBottom: 16 }}>{error}</Text>
        <TouchableOpacity onPress={() => load()} style={{ backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}>
          <Text style={{ color: Colors.white, fontWeight: "600" }}>{t("common.retry")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (bookings.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.white, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Text style={{ textAlign: "center", fontWeight: "600", color: Colors.gray[900], marginBottom: 8 }}>{rb("emptyTitle")}</Text>
        <Text style={{ textAlign: "center", color: Colors.gray[500], paddingHorizontal: 8 }}>{rb("emptyBody")}</Text>
        <Text style={{ textAlign: "center", color: Colors.gray[500], paddingHorizontal: 16, marginTop: 14, fontSize: 13, lineHeight: 18 }}>{rb("emptyNote")}</Text>
        <TouchableOpacity
          onPress={() => router.push("/(app)/(tabs)/search")}
          style={{ marginTop: 20, backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}
        >
          <Text style={{ color: Colors.white, fontWeight: "600" }}>{rb("findSalonCta")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.white }}>
      <FlatList
        {...verticalFlatListPerf}
        data={bookings}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={
          <View
            style={{
              backgroundColor: "#F0F9FF",
              borderWidth: 1,
              borderColor: "#BAE6FD",
              borderRadius: 12,
              padding: 14,
              marginBottom: 16,
            }}
          >
            <Text style={{ fontSize: 13, color: Colors.gray[700], lineHeight: 19 }}>{rb("listHeaderExplainer")}</Text>
          </View>
        }
        contentContainerStyle={{
          padding: contentPadding,
          paddingBottom: STACK_CONTENT_PADDING_BOTTOM,
          ...constraint,
        }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={Colors.primary} colors={[Colors.primary]} />}
        showsVerticalScrollIndicator={false}
      />

      <Modal visible={!!detailItem} animationType="fade" transparent onRequestClose={() => setDetailItem(null)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 20 }} onPress={() => setDetailItem(null)}>
          <View style={{ backgroundColor: Colors.white, borderRadius: 16, maxHeight: "88%", overflow: "hidden" }}>
            <ScrollView contentContainerStyle={{ padding: 20 }} showsVerticalScrollIndicator={false}>
              {detailItem ? (
                <>
                  <Text style={{ fontSize: 18, fontWeight: "700", color: Colors.gray[900], marginBottom: 4 }}>{detailItem.service_name}</Text>
                  <Text style={{ fontSize: 15, color: Colors.gray[600], marginBottom: 16 }}>{detailItem.provider_name}</Text>

                  <View style={{ marginBottom: 14 }}>
                    <Text style={detailLabelStyle}>{rb("detailStatus")}</Text>
                    <Text style={detailValueStyle}>{statusLabel(detailItem.status, rb)}</Text>
                  </View>
                  <View style={{ marginBottom: 14 }}>
                    <Text style={detailLabelStyle}>{rb("detailSchedule")}</Text>
                    <Text style={detailValueStyle}>{detailItem.frequency}</Text>
                    <Text style={[detailValueStyle, { marginTop: 4, fontSize: 13, color: Colors.gray[500] }]}>
                      {rb("detailScheduleLine", {
                        time: preferredTimeToInputValue(detailItem.preferred_time),
                        next: formatDate(detailItem.next_date, rb),
                      })}
                    </Text>
                  </View>
                  <View style={{ marginBottom: 14 }}>
                    <Text style={detailLabelStyle}>{rb("detailSeriesEnd")}</Text>
                    <Text style={detailValueStyle}>
                      {detailItem.end_date ? formatDate(detailItem.end_date, rb) : rb("detailOpenEnded")}
                    </Text>
                  </View>
                  <View style={{ marginBottom: 14 }}>
                    <Text style={detailLabelStyle}>{rb("detailLastVisit")}</Text>
                    <Text style={detailValueStyle}>
                      {detailItem.last_booking_date ? formatDate(detailItem.last_booking_date, rb) : rb("detailLastVisitNone")}
                    </Text>
                  </View>
                  <View style={{ marginBottom: 14 }}>
                    <Text style={detailLabelStyle}>{rb("detailLocation")}</Text>
                    <Text style={detailValueStyle}>{locationLabel(detailItem.location_type, rb)}</Text>
                  </View>
                  <View style={{ marginBottom: 14 }}>
                    <Text style={detailLabelStyle}>{rb("detailTypicalPrice")}</Text>
                    <Text style={detailValueStyle}>
                      {detailItem.currency}{" "}
                      {detailItem.price != null && detailItem.price > 0 ? detailItem.price.toFixed(2) : rb("dash")}
                    </Text>
                  </View>
                  <View style={{ marginBottom: 16 }}>
                    <Text style={detailLabelStyle}>{rb("detailPayments")}</Text>
                    <Text style={detailValueStyle}>{paymentMethodLabel(detailItem.payment_method, rb)}</Text>
                    <Text style={[detailValueStyle, { marginTop: 8, fontSize: 13, color: Colors.gray[600], lineHeight: 19 }]}>
                      {rb("detailPaymentsNote")}
                    </Text>
                  </View>
                  <View style={{ marginBottom: 20, backgroundColor: "#F0F9FF", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#BAE6FD" }}>
                    <Text style={{ fontSize: 13, fontWeight: "600", color: Colors.gray[800], marginBottom: 6 }}>{rb("detailCalendarTitle")}</Text>
                    <Text style={{ fontSize: 13, color: Colors.gray[700], lineHeight: 19 }}>{rb("detailCalendarBody")}</Text>
                  </View>
                </>
              ) : null}
            </ScrollView>
            <View style={{ paddingHorizontal: 16, paddingBottom: 20, borderTopWidth: 1, borderTopColor: Colors.gray[100] }}>
              <TouchableOpacity
                onPress={() => setDetailItem(null)}
                style={{ backgroundColor: Colors.primary, paddingVertical: 14, borderRadius: 12, alignItems: "center" }}
              >
                <Text style={{ color: "#fff", fontWeight: "700" }}>{rb("closeCta")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={editOpen} animationType="slide" transparent onRequestClose={() => !savingSchedule && setEditOpen(false)}>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
          <Pressable
            style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" }}
            onPress={() => !savingSchedule && setEditOpen(false)}
          >
            <Pressable
              onPress={(e) => e.stopPropagation()}
              style={{
                backgroundColor: Colors.white,
                borderTopLeftRadius: 16,
                borderTopRightRadius: 16,
                padding: 20,
                paddingBottom: 32,
              }}
            >
              <Text style={{ fontSize: 18, fontWeight: "700", color: Colors.gray[900], marginBottom: 8 }}>{rb("editModalTitle")}</Text>
              <Text style={{ fontSize: 13, color: Colors.gray[600], marginBottom: 16 }}>{rb("editModalSubtitle")}</Text>

              <Text style={{ fontSize: 12, fontWeight: "600", color: Colors.gray[500], marginBottom: 6 }}>{rb("labelFrequencyPick")}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
                {(["weekly", "biweekly", "monthly"] as const).map((f) => (
                  <TouchableOpacity
                    key={f}
                    onPress={() => setEditFrequency(f)}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      borderRadius: 10,
                      borderWidth: 1.5,
                      borderColor: editFrequency === f ? Colors.primary : Colors.gray[200],
                      backgroundColor: editFrequency === f ? "#EFF6FF" : Colors.white,
                    }}
                  >
                    <Text style={{ fontWeight: "600", color: editFrequency === f ? Colors.primary : Colors.gray[700], fontSize: 13 }}>
                      {f === "weekly" ? rb("chipWeekly") : f === "biweekly" ? rb("chipBiweekly") : rb("chipMonthly")}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={{ fontSize: 12, fontWeight: "600", color: Colors.gray[500], marginBottom: 6 }}>{rb("labelPreferredTime")}</Text>
              <TextInput
                value={editPreferredTime}
                onChangeText={setEditPreferredTime}
                placeholder={rb("timePlaceholder")}
                keyboardType="numbers-and-punctuation"
                style={{
                  borderWidth: 1,
                  borderColor: Colors.gray[200],
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  fontSize: 16,
                  marginBottom: 16,
                }}
              />

              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900] }}>{rb("noEndDateToggle")}</Text>
                  <Text style={{ fontSize: 12, color: Colors.gray[500], marginTop: 2 }}>{rb("noEndDateHint")}</Text>
                </View>
                <Switch
                  value={editSeriesNoEnd}
                  onValueChange={(on) => {
                    setEditSeriesNoEnd(on);
                    if (on) setEditEndDate("");
                  }}
                  trackColor={{ false: Colors.gray[200], true: "#93C5FD" }}
                  thumbColor={editSeriesNoEnd ? Colors.primary : "#f4f4f5"}
                />
              </View>

              {!editSeriesNoEnd && (
                <>
                  <Text style={{ fontSize: 12, fontWeight: "600", color: Colors.gray[500], marginBottom: 6 }}>{rb("endDateInputLabel")}</Text>
                  <TextInput
                    value={editEndDate}
                    onChangeText={setEditEndDate}
                    placeholder={rb("datePlaceholder")}
                    style={{
                      borderWidth: 1,
                      borderColor: Colors.gray[200],
                      borderRadius: 12,
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      fontSize: 16,
                      marginBottom: 20,
                    }}
                  />
                </>
              )}

              <View style={{ flexDirection: "row", gap: 12 }}>
                <TouchableOpacity
                  onPress={() => !savingSchedule && setEditOpen(false)}
                  style={{
                    flex: 1,
                    paddingVertical: 14,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: Colors.gray[300],
                    alignItems: "center",
                  }}
                >
                  <Text style={{ fontWeight: "600", color: Colors.gray[700] }}>{rb("closeCta")}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={saveSchedule}
                  disabled={savingSchedule}
                  style={{
                    flex: 1,
                    paddingVertical: 14,
                    borderRadius: 12,
                    backgroundColor: Colors.primary,
                    alignItems: "center",
                    opacity: savingSchedule ? 0.7 : 1,
                  }}
                >
                  {savingSchedule ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={{ fontWeight: "700", color: "#fff" }}>{rb("saveCta")}</Text>
                  )}
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
