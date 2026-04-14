import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
  ActivityIndicator,
  Platform,
  Modal,
  Switch,
  TextInput,
  KeyboardAvoidingView,
  Pressable,
} from "react-native";
import { router } from "expo-router";
import { api } from "@/lib/api-client";
import { API_RECURRING_BOOKINGS, apiRecurringBookingPath } from "@/lib/customer-api-paths";
import { useResponsive } from "@/hooks/useResponsive";
import { Colors } from "@/constants/colors";
import { STACK_CONTENT_PADDING_BOTTOM } from "@/constants/layout";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";
import { getTenantLocaleTag } from "@/lib/locale";

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

function formatDate(iso: string): string {
  if (!iso) return "—";
  const parsed = parseValidDate(iso);
  if (!parsed) return "—";
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

function formatFrequencyLabel(raw: string | undefined): string {
  const f = (raw ?? "weekly").toLowerCase();
  if (f === "biweekly") return "Every 2 weeks";
  if (f === "monthly") return "Monthly";
  if (f === "weekly") return "Weekly";
  return raw ?? "Recurring";
}

function humanizeRecurrenceRule(rule: string): string {
  if (!rule) return "Recurring";
  const r = rule.toUpperCase();
  if (r.startsWith("FREQ=")) {
    const match = r.match(/FREQ=(\w+)/);
    const interval = r.match(/INTERVAL=(\d+)/);
    const freq = match?.[1];
    const n = interval ? parseInt(interval[1]!, 10) : 1;
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

function scheduleLabelFromRow(row: { frequency?: string | null; recurrence_rule?: string | null }): string {
  if (row.frequency && String(row.frequency).trim()) {
    return formatFrequencyLabel(String(row.frequency));
  }
  if (row.recurrence_rule && String(row.recurrence_rule).trim()) {
    return humanizeRecurrenceRule(String(row.recurrence_rule));
  }
  return "Recurring";
}

function normalizeRecurringItem(row: any): RecurringBooking {
  const provider = row.provider;
  const providerName = row.provider_name ?? provider?.business_name ?? "Provider";
  const providerSlug = provider?.slug ?? null;
  const serviceName = row.service_name ?? "Recurring appointment";
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

  return {
    id: row.id,
    service_name: serviceName,
    provider_name: providerName,
    provider_slug: providerSlug,
    frequency: scheduleLabelFromRow(row),
    next_date: nextDate,
    price,
    currency,
    status,
    preferred_time: preferred,
    end_date: endDate,
    recurrence_rule: recurrenceRule,
    simple_frequency: simple,
    location_type: row.location_type,
  };
}

/* ------------------------------------------------------------------ */
/*  Screen                                                             */
/* ------------------------------------------------------------------ */

export default function RecurringBookingsScreen() {
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

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await api.get<RecurringBookingsResponse>(API_RECURRING_BOOKINGS, {
        cache: "no-store",
      });
      if (res.error) {
        setError(res.error.message || "Failed to load recurring bookings");
      } else {
        const data = res.data;
        const raw = Array.isArray(data) ? (data as unknown as any[]) : data?.recurring ?? [];
        const items = (Array.isArray(raw) ? raw : []).map(normalizeRecurringItem);
        setBookings(items);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load recurring bookings");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

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
      Alert.alert("End date", 'Choose an end date or turn on "No end date".');
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
        Alert.alert("Error", res.error.message || "Failed to update schedule");
      } else {
        setEditOpen(false);
        setEditing(null);
        await load(true);
      }
    } catch {
      Alert.alert("Error", "Failed to update schedule");
    } finally {
      setSavingSchedule(false);
    }
  }, [editing, editPreferredTime, editFrequency, editEndDate, editSeriesNoEnd, load]);

  const togglePauseResume = useCallback(async (booking: RecurringBooking) => {
    if (booking.status === "cancelled") return;
    setTogglingId(booking.id);
    try {
      const res = await api.patch(apiRecurringBookingPath(booking.id), {
        is_active: booking.status === "paused",
      });
      if (res.error) {
        Alert.alert("Error", res.error.message || "Failed to update");
      } else {
        setBookings((prev) =>
          prev.map((b) =>
            b.id === booking.id
              ? { ...b, status: (booking.status === "paused" ? "active" : "paused") as RecurringBooking["status"] }
              : b
          )
        );
      }
    } catch {
      Alert.alert("Error", "Failed to update. Please try again.");
    } finally {
      setTogglingId(null);
    }
  }, []);

  const cancelBooking = useCallback((booking: RecurringBooking) => {
    Alert.alert(
      "Cancel Recurring Booking",
      `Are you sure you want to cancel "${booking.service_name}" with ${booking.provider_name}?`,
      [
        { text: "Keep", style: "cancel" },
        {
          text: "Cancel Booking",
          style: "destructive",
          onPress: async () => {
            setCancellingId(booking.id);
            try {
              const res = await api.delete(apiRecurringBookingPath(booking.id));
              if (res.error) {
                Alert.alert("Error", res.error.message || "Failed to cancel booking");
              } else {
                setBookings((prev) => prev.filter((b) => b.id !== booking.id));
              }
            } catch {
              Alert.alert("Error", "Failed to cancel booking. Please try again.");
            } finally {
              setCancellingId(null);
            }
          },
        },
      ]
    );
  }, []);

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
            padding: 16,
            marginBottom: 12,
            borderWidth: 1,
            borderColor: Colors.gray[100],
          }}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
            <Text style={{ fontWeight: "600", color: Colors.gray[900], flex: 1, marginRight: 8 }}>{item.service_name}</Text>
            <View style={{ paddingHorizontal: 10, paddingVertical: 2, borderRadius: 9999, backgroundColor: badge.bg }}>
              <Text style={{ fontSize: 12, fontWeight: "500", color: badge.text, textTransform: "capitalize" }}>{item.status}</Text>
            </View>
          </View>
          <Text style={{ fontSize: 14, color: Colors.gray[600], marginBottom: 4 }}>{item.provider_name}</Text>
          {item.provider_slug ? (
            <TouchableOpacity
              onPress={() =>
                router.push({ pathname: "/(app)/partner-profile", params: { slug: item.provider_slug! } })
              }
              style={{ marginBottom: 8 }}
            >
              <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.primary }}>View salon</Text>
            </TouchableOpacity>
          ) : null}
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
            <View>
              <Text style={{ fontSize: 12, color: Colors.gray[500] }}>Frequency</Text>
              <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[800] }}>{item.frequency}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={{ fontSize: 12, color: Colors.gray[500] }}>Next appointment</Text>
              <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[800] }}>{formatDate(item.next_date)}</Text>
            </View>
          </View>
          <Text style={{ fontSize: 12, color: Colors.gray[500], marginTop: 8 }}>
            Preferred time · {preferredTimeToInputValue(item.preferred_time)}
          </Text>
          <Text style={{ fontSize: 12, color: Colors.gray[600], marginTop: 4 }}>
            {item.end_date
              ? `Ends ${formatDate(item.end_date)}`
              : "No fixed end date — runs until you pause or cancel."}
          </Text>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 12,
              paddingTop: 12,
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
                  <Text style={{ fontSize: 13, fontWeight: "600", color: Colors.primary }}>Edit schedule</Text>
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
                      {item.status === "paused" ? "Resume" : "Pause"}
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
                    <Text style={{ fontSize: 14, fontWeight: "500", color: "#DC2626" }}>Cancel</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      );
    },
    [cancellingId, togglingId, cancelBooking, togglePauseResume, openEdit]
  );

  if (loading && bookings.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.white, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={{ color: Colors.gray[600], marginTop: 16 }}>Loading...</Text>
      </View>
    );
  }

  if (error && bookings.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.white, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Text style={{ textAlign: "center", color: Colors.gray[700], marginBottom: 16 }}>{error}</Text>
        <TouchableOpacity onPress={() => load()} style={{ backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}>
          <Text style={{ color: Colors.white, fontWeight: "600" }}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (bookings.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.white, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Text style={{ textAlign: "center", fontWeight: "600", color: Colors.gray[900], marginBottom: 8 }}>No recurring bookings yet</Text>
        <Text style={{ textAlign: "center", color: Colors.gray[500], paddingHorizontal: 8 }}>
          After you book while signed in, turn on &quot;Repeat this booking&quot; on checkout (app or web). You can also ask your provider to set up a series.
        </Text>
        <Text style={{ textAlign: "center", color: Colors.gray[500], paddingHorizontal: 16, marginTop: 14, fontSize: 13, lineHeight: 18 }}>
          You pay per visit—repeat schedules do not auto-charge your card.
        </Text>
        <TouchableOpacity
          onPress={() => router.push("/(app)/(tabs)/search")}
          style={{ marginTop: 20, backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}
        >
          <Text style={{ color: Colors.white, fontWeight: "600" }}>Find a salon</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.white }}>
      <FlatList
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
            <Text style={{ fontSize: 13, color: Colors.gray[700], lineHeight: 19 }}>
              Each visit is booked automatically on the schedule below. You pay per appointment (or as you usually do with this provider)—recurring does not charge your card by itself.
            </Text>
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

      <Modal visible={editOpen} animationType="slide" transparent onRequestClose={() => !savingSchedule && setEditOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
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
              <Text style={{ fontSize: 18, fontWeight: "700", color: Colors.gray[900], marginBottom: 8 }}>Edit schedule</Text>
              <Text style={{ fontSize: 13, color: Colors.gray[600], marginBottom: 16 }}>
                Update how often you visit, preferred time, and optional end date.
              </Text>

              <Text style={{ fontSize: 12, fontWeight: "600", color: Colors.gray[500], marginBottom: 6 }}>Frequency</Text>
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
                      {f === "weekly" ? "Weekly" : f === "biweekly" ? "Every 2 wks" : "Monthly"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={{ fontSize: 12, fontWeight: "600", color: Colors.gray[500], marginBottom: 6 }}>Preferred time (HH:MM)</Text>
              <TextInput
                value={editPreferredTime}
                onChangeText={setEditPreferredTime}
                placeholder="10:00"
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
                  <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900] }}>No end date</Text>
                  <Text style={{ fontSize: 12, color: Colors.gray[500], marginTop: 2 }}>Uncheck to stop after a specific date.</Text>
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
                  <Text style={{ fontSize: 12, fontWeight: "600", color: Colors.gray[500], marginBottom: 6 }}>End date (YYYY-MM-DD)</Text>
                  <TextInput
                    value={editEndDate}
                    onChangeText={setEditEndDate}
                    placeholder="2026-12-31"
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
                  <Text style={{ fontWeight: "600", color: Colors.gray[700] }}>Close</Text>
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
                    <Text style={{ fontWeight: "700", color: "#fff" }}>Save</Text>
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
