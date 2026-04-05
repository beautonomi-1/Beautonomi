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
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi, useApiMutation } from "@/hooks/useApi";
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
  staff?: { name?: string | null };
}

interface RecurringListResponse {
  data: RecurringAppointment[];
  total: number;
  page: number;
  total_pages: number;
}

/** Convert an RRULE or shorthand string into a human-readable label. */
function humanizeRule(rule: string): string {
  if (!rule) return rule;
  const r = rule.toUpperCase();
  if (r.startsWith("FREQ=")) {
    const match = r.match(/FREQ=(\w+)/);
    const interval = r.match(/INTERVAL=(\d+)/);
    const freq = match?.[1];
    const n = interval ? parseInt(interval[1], 10) : 1;
    const freqMap: Record<string, string> = {
      DAILY: n === 1 ? "Every day" : `Every ${n} days`,
      WEEKLY: n === 1 ? "Every week" : `Every ${n} weeks`,
      BIWEEKLY: "Every 2 weeks",
      MONTHLY: n === 1 ? "Every month" : `Every ${n} months`,
      YEARLY: "Every year",
    };
    return freqMap[freq ?? ""] ?? rule;
  }
  const simple: Record<string, string> = {
    DAILY: "Every day",
    WEEKLY: "Every week",
    BIWEEKLY: "Every 2 weeks",
    MONTHLY: "Every month",
    YEARLY: "Every year",
    "2WEEKLY": "Every 2 weeks",
    "4WEEKLY": "Every 4 weeks",
  };
  return simple[r] ?? rule;
}

function humanizeSimpleFrequency(f: string | null | undefined): string | null {
  if (!f?.trim()) return null;
  const x = f.toLowerCase();
  if (x === "weekly") return "Every week";
  if (x === "biweekly") return "Every 2 weeks";
  if (x === "monthly") return "Every month";
  return f;
}

