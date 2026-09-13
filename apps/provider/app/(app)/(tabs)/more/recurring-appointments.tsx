import { useCallback, useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Alert,
  TextInput,
  Switch,
} from "react-native";
import type { Router } from "expo-router";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApiMutation } from "@/hooks/useApi";
import { fetchAllRecurringAppointmentPages } from "@/lib/fetch-paged-recurring-appointments";
import { useProvider } from "@/providers/ProviderContext";
import { useResponsive } from "@/hooks/useResponsive";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { FilterChipGroup } from "@/components/ui/FilterChip";
import { Colors } from "@/constants/colors";
import { isPlanGateErrorCode, showPlanGateAlert } from "@/lib/plan-gate";
import { useTranslation } from "@beautonomi/i18n";
import { DirectionalIcon } from "@/components/ui/DirectionalIcon";

type TranslateFn = (key: string, opts?: Record<string, unknown>) => string;

function alertApiError(title: string, message: string, errorCode: string | null, router: Router | null) {
  if (isPlanGateErrorCode(errorCode)) {
    showPlanGateAlert({ title, message, errorCode, router: router ?? undefined });
    return;
  }
  Alert.alert(title, message);
}

interface RecurringAppointment {
  id: string;
  provider_id: string;
  customer_id: string;
  service_id: string | null;
  staff_id: string | null;
  recurrence_rule: string;
  start_date: string;
  end_date: string | null;
  start_time: string;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  /** Customer-app series: weekly | biweekly | monthly (cron also reads this). */
  frequency?: string | null;
  last_booking_date?: string | null;
  preferred_time?: string | null;
  location_type?: string | null;
  payment_method?: string | null;
  metadata?: { services?: unknown[]; address?: unknown } | null;
  customer?: { full_name?: string | null };
  service?: { title?: string | null };
  offering?: { title?: string | null };
  staff?: { name?: string | null };
}

interface RecurringListResponse {
  data: RecurringAppointment[];
  total: number;
  page: number;
  total_pages: number;
}

/** Convert an RRULE or shorthand string into a human-readable label. */
function humanizeRule(rule: string, tr: TranslateFn): string {
  if (!rule) return rule;
  const r = rule.toUpperCase();
  if (r.startsWith("FREQ=")) {
    const match = r.match(/FREQ=(\w+)/);
    const interval = r.match(/INTERVAL=(\d+)/);
    const freq = match?.[1];
    const n = interval ? parseInt(interval[1], 10) : 1;
    const freqMap: Record<string, string> = {
      DAILY: tr("freqDaily", { count: n }),
      WEEKLY: tr("freqWeeklyLong", { count: n }),
      BIWEEKLY: tr("freqBiweekly"),
      MONTHLY: tr("freqMonthlyLong", { count: n }),
      YEARLY: tr("freqYearly"),
    };
    return freqMap[freq ?? ""] ?? rule;
  }
  const simple: Record<string, string> = {
    DAILY: tr("freqDaily", { count: 1 }),
    WEEKLY: tr("freqWeeklyLong", { count: 1 }),
    BIWEEKLY: tr("freqBiweekly"),
    MONTHLY: tr("freqMonthlyLong", { count: 1 }),
    YEARLY: tr("freqYearly"),
    "2WEEKLY": tr("freqBiweekly"),
    "4WEEKLY": tr("freqEvery4Weeks"),
  };
  return simple[r] ?? rule;
}

function humanizeSimpleFrequency(f: string | null | undefined, tr: TranslateFn): string | null {
  if (!f?.trim()) return null;
  const x = f.toLowerCase();
  if (x === "weekly") return tr("freqWeeklyLong", { count: 1 });
  if (x === "biweekly") return tr("freqBiweekly");
  if (x === "monthly") return tr("freqMonthlyLong", { count: 1 });
  return f;
}

/** RRULE from portal; otherwise customer `frequency` field. */
function displaySchedule(item: RecurringAppointment, tr: TranslateFn): string {
  if (item.recurrence_rule?.trim()) {
    return humanizeRule(item.recurrence_rule, tr);
  }
  return humanizeSimpleFrequency(item.frequency ?? null, tr) ?? tr("recurringFallback");
}

