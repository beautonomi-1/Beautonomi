import { useCallback, useMemo, useState } from "react";
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, TextInput, Alert } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { format } from "date-fns";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { useProvider } from "@/providers/ProviderContext";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ActionButton } from "@/components/ui/ActionButton";
import { Colors } from "@/constants/colors";

type WaitlistEntry = {
  id: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  preferred_date: string | null;
  preferred_time_start: string | null;
  preferred_time_end: string | null;
  notes: string | null;
  status: string;
  priority: number | null;
  created_at: string;
  service_id?: string | null;
  staff_id?: string | null;
  service?: { id: string; title: string } | null;
  staff?: { id: string; name: string | Record<string, unknown> | null } | null;
};

type WaitlistResponse = { entries: WaitlistEntry[]; total?: number };

function formatDateSafe(value: unknown): string {
  if (typeof value !== "string" || !value) return "—";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "—";
  return parsed.toLocaleDateString();
}

function staffLabel(staff: WaitlistEntry["staff"]): string {
  if (!staff?.name) return "";
  if (typeof staff.name === "string") return staff.name;
  return "";
}

function toYmd(v: string | null | undefined): string {
  if (!v) return format(new Date(), "yyyy-MM-dd");
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? format(d, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd");
}

function toHm(v: string | null | undefined): string {
  if (!v) return "09:00";
  const m = v.match(/(\d{2}:\d{2})/);
  return m ? m[1]! : "09:00";
}

function statusBgColor(status: string): string {
  switch (status) {
    case "waiting":
      return "#fef3c7";
    case "contacted":
      return "#dbeafe";
    case "booked":
      return "#dcfce7";
    case "cancelled":
      return "#fee2e2";
    default:
      return Colors.gray[100];
  }
}

const STATUS_OPTIONS = ["waiting", "contacted", "booked", "cancelled"] as const;

function alertWaitlistActionError(kind: "notify" | "quickBook", err: string) {
  const lower = err.toLowerCase();
  const looksLikePermission =
    lower.includes("permission") ||
    lower.includes("forbidden") ||
    lower.includes("send_messages") ||
    lower.includes("create appointments") ||
    lower.includes("create_appointments");
  const title =
    kind === "notify"
      ? looksLikePermission
        ? "Messaging permission required"
        : "Could not notify"
      : looksLikePermission
        ? "Cannot create booking"
        : "Quick book failed";
  Alert.alert(title, err);
}

export default function WaitlistScreen() {
  const router = useRouter();
  const { selectedLocationId } = useProvider();
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<WaitlistEntry | null>(null);
  const [qbDate, setQbDate] = useState("");
  const [qbTime, setQbTime] = useState("09:00");

  const waitlistUrl = selectedLocationId
    ? `/api/provider/waitlist?location_id=${encodeURIComponent(selectedLocationId)}`
    : "/api/provider/waitlist";
  const { data, loading, error, refresh } = useApi<WaitlistResponse>(waitlistUrl);

  const { execute: patchWaitlist, loading: patching } = useApiMutation("patch");
  const { execute: postNotify, loading: notifying } = useApiMutation("post");
  const { execute: postQuickBook, loading: quickBooking } = useApiMutation("post");
  const { execute: deleteWaitlist, loading: deleting } = useApiMutation("delete");

  const entries: WaitlistEntry[] = data?.entries ?? [];

  const openEntry = useCallback((entry: WaitlistEntry) => {
    setSelected(entry);
    setQbDate(toYmd(entry.preferred_date));
    setQbTime(toHm(entry.preferred_time_start));
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const updateStatus = useCallback(
    async (entryId: string, status: (typeof STATUS_OPTIONS)[number]) => {
      const { error: err } = await patchWaitlist(`/api/provider/waitlist/${entryId}`, { status });
      if (err) {
        Alert.alert("Could not update", err);
        return;
      }
      await refresh();
      setSelected((s) => (s?.id === entryId ? { ...s, status } : s));
    },
    [patchWaitlist, refresh],
  );

  const notifyEntry = useCallback(
    async (entryId: string) => {
      const { error: err } = await postNotify(`/api/provider/waitlist/${entryId}/notify`, {});
      if (err) {
        alertWaitlistActionError("notify", err);
        return;
      }
      Alert.alert("Sent", "We queued a notification for this client.");
      await refresh();
    },
    [postNotify, refresh],
  );

  const quickBook = useCallback(
    async (entry: WaitlistEntry) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(qbDate)) {
        Alert.alert("Date", "Use YYYY-MM-DD.");
        return;
      }
      if (!/^\d{2}:\d{2}$/.test(qbTime)) {
        Alert.alert("Time", "Use HH:MM (24h).");
        return;
      }
      const body: { date: string; time: string; staff_id?: string } = { date: qbDate, time: qbTime };
      if (entry.staff_id) body.staff_id = entry.staff_id;
      const { error: err } = await postQuickBook(`/api/provider/waitlist/${entry.id}/quick-book`, body);
      if (err) {
        alertWaitlistActionError("quickBook", err);
        return;
      }
      Alert.alert("Booked", "A booking was created from this waitlist entry.");
      setSelected(null);
      await refresh();
    },
    [postQuickBook, qbDate, qbTime, refresh],
  );

  const removeEntry = useCallback(
    (entry: WaitlistEntry) => {
      Alert.alert("Remove waitlist entry?", "This cannot be undone.", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const { error: err } = await deleteWaitlist(`/api/provider/waitlist/${entry.id}`);
            if (err) {
              Alert.alert("Error", err);
              return;
            }
            setSelected(null);
            await refresh();
          },
        },
      ]);
    },
    [deleteWaitlist, refresh],
  );

  const sheetSubtitle = useMemo(() => {
    if (!selected) return undefined;
    return selected.customer_phone ?? selected.customer_email ?? undefined;
  }, [selected]);

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Waitlist" onBack={() => router.back()} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 48 }}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Waitlist" onBack={() => router.back()} />
        <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 16 }}>
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader title="Waitlist" subtitle="Appointments, waitlist & schedule" onBack={() => router.back()} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {entries.length === 0 ? (
          <View style={{ paddingVertical: 48, paddingHorizontal: 16, alignItems: "center" }}>
            <Ionicons name="people-outline" size={48} color="#9ca3af" />
            <Text style={{ marginTop: 16, textAlign: "center", color: Colors.gray[600] }}>No waitlist entries</Text>
            <Text style={{ marginTop: 8, textAlign: "center", fontSize: 14, color: Colors.gray[500] }}>
              Entries will appear here when customers join the waitlist
            </Text>
          </View>
        ) : (
          <View style={{ paddingBottom: 16 }}>
            {entries.map((entry) => (
              <TouchableOpacity
                key={entry.id}
                onPress={() => openEntry(entry)}
                style={{
                  marginBottom: 12,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: Colors.gray[200],
                  backgroundColor: Colors.white,
                  padding: 16,
                }}
                accessibilityRole="button"
                accessibilityLabel={`Waitlist ${entry.customer_name || "entry"}`}
              >
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <Text style={{ fontWeight: "600", color: Colors.gray[900] }} numberOfLines={1}>
                    {entry.customer_name || "No name"}
                  </Text>
                  <View style={{ borderRadius: 9999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: statusBgColor(entry.status) }}>
                    <Text style={{ fontSize: 12, fontWeight: "500", color: Colors.gray[800] }}>{entry.status}</Text>
                  </View>
                </View>
                {entry.service ? <Text style={{ fontSize: 14, color: Colors.gray[600] }}>{entry.service.title}</Text> : null}
                {staffLabel(entry.staff) ? (
                  <Text style={{ fontSize: 13, color: Colors.gray[500], marginTop: 2 }}>Staff: {staffLabel(entry.staff)}</Text>
                ) : null}
                {(entry.preferred_date || entry.customer_phone) && (
                  <Text style={{ marginTop: 4, fontSize: 12, color: Colors.gray[500] }}>
                    {entry.preferred_date ? formatDateSafe(entry.preferred_date) : ""}
                    {entry.preferred_date && entry.customer_phone ? " · " : ""}
                    {entry.customer_phone ?? ""}
                  </Text>
                )}
                <Text style={{ marginTop: 8, fontSize: 12, color: "#4f46e6", fontWeight: "600" }}>Tap to manage · notify · book</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      <BottomSheet
        visible={selected != null}
        onClose={() => setSelected(null)}
        title={selected?.customer_name || "Waitlist entry"}
        subtitle={sheetSubtitle}
        snapHeight="full"
      >
        {selected ? (
          <ScrollView style={{ maxHeight: 520 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {selected.customer_email ? (
              <Text style={{ fontSize: 14, color: Colors.gray[600], marginBottom: 6 }}>{selected.customer_email}</Text>
            ) : null}
            {selected.notes ? (
              <Text style={{ fontSize: 14, color: Colors.gray[700], marginBottom: 12 }}>{selected.notes}</Text>
            ) : null}

            <Text style={{ fontSize: 12, fontWeight: "600", color: Colors.gray[500], marginBottom: 8, textTransform: "uppercase" }}>
              Status
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 16 }}>
              {STATUS_OPTIONS.map((st) => (
                <TouchableOpacity
                  key={st}
                  onPress={() => updateStatus(selected.id, st)}
                  disabled={patching}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 8,
                    marginRight: 8,
                    marginBottom: 8,
                    backgroundColor: selected.status === st ? "#4f46e6" : Colors.gray[100],
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "600", color: selected.status === st ? Colors.white : Colors.gray[800] }}>{st}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <ActionButton
              label="Notify client"
              onPress={() => notifyEntry(selected.id)}
              loading={notifying}
              fullWidth
            />
            <Text style={{ fontSize: 12, color: Colors.gray[500], marginTop: 8, marginBottom: 16 }}>
              API requires staff permission{" "}
              <Text style={{ fontWeight: "700", color: Colors.gray[700] }}>send_messages</Text>. If you
              don’t have it, the alert will show the server error. Uses push/SMS/email when configured.
            </Text>

            <Text style={{ fontSize: 12, fontWeight: "600", color: Colors.gray[500], marginBottom: 8, textTransform: "uppercase" }}>
              Quick book
            </Text>
            <Text style={{ fontSize: 13, color: Colors.gray[600], marginBottom: 8 }}>
              Creates a booking from this entry (API: waiting or contacted only). Requires staff permission{" "}
              <Text style={{ fontWeight: "700", color: Colors.gray[700] }}>create_appointments</Text>.
              Otherwise the alert explains the failure.
            </Text>
            <TextInput
              style={{
                borderRadius: 12,
                borderWidth: 1,
                borderColor: Colors.gray[200],
                paddingHorizontal: 14,
                paddingVertical: 12,
                fontSize: 16,
                marginBottom: 10,
                color: Colors.gray[900],
              }}
              value={qbDate}
              onChangeText={setQbDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#9ca3af"
            />
            <TextInput
              style={{
                borderRadius: 12,
                borderWidth: 1,
                borderColor: Colors.gray[200],
                paddingHorizontal: 14,
                paddingVertical: 12,
                fontSize: 16,
                marginBottom: 12,
                color: Colors.gray[900],
              }}
              value={qbTime}
              onChangeText={setQbTime}
              placeholder="HH:MM"
              placeholderTextColor="#9ca3af"
            />
            <ActionButton label="Book this slot" onPress={() => quickBook(selected)} loading={quickBooking} fullWidth />

            <TouchableOpacity
              style={{ marginTop: 20, paddingVertical: 14, alignItems: "center" }}
              onPress={() => removeEntry(selected)}
              disabled={deleting}
            >
              <Text style={{ color: "#b91c1c", fontWeight: "700" }}>Delete entry</Text>
            </TouchableOpacity>
          </ScrollView>
        ) : null}
      </BottomSheet>
    </ScreenContainer>
  );
}