/** RRULE from portal; otherwise customer `frequency` field. */
function displaySchedule(item: RecurringAppointment): string {
  if (item.recurrence_rule?.trim()) {
    return humanizeRule(item.recurrence_rule);
  }
  return humanizeSimpleFrequency(item.frequency ?? null) ?? "Recurring";
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

  const recurringUrl = selectedLocationId
    ? `/api/provider/recurring-appointments?limit=100&location_id=${encodeURIComponent(selectedLocationId)}`
    : "/api/provider/recurring-appointments?limit=100";
  const { data, loading, error, refresh } = useApi<RecurringListResponse>(recurringUrl);
  const { execute: patchRecurring, loading: patching } = useApiMutation("patch");
  const { execute: deleteRecurring } = useApiMutation("delete");

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
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
    if (!viewItem) return;
    setEditFreq(simpleFreqFromItem(viewItem));
    setEditTime(timeToHhMm(viewItem.start_time || viewItem.preferred_time));
    const end = viewItem.end_date ? String(viewItem.end_date).slice(0, 10) : "";
    setEditEnd(end);
    setEditNoEnd(!viewItem.end_date);
  }, [viewItem]);

  const saveScheduleEdits = useCallback(async () => {
    if (!viewItem) return;
    if (!editNoEnd && !editEnd.trim()) {
      Alert.alert("End date", 'Choose an end date or turn on "No end date".');
      return;
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
    const { error: err } = await patchRecurring(`/api/provider/recurring-appointments/${viewItem.id}`, body);
    setSavingEdit(false);
    if (err) {
      Alert.alert("Error", err);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setViewItem(null);
      refresh();
    }
  }, [viewItem, editFreq, editTime, editEnd, editNoEnd, patchRecurring, refresh]);

  const handleToggleActive = useCallback(
    async (item: RecurringAppointment) => {
      const newActive = !item.is_active;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const { error: err } = await patchRecurring(
        `/api/provider/recurring-appointments/${item.id}`,
        { is_active: newActive }
      );
      if (err) {
        Alert.alert("Error", err);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setViewItem(null);
        refresh();
      }
    },
    [patchRecurring, refresh]
  );

  const handleDelete = useCallback(
    (item: RecurringAppointment) => {
      Alert.alert(
        "Delete recurring appointment",
        `This will delete the entire recurring series for ${item.customer?.full_name ?? "this client"}. Future auto-created visits will stop; existing bookings already on the calendar stay as they are.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete series",
            style: "destructive",
            onPress: async () => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
              const { error: err } = await deleteRecurring(
                `/api/provider/recurring-appointments/${item.id}`,
                {}
              );
              if (err) {
                Alert.alert("Error", err);
              } else {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                setViewItem(null);
                refresh();
              }
            },
          },
        ]
      );
    },
    [deleteRecurring, refresh]
  );

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Recurring Appointments" showBack />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 48 }}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    const is403 =
      error.toLowerCase().includes("subscription") || error.toLowerCase().includes("upgrade");
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Recurring Appointments" showBack />
        <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 16 }}>
          <ErrorState
            message={is403 ? "This feature requires a Starter plan or higher." : error}
            onRetry={is403 ? undefined : refresh}
          />
        </View>
      </ScreenContainer>
    );
  }

  const activeCount = allItems.filter((i) => i.is_active).length;
  const pausedCount = allItems.filter((i) => !i.is_active).length;

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title="Recurring"
        showBack
        subtitle={total > 0 ? `${total} series` : undefined}
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
              <Text style={{ fontSize: 11, color: Colors.gray[500] }}>Total</Text>
            </View>
            <View style={{ width: 1, backgroundColor: Colors.gray[100] }} />
            <View style={{ flex: 1, alignItems: "center" }}>
              <Text style={{ fontSize: 22, fontWeight: "700", color: "#16a34a" }}>
                {activeCount}
              </Text>
              <Text style={{ fontSize: 11, color: Colors.gray[500] }}>Active</Text>
            </View>
            <View style={{ width: 1, backgroundColor: Colors.gray[100] }} />
            <View style={{ flex: 1, alignItems: "center" }}>
              <Text style={{ fontSize: 22, fontWeight: "700", color: "#d97706" }}>
                {pausedCount}
              </Text>
              <Text style={{ fontSize: 11, color: Colors.gray[500] }}>Paused</Text>
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
              New visits are created once per day by the system when a slot is due. Clients are not charged automatically for those visits—payment works like your other bookings (pay in app, at the venue, etc.).
            </Text>
          </View>
        )}

        {allItems.length > 0 && (
          <View style={{ marginBottom: 16 }}>
            <FilterChipGroup
              options={[
                { label: "All", value: "all" },
                { label: "Active", value: "active" },
                { label: "Paused", value: "paused" },
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
              statusFilter !== "all"
                ? `No ${statusFilter} recurring appointments`
                : "No recurring appointments"
            }
            description={
              statusFilter !== "all"
                ? "Change the filter to see others."
                : "Repeating schedules create visits automatically when due (daily job). Set them up from the calendar or web portal. Payment is still per booking unless the client pays separately."
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
              <View style={{ marginLeft: 12, flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text
                    style={{ fontSize: 15, fontWeight: "600", color: Colors.gray[900] }}
                    numberOfLines={1}
                  >
                    {item.customer?.full_name ?? "Client"}
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
                        Paused
                      </Text>
                    </View>
                  )}
                </View>
                <Text
                  style={{ marginTop: 2, fontSize: 13, fontWeight: "500", color: "#6366f1" }}
                  numberOfLines={1}
                >
                  {displaySchedule(item)}
                  {item.service?.title ? ` · ${item.service.title}` : ""}
                </Text>
                <Text style={{ marginTop: 2, fontSize: 12, color: Colors.gray[500] }}>
                  From {formatShortDate(item.start_date)} · {formatTimeSlot(item)}
                  {item.end_date ? ` · Ends ${formatShortDate(item.end_date)}` : ""}
                  {item.last_booking_date ? ` · Last booked ${formatShortDate(item.last_booking_date)}` : ""}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#d1d5db" />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* Detail bottom sheet */}
      {viewItem && (
        <BottomSheet
          visible={!!viewItem}
          onClose={() => setViewItem(null)}
          title="Recurring appointment"
          subtitle={viewItem.customer?.full_name ?? "Client"}
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
                {viewItem.is_active ? "Active" : "Paused"}
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
              SCHEDULE
            </Text>
            <Text style={{ fontSize: 15, fontWeight: "600", color: "#6366f1" }}>
              {displaySchedule(viewItem)}
            </Text>
            {viewItem.recurrence_rule ? (
              <Text style={{ fontSize: 12, color: Colors.gray[500], marginTop: 2 }}>
                Rule: {viewItem.recurrence_rule}
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
              START
            </Text>
            <Text style={{ fontSize: 14, color: Colors.gray[900] }}>
              {formatShortDate(viewItem.start_date)} at {formatTimeSlot(viewItem)}
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
                LAST AUTO-BOOKED VISIT
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
                END DATE
              </Text>
              <Text style={{ fontSize: 14, color: Colors.gray[900] }}>
                {formatShortDate(viewItem.end_date)}
              </Text>
            </View>
          ) : null}

          {viewItem.service?.title ? (
            <View
              style={{
                marginBottom: 10,
                borderRadius: 12,
                backgroundColor: Colors.gray[50],
                padding: 12,
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: "600", color: Colors.gray[400], marginBottom: 2 }}>
                SERVICE
              </Text>
              <Text style={{ fontSize: 14, color: Colors.gray[900] }}>{viewItem.service.title}</Text>
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
                STAFF
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
                LOCATION TYPE
              </Text>
              <Text style={{ fontSize: 14, color: Colors.gray[900] }}>
                {viewItem.location_type === "at_home" ? "At client location" : "At salon"}
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
                SERVICES
              </Text>
              <Text style={{ fontSize: 14, color: Colors.gray[900] }}>
                {viewItem.metadata!.services!.length} services in this repeat visit (see client booking for full list).
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
                NOTES
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
              EDIT SERIES SCHEDULE
            </Text>
            <Text style={{ fontSize: 11, color: Colors.gray[500], marginBottom: 6 }}>Frequency</Text>
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
                    {f === "weekly" ? "Weekly" : f === "biweekly" ? "Every 2 wks" : "Monthly"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={{ fontSize: 11, color: Colors.gray[500], marginBottom: 4 }}>Preferred time (HH:MM)</Text>
            <TextInput
              value={editTime}
              onChangeText={setEditTime}
              placeholder="10:00"
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
              <Text style={{ fontSize: 13, fontWeight: "500", color: Colors.gray[800], flex: 1 }}>No end date</Text>
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
                <Text style={{ fontSize: 11, color: Colors.gray[500], marginBottom: 4 }}>End date (YYYY-MM-DD)</Text>
                <TextInput
                  value={editEnd}
                  onChangeText={setEditEnd}
                  placeholder="2026-12-31"
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
                {savingEdit ? "Saving…" : "Save schedule changes"}
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
                marginLeft: 8,
                fontSize: 14,
                fontWeight: "600",
                color: viewItem.is_active ? "#d97706" : "#16a34a",
              }}
            >
              {viewItem.is_active ? "Pause series" : "Resume series"}
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
              style={{ marginLeft: 8, fontSize: 14, fontWeight: "500", color: "#dc2626" }}
            >
              Delete recurring series
            </Text>
          </TouchableOpacity>
        </BottomSheet>
      )}
    </ScreenContainer>
  );
}