function formatTimeSlot(item: RecurringAppointment): string {
  const raw = item.start_time || item.preferred_time;
  if (!raw || typeof raw !== "string") return "—";
  return raw.length >= 5 ? raw.slice(0, 5) : raw;
}

function formatShortDate(dateStr: string): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function serviceTitle(item: RecurringAppointment): string | null {
  return item.service?.title ?? item.offering?.title ?? null;
}

type SimpleSeriesFreq = "weekly" | "biweekly" | "monthly";

function rruleFromSimple(f: SimpleSeriesFreq): string {
  if (f === "weekly") return "FREQ=WEEKLY;INTERVAL=1";
  if (f === "biweekly") return "FREQ=WEEKLY;INTERVAL=2";
  return "FREQ=MONTHLY;INTERVAL=1";
}

function simpleFreqFromItem(item: RecurringAppointment): SimpleSeriesFreq {
  const fr = (item.frequency || "").toLowerCase();
  if (fr === "weekly" || fr === "biweekly" || fr === "monthly") return fr;
  const rr = (item.recurrence_rule || "").toUpperCase();
  if (rr.includes("FREQ=WEEKLY") && rr.includes("INTERVAL=2")) return "biweekly";
  if (rr.includes("FREQ=WEEKLY")) return "weekly";
  if (rr.includes("FREQ=MONTHLY")) return "monthly";
  return "weekly";
}

function timeToHhMm(raw: string | null | undefined): string {
  const t = (raw || "").trim();
  if (/^\d{2}:\d{2}:\d{2}/.test(t)) return t.slice(0, 5);
  if (/^\d{2}:\d{2}$/.test(t)) return t;
  return "10:00";
}

function timeToHhMmSs(hhmm: string): string {
  const t = hhmm.trim();
  if (/^\d{2}:\d{2}:\d{2}$/.test(t)) return t;
  if (/^\d{2}:\d{2}$/.test(t)) return `${t}:00`;
  return "10:00:00";
}

export default function RecurringAppointmentsScreen() {
  const { t } = useTranslation();
  const ra = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(`provider.mobile.screens.recurringAppointments.${key}`, opts) as string,
    [t],
  );
  const router = useRouter();
  const params = useLocalSearchParams<{ series_id?: string }>();
  const { selectedLocationId } = useProvider();
  const { screenPadding } = useResponsive();
  const [refreshing, setRefreshing] = useState(false);
  const [viewItem, setViewItem] = useState<RecurringAppointment | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "paused">("all");
  const [editFreq, setEditFreq] = useState<SimpleSeriesFreq>("weekly");
  const [editTime, setEditTime] = useState("10:00");
  const [editEnd, setEditEnd] = useState("");
  const [editNoEnd, setEditNoEnd] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  const [data, setData] = useState<RecurringListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const loadRecurringList = useCallback(async () => {
    setLoading(true);
    setError(null);
    setErrorCode(null);
    const res = await fetchAllRecurringAppointmentPages<RecurringAppointment>(
      selectedLocationId ?? null,
    );
    if (!res.ok) {
      setData(null);
      setError(res.message);
      setErrorCode(res.code);
    } else {
      setData({
        data: res.rows,
        total: res.total,
        page: 1,
        total_pages: 1,
      });
    }
    setLoading(false);
  }, [selectedLocationId]);

  useEffect(() => {
    void loadRecurringList();
  }, [loadRecurringList]);

  const refresh = useCallback(() => loadRecurringList(), [loadRecurringList]);
  const mutate = useCallback((newData: RecurringListResponse) => setData(newData), []);

  const { execute: patchRecurring, loading: patching } = useApiMutation<RecurringAppointment>("patch");
  const { execute: deleteRecurring } = useApiMutation<{ deleted: boolean; deleted_series?: boolean }>("delete");

  const mutateRecurringItems = useCallback(
    (updater: (items: RecurringAppointment[]) => RecurringAppointment[]) => {
      if (!data) return;
      const nextItems = updater(data.data ?? []);
      mutate({
        ...data,
        data: nextItems,
        total: nextItems.length,
      });
    },
    [data, mutate],
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const allItems = data?.data ?? [];
  const total = data?.total ?? allItems.length;
  const list = allItems.filter((item) => {
    if (statusFilter === "active") return item.is_active;
    if (statusFilter === "paused") return !item.is_active;
    return true;
  });

  const openView = useCallback((item: RecurringAppointment) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setViewItem(item);
  }, []);

  useEffect(() => {
    const seriesId = typeof params.series_id === "string" ? params.series_id : "";
    if (!seriesId || !data?.data?.length || viewItem?.id === seriesId) return;
    const match = data.data.find((item) => item.id === seriesId);
    if (match) setViewItem(match);
  }, [data?.data, params.series_id, viewItem?.id]);

  useEffect(() => {
    if (!viewItem) return;
    setEditFreq(simpleFreqFromItem(viewItem));
    setEditTime(timeToHhMm(viewItem.start_time || viewItem.preferred_time));
    const end = viewItem.end_date ? String(viewItem.end_date).slice(0, 10) : "";
    setEditEnd(end);
    setEditNoEnd(!viewItem.end_date);
  }, [viewItem]);

  const saveScheduleEdits = useCallback(async () => {
    if (!viewItem) return;
    // §Provider-audit 2026-04 (round 7): previously the edit sheet passed
    // whatever the user typed straight to the server. The PATCH route only
    // validates shape (HH:MM:SS and a date-parseable end_date), so "99:99"
    // silently became the stored preferred_time and a malformed end date
    // returned an opaque 400. Validate on the client so the error message
    // points at the exact field.
    const hhmm = editTime.trim();
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hhmm)) {
      Alert.alert(ra("invalidTimeTitle"), ra("invalidTimeBody"));
      return;
    }
    if (!editNoEnd) {
      const endTrim = editEnd.trim();
      if (!endTrim) {
        Alert.alert(ra("endDateTitle"), ra("endDateOrNoEnd"));
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(endTrim)) {
        Alert.alert(ra("invalidEndDateTitle"), ra("invalidEndDateFormat"));
        return;
      }
      const parsed = new Date(`${endTrim}T00:00:00Z`);
      if (!Number.isFinite(parsed.getTime())) {
        Alert.alert(ra("invalidEndDateTitle"), ra("invalidEndDateValue"));
        return;
      }
      // end must not be before start_date
      const startStr = String(viewItem.start_date || "").slice(0, 10);
      if (startStr && endTrim < startStr) {
        Alert.alert(ra("endBeforeStartTitle"), ra("endBeforeStartBody"));
        return;
      }
    }
    setSavingEdit(true);
    const body: Record<string, unknown> = {
      recurrence_rule: rruleFromSimple(editFreq),
      frequency: editFreq,
      preferred_time: editTime,
      start_time: timeToHhMmSs(editTime),
    };
    if (editNoEnd) body.end_date = null;
    else body.end_date = editEnd.trim();
    const { data: updated, error: err, errorCode: patchCode } = await patchRecurring(
      `/api/provider/recurring-appointments/${viewItem.id}`,
      body
    );
    setSavingEdit(false);
    if (err) {
      alertApiError(ra("saveFailedTitle"), err, patchCode, router);
    } else {
      const nextItem: RecurringAppointment = {
        ...viewItem,
        ...(updated ?? {}),
        recurrence_rule: String(body.recurrence_rule ?? updated?.recurrence_rule ?? viewItem.recurrence_rule ?? ""),
        frequency: editFreq,
        preferred_time: editTime,
        start_time: timeToHhMmSs(editTime),
        end_date: editNoEnd ? null : editEnd.trim(),
      };
      mutateRecurringItems((items) =>
        items.map((item) => (item.id === viewItem.id ? nextItem : item))
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setViewItem(null);
      void refresh();
    }
  }, [viewItem, editFreq, editTime, editEnd, editNoEnd, patchRecurring, mutateRecurringItems, refresh, router, ra]);

  const handleToggleActive = useCallback(
    async (item: RecurringAppointment) => {
      const newActive = !item.is_active;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const { data: updated, error: err, errorCode: patchCode } = await patchRecurring(
        `/api/provider/recurring-appointments/${item.id}`,
        { is_active: newActive }
      );
      if (err) {
        alertApiError(ra("updateFailedTitle"), err, patchCode, router);
      } else {
        const nextItem = {
          ...item,
          ...(updated ?? {}),
          is_active: newActive,
        };
        mutateRecurringItems((items) =>
          items.map((current) => (current.id === item.id ? nextItem : current))
        );
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setViewItem(null);
        void refresh();
      }
    },
    [patchRecurring, mutateRecurringItems, refresh, router, ra]
  );

  const handleDelete = useCallback(
    (item: RecurringAppointment) => {
      Alert.alert(
        ra("deleteTitle"),
        ra("deleteBody", { name: item.customer?.full_name ?? ra("thisClient") }),
        [
          { text: ra("cancel"), style: "cancel" },
          {
            text: ra("deleteSeries"),
            style: "destructive",
            onPress: async () => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
              const { error: err, errorCode: delCode } = await deleteRecurring(
                `/api/provider/recurring-appointments/${item.id}?series=true`,
                {}
              );
              if (err) {
                alertApiError(ra("deleteFailedTitle"), err, delCode, router);
              } else {
                mutateRecurringItems((items) => items.filter((current) => current.id !== item.id));
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                setViewItem(null);
                void refresh();
              }
            },
          },
        ]
      );
    },
    [deleteRecurring, mutateRecurringItems, refresh, router, ra]
  );

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title={ra("title")} showBack />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 48 }}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    const isSub = isPlanGateErrorCode(errorCode);
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title={ra("title")} showBack />
        <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 16 }}>
          <ErrorState
            message={isSub ? ra("planGateMessage") : error}
            onRetry={isSub ? undefined : refresh}
          />
          {isSub && (
            <TouchableOpacity
              onPress={() =>
                router.push("/(app)/(tabs)/more/settings/subscription" as never)
              }
              style={{
                marginTop: 20,
                alignSelf: "center",
                backgroundColor: "#FF0077",
                paddingVertical: 12,
                paddingHorizontal: 20,
                borderRadius: 12,
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "600" }}>{ra("viewPlans")}</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScreenContainer>
    );
  }

  const activeCount = allItems.filter((i) => i.is_active).length;
  const pausedCount = allItems.filter((i) => !i.is_active).length;

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title={ra("titleShort")}
        showBack
        subtitle={total > 0 ? ra("subtitle", { count: total }) : undefined}
      />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: screenPadding, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Stats strip */}
        {allItems.length > 0 && (
          <View
            style={{
              flexDirection: "row",
              gap: 8,
              marginBottom: 16,
              padding: 16,
              borderRadius: 16,
              backgroundColor: "#fafafa",
              borderWidth: 1,
              borderColor: Colors.gray[100],
            }}
          >
            <View style={{ flex: 1, alignItems: "center" }}>
              <Text style={{ fontSize: 22, fontWeight: "700", color: Colors.gray[900] }}>
                {total}
              </Text>
              <Text style={{ fontSize: 11, color: Colors.gray[500] }}>{ra("statTotal")}</Text>
            </View>
            <View style={{ width: 1, backgroundColor: Colors.gray[100] }} />
            <View style={{ flex: 1, alignItems: "center" }}>
              <Text style={{ fontSize: 22, fontWeight: "700", color: "#16a34a" }}>
                {activeCount}
              </Text>
              <Text style={{ fontSize: 11, color: Colors.gray[500] }}>{ra("statActive")}</Text>
            </View>
            <View style={{ width: 1, backgroundColor: Colors.gray[100] }} />
            <View style={{ flex: 1, alignItems: "center" }}>
              <Text style={{ fontSize: 22, fontWeight: "700", color: "#d97706" }}>
                {pausedCount}
              </Text>
              <Text style={{ fontSize: 11, color: Colors.gray[500] }}>{ra("statPaused")}</Text>
            </View>
          </View>
        )}

        {/* Filter chips */}
        {allItems.length > 0 && (
          <View
            style={{
              marginBottom: 16,
              padding: 14,
              borderRadius: 14,
              backgroundColor: "#EFF6FF",
              borderWidth: 1,
              borderColor: "#BFDBFE",
            }}
          >
            <Text style={{ fontSize: 13, color: Colors.gray[700], lineHeight: 19 }}>
              {ra("autoCreateHint")}
            </Text>
          </View>
        )}

        {allItems.length > 0 && (
          <View style={{ marginBottom: 16 }}>
            <FilterChipGroup
              options={[
                { label: ra("filterAll"), value: "all" },
                { label: ra("filterActive"), value: "active" },
                { label: ra("filterPaused"), value: "paused" },
              ]}
              selected={statusFilter}
              onSelect={(v) => setStatusFilter(v as "all" | "active" | "paused")}
            />
          </View>
        )}

        {list.length === 0 ? (
          <EmptyState
            icon="repeat-outline"
            title={
              statusFilter === "active"
                ? ra("emptyActiveTitle")
                : statusFilter === "paused"
                  ? ra("emptyPausedTitle")
                  : ra("emptyTitle")
            }
            description={
              statusFilter !== "all"
                ? ra("emptyFilteredHint")
                : ra("emptyDescription")
            }
          />
        ) : (
          list.map((item) => (
            <TouchableOpacity
              key={item.id}
              onPress={() => openView(item)}
              activeOpacity={0.7}
              style={{
                marginBottom: 10,
                flexDirection: "row",
                alignItems: "center",
                borderRadius: 16,
                borderWidth: 1,
                borderColor: item.is_active ? Colors.gray[100] : Colors.gray[200],
                backgroundColor: item.is_active ? Colors.white : "#fafafa",
                padding: 14,
              }}
            >
              <View
                style={{
                  width: 42,
                  height: 42,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 13,
                  backgroundColor: item.is_active ? "#ede9fe" : "#f3f4f6",
                }}
              >
                <Ionicons
                  name="repeat-outline"
                  size={20}
                  color={item.is_active ? "#8b5cf6" : "#9ca3af"}
                />
              </View>
              <View style={{ marginStart: 12, flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text
                    style={{ fontSize: 15, fontWeight: "600", color: Colors.gray[900] }}
                    numberOfLines={1}
                  >
                    {item.customer?.full_name ?? ra("clientFallback")}
                  </Text>
                  {!item.is_active && (
                    <View
                      style={{
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                        borderRadius: 6,
                        backgroundColor: "#fef3c7",
                      }}
                    >
                      <Text style={{ fontSize: 10, fontWeight: "600", color: "#d97706" }}>
                        {ra("paused")}
                      </Text>
                    </View>
                  )}
                </View>
                <Text
                  style={{ marginTop: 2, fontSize: 13, fontWeight: "500", color: "#6366f1" }}
                  numberOfLines={1}
                >
                  {serviceTitle(item)
                    ? ra("scheduleWithService", { schedule: displaySchedule(item, ra), service: serviceTitle(item) })
                    : displaySchedule(item, ra)}
                </Text>
                <Text style={{ marginTop: 2, fontSize: 12, color: Colors.gray[500] }}>
                  {ra("listFrom", { date: formatShortDate(item.start_date), time: formatTimeSlot(item) })}
                  {item.end_date ? ra("listEnds", { date: formatShortDate(item.end_date) }) : ""}
                  {item.last_booking_date ? ra("listLastBooked", { date: formatShortDate(item.last_booking_date) }) : ""}
                </Text>
              </View>
              <DirectionalIcon name="chevron-forward" size={18} color="#d1d5db" />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* Detail bottom sheet */}
      {viewItem && (
        <BottomSheet
          visible={!!viewItem}
          onClose={() => setViewItem(null)}
          title={ra("sheetTitle")}
          subtitle={viewItem.customer?.full_name ?? ra("clientFallback")}
        >
          <View
            style={{
              flexDirection: "row",
              gap: 8,
              marginBottom: 12,
              padding: 12,
              borderRadius: 12,
              backgroundColor: Colors.gray[50],
            }}
          >
            <View
              style={{
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 8,
                backgroundColor: viewItem.is_active ? "#dcfce7" : "#fef3c7",
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "600",
                  color: viewItem.is_active ? "#16a34a" : "#d97706",
                }}
              >
                {viewItem.is_active ? ra("active") : ra("paused")}
              </Text>
            </View>
          </View>

          <View
            style={{
              marginBottom: 10,
              borderRadius: 12,
              backgroundColor: Colors.gray[50],
              padding: 12,
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: "600", color: Colors.gray[400], marginBottom: 2 }}>
              {ra("labelSchedule")}
            </Text>
            <Text style={{ fontSize: 15, fontWeight: "600", color: "#6366f1" }}>
              {displaySchedule(viewItem, ra)}
            </Text>
            {viewItem.recurrence_rule ? (
              <Text style={{ fontSize: 12, color: Colors.gray[500], marginTop: 2 }}>
                {ra("rulePrefix", { rule: viewItem.recurrence_rule })}
              </Text>
            ) : null}
          </View>

          <View
            style={{
              marginBottom: 10,
              borderRadius: 12,
              backgroundColor: Colors.gray[50],
              padding: 12,
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: "600", color: Colors.gray[400], marginBottom: 2 }}>
              {ra("labelStart")}
            </Text>
            <Text style={{ fontSize: 14, color: Colors.gray[900] }}>
              {ra("startAt", { date: formatShortDate(viewItem.start_date), time: formatTimeSlot(viewItem) })}
            </Text>
          </View>

          {viewItem.last_booking_date ? (
            <View
              style={{
                marginBottom: 10,
                borderRadius: 12,
                backgroundColor: Colors.gray[50],
                padding: 12,
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: "600", color: Colors.gray[400], marginBottom: 2 }}>
                {ra("labelLastVisit")}
              </Text>
              <Text style={{ fontSize: 14, color: Colors.gray[900] }}>{formatShortDate(viewItem.last_booking_date)}</Text>
            </View>
          ) : null}

          {viewItem.end_date ? (
            <View
              style={{
                marginBottom: 10,
                borderRadius: 12,
                backgroundColor: Colors.gray[50],
                padding: 12,
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: "600", color: Colors.gray[400], marginBottom: 2 }}>
                {ra("labelEndDate")}
              </Text>
              <Text style={{ fontSize: 14, color: Colors.gray[900] }}>
                {formatShortDate(viewItem.end_date)}
              </Text>
            </View>
          ) : null}

          {serviceTitle(viewItem) ? (
            <View
              style={{
                marginBottom: 10,
                borderRadius: 12,
                backgroundColor: Colors.gray[50],
                padding: 12,
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: "600", color: Colors.gray[400], marginBottom: 2 }}>
                {ra("labelService")}
              </Text>
              <Text style={{ fontSize: 14, color: Colors.gray[900] }}>{serviceTitle(viewItem)}</Text>
            </View>
          ) : null}

          {viewItem.staff?.name ? (
            <View
              style={{
                marginBottom: 10,
                borderRadius: 12,
                backgroundColor: Colors.gray[50],
                padding: 12,
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: "600", color: Colors.gray[400], marginBottom: 2 }}>
                {ra("labelStaff")}
              </Text>
              <Text style={{ fontSize: 14, color: Colors.gray[900] }}>{viewItem.staff.name}</Text>
            </View>
          ) : null}

          {viewItem.location_type ? (
            <View
              style={{
                marginBottom: 10,
                borderRadius: 12,
                backgroundColor: Colors.gray[50],
                padding: 12,
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: "600", color: Colors.gray[400], marginBottom: 2 }}>
                {ra("labelLocationType")}
              </Text>
              <Text style={{ fontSize: 14, color: Colors.gray[900] }}>
                {viewItem.location_type === "at_home" ? ra("locationAtHome") : ra("locationAtSalon")}
              </Text>
            </View>
          ) : null}

          {Array.isArray(viewItem.metadata?.services) && viewItem.metadata!.services!.length > 1 ? (
            <View
              style={{
                marginBottom: 10,
                borderRadius: 12,
                backgroundColor: "#FFFBEB",
                borderWidth: 1,
                borderColor: "#FDE68A",
                padding: 12,
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: "600", color: Colors.gray[400], marginBottom: 2 }}>
                {ra("labelServices")}
              </Text>
              <Text style={{ fontSize: 14, color: Colors.gray[900] }}>
                {ra("multiServices", { count: viewItem.metadata!.services!.length })}
              </Text>
            </View>
          ) : null}

          {viewItem.notes ? (
            <View
              style={{
                marginBottom: 16,
                borderRadius: 12,
                backgroundColor: Colors.gray[50],
                padding: 12,
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: "600", color: Colors.gray[400], marginBottom: 2 }}>
                {ra("labelNotes")}
              </Text>
              <Text style={{ fontSize: 14, color: Colors.gray[900] }}>{viewItem.notes}</Text>
            </View>
          ) : null}

          <View
            style={{
              marginBottom: 14,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: "#E0E7FF",
              backgroundColor: "#EEF2FF",
              padding: 12,
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: "600", color: Colors.gray[500], marginBottom: 8 }}>
              {ra("editScheduleHeading")}
            </Text>
            <Text style={{ fontSize: 11, color: Colors.gray[500], marginBottom: 6 }}>{ra("frequency")}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
              {(["weekly", "biweekly", "monthly"] as const).map((f) => (
                <TouchableOpacity
                  key={f}
                  onPress={() => setEditFreq(f)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: editFreq === f ? "#6366f1" : Colors.gray[200],
                    backgroundColor: editFreq === f ? "#fff" : Colors.gray[50],
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: "600", color: editFreq === f ? "#4f46e5" : Colors.gray[700] }}>
                    {f === "weekly" ? ra("freqWeekly") : f === "biweekly" ? ra("freqEvery2Wks") : ra("freqMonthly")}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={{ fontSize: 11, color: Colors.gray[500], marginBottom: 4 }}>{ra("preferredTime")}</Text>
            <TextInput
              value={editTime}
              onChangeText={setEditTime}
              placeholder={ra("timePlaceholder")}
              style={{
                borderWidth: 1,
                borderColor: Colors.gray[200],
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 10,
                fontSize: 15,
                marginBottom: 10,
                backgroundColor: "#fff",
              }}
            />
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <Text style={{ fontSize: 13, fontWeight: "500", color: Colors.gray[800], flex: 1 }}>{ra("noEndDate")}</Text>
              <Switch
                value={editNoEnd}
                onValueChange={(on) => {
                  setEditNoEnd(on);
                  if (on) setEditEnd("");
                }}
                trackColor={{ false: Colors.gray[200], true: "#C7D2FE" }}
                thumbColor={editNoEnd ? "#6366f1" : "#f4f4f5"}
              />
            </View>
            {!editNoEnd && (
              <>
                <Text style={{ fontSize: 11, color: Colors.gray[500], marginBottom: 4 }}>{ra("endDateLabel")}</Text>
                <TextInput
                  value={editEnd}
                  onChangeText={setEditEnd}
                  placeholder={ra("endDatePlaceholder")}
                  style={{
                    borderWidth: 1,
                    borderColor: Colors.gray[200],
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    fontSize: 15,
                    marginBottom: 10,
                    backgroundColor: "#fff",
                  }}
                />
              </>
            )}
            <TouchableOpacity
              onPress={saveScheduleEdits}
              disabled={savingEdit || patching}
              style={{
                marginTop: 4,
                borderRadius: 12,
                backgroundColor: "#4f46e5",
                paddingVertical: 12,
                alignItems: "center",
                opacity: savingEdit || patching ? 0.6 : 1,
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: "700", color: "#fff" }}>
                {savingEdit ? ra("saving") : ra("saveSchedule")}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Pause / Resume */}
          <TouchableOpacity
            onPress={() => handleToggleActive(viewItem)}
            disabled={patching}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 14,
              borderWidth: 1,
              borderColor: viewItem.is_active ? "#fde68a" : "#bbf7d0",
              backgroundColor: viewItem.is_active ? "#fffbeb" : "#f0fdf4",
              paddingVertical: 13,
              marginBottom: 10,
              opacity: patching ? 0.6 : 1,
            }}
          >
            <Ionicons
              name={viewItem.is_active ? "pause-circle-outline" : "play-circle-outline"}
              size={20}
              color={viewItem.is_active ? "#d97706" : "#16a34a"}
            />
            <Text
              style={{
                marginStart: 8,
                fontSize: 14,
                fontWeight: "600",
                color: viewItem.is_active ? "#d97706" : "#16a34a",
              }}
            >
              {viewItem.is_active ? ra("pauseSeries") : ra("resumeSeries")}
            </Text>
          </TouchableOpacity>

          {/* Delete */}
          <TouchableOpacity
            onPress={() => handleDelete(viewItem)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 14,
              borderWidth: 1,
              borderColor: "#fecaca",
              backgroundColor: "#fef2f2",
              paddingVertical: 13,
            }}
          >
            <Ionicons name="trash-outline" size={18} color="#dc2626" />
            <Text
              style={{ marginStart: 8, fontSize: 14, fontWeight: "500", color: "#dc2626" }}
            >
              {ra("deleteRecurringSeries")}
            </Text>
          </TouchableOpacity>
        </BottomSheet>
      )}
    </ScreenContainer>
  );
}
