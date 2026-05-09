import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  Alert,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { format } from "date-fns";
import { useTranslation } from "@beautonomi/i18n";
import { useApi, useApiMutation, useApiPost } from "@/hooks/useApi";
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
  location_id?: string | null;
  service?: { id: string; title: string } | null;
  staff?: { id: string; name: string | Record<string, unknown> | null } | null;
};

type WaitlistResponse = { entries: WaitlistEntry[]; total?: number };

type ServiceRow = { id: string; title: string };
type TeamMember = { id: string; name?: string };

function formatDateSafe(value: unknown): string {
  if (typeof value !== "string" || !value) return "—";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "—";
  return parsed.toLocaleDateString();
}

function staffLabel(staff: WaitlistEntry["staff"]): string {
  if (!staff?.name) return "";
  if (typeof staff.name === "string") return staff.name;
  if (typeof staff.name === "object" && staff.name !== null) {
    const o = staff.name as Record<string, unknown>;
    if (typeof o.full_name === "string") return o.full_name;
  }
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

type StatusFilter = "all" | (typeof STATUS_OPTIONS)[number];

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
  const { t } = useTranslation();
  const { selectedLocationId, setSelectedLocationId, provider } = useProvider();
  const locations = useMemo(() => provider?.locations ?? [], [provider?.locations]);

  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("waiting");
  const [selected, setSelected] = useState<WaitlistEntry | null>(null);
  const [qbDate, setQbDate] = useState("");
  const [qbTime, setQbTime] = useState("09:00");

  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addPhone, setAddPhone] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addNotes, setAddNotes] = useState("");
  const [addPreferredDate, setAddPreferredDate] = useState("");
  const [addServiceId, setAddServiceId] = useState<string | null>(null);
  const [addStaffId, setAddStaffId] = useState<string | null>(null);
  const [addLocationId, setAddLocationId] = useState<string | null>(null);

  const waitlistUrl = useMemo(() => {
    const p = new URLSearchParams();
    if (statusFilter !== "all") p.set("status", statusFilter);
    if (selectedLocationId) p.set("location_id", selectedLocationId);
    const qs = p.toString();
    return `/api/provider/waitlist${qs ? `?${qs}` : ""}`;
  }, [statusFilter, selectedLocationId]);

  const { data, loading, error, refresh } = useApi<WaitlistResponse>(waitlistUrl);
  const { data: servicesRaw } = useApi<ServiceRow[]>("/api/provider/services");
  const teamUrl = selectedLocationId
    ? `/api/provider/team?location_id=${encodeURIComponent(selectedLocationId)}`
    : "/api/provider/team";
  const { data: teamRaw } = useApi<TeamMember[]>(teamUrl);

  const services = useMemo(() => (Array.isArray(servicesRaw) ? servicesRaw : []), [servicesRaw]);
  const team = useMemo(() => (Array.isArray(teamRaw) ? teamRaw : []), [teamRaw]);

  const { execute: patchWaitlist, loading: patching } = useApiMutation("patch");
  const { execute: postNotify, loading: notifying } = useApiMutation("post");
  const { execute: postQuickBook, loading: quickBooking } = useApiMutation("post");
  const { execute: deleteWaitlist, loading: deleting } = useApiMutation("delete");
  const { execute: postWaitlist, loading: adding } = useApiPost<Record<string, unknown>, unknown>("/api/provider/waitlist");

  const entries: WaitlistEntry[] = data?.entries ?? [];

  useEffect(() => {
    if (addOpen) {
      setAddLocationId(selectedLocationId ?? locations[0]?.id ?? null);
    }
  }, [addOpen, selectedLocationId, locations]);

  const openEntry = useCallback((entry: WaitlistEntry) => {
    setSelected(entry);
    setQbDate(toYmd(entry.preferred_date));
    setQbTime(toHm(entry.preferred_time_start));
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
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
      Alert.alert(t("provider.waitlistScreen.notifySentTitle"), t("provider.waitlistScreen.notifyQueued"));
      await refresh();
    },
    [postNotify, refresh, t],
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
      Alert.alert(t("provider.waitlistScreen.quickBookSuccessTitle"), t("provider.waitlistScreen.quickBookSuccessHint"));
      setSelected(null);
      await refresh();
    },
    [postQuickBook, qbDate, qbTime, refresh, t],
  );

  const removeEntry = useCallback(
    (entry: WaitlistEntry) => {
      Alert.alert(t("provider.waitlistScreen.deleteConfirmTitle"), t("provider.waitlistScreen.deleteConfirmMessage"), [
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
    [deleteWaitlist, refresh, t],
  );

  const openFullBooking = useCallback(
    (entry: WaitlistEntry) => {
      const q = new URLSearchParams();
      if (entry.preferred_date) {
        const d = toYmd(entry.preferred_date);
        q.set("date", d);
      }
      if (entry.preferred_time_start) q.set("time", toHm(entry.preferred_time_start));
      if (entry.staff_id) q.set("staff_id", entry.staff_id);
      if (entry.location_id) q.set("location_id", entry.location_id);
      q.set("walk_in", "true");
      setSelected(null);
      router.push(`/(app)/(tabs)/bookings/new?${q.toString()}` as never);
    },
    [router],
  );

  const submitAddWalkIn = useCallback(async () => {
    const name = addName.trim();
    if (!name) {
      Alert.alert("", t("provider.waitlistScreen.validationName"));
      return;
    }
    const body: Record<string, unknown> = {
      customer_name: name,
      customer_phone: addPhone.trim() || null,
      notes: addNotes.trim() || null,
      priority: 0,
    };
    const em = addEmail.trim();
    if (em) body.customer_email = em;
    if (addServiceId) body.service_id = addServiceId;
    if (addStaffId) body.staff_id = addStaffId;
    if (addLocationId) body.location_id = addLocationId;
    const pd = addPreferredDate.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(pd)) body.preferred_date = pd;

    const { error: err } = await postWaitlist(body);
    if (err) {
      Alert.alert("Error", err);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert(t("provider.waitlistScreen.addSuccess"), t("provider.waitlistScreen.addSuccessHint"));
    setAddOpen(false);
    setAddName("");
    setAddPhone("");
    setAddEmail("");
    setAddNotes("");
    setAddPreferredDate("");
    setAddServiceId(null);
    setAddStaffId(null);
    await refresh();
  }, [
    addName,
    addPhone,
    addEmail,
    addNotes,
    addPreferredDate,
    addServiceId,
    addStaffId,
    addLocationId,
    postWaitlist,
    refresh,
    t,
  ]);

  const sheetSubtitle = useMemo(() => {
    if (!selected) return undefined;
    return selected.customer_phone ?? selected.customer_email ?? undefined;
  }, [selected]);

  const filterChips: { id: StatusFilter; label: string }[] = useMemo(
    () => [
      { id: "all", label: t("provider.waitlistScreen.filterAll") },
      { id: "waiting", label: t("provider.waitlistScreen.filterWaiting") },
      { id: "contacted", label: t("provider.waitlistScreen.filterContacted") },
      { id: "booked", label: t("provider.waitlistScreen.filterBooked") },
      { id: "cancelled", label: t("provider.waitlistScreen.filterCancelled") },
    ],
    [t],
  );

  const onPickStatusFilter = useCallback((id: StatusFilter) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStatusFilter(id);
  }, []);

  const onPickScopeAll = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedLocationId(null);
  }, [setSelectedLocationId]);

  const onPickScopeLocation = useCallback(
    (id: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setSelectedLocationId(id);
    },
    [setSelectedLocationId],
  );

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title={t("provider.waitlistScreen.title")} onBack={() => router.back()} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 48 }}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title={t("provider.waitlistScreen.title")} onBack={() => router.back()} />
        <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 16 }}>
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader
        title={t("provider.waitlistScreen.title")}
        subtitle={t("provider.waitlistScreen.subtitle")}
        onBack={() => router.back()}
        rightAction={
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/(app)/(tabs)/more/settings/waitlist-settings" as never);
              }}
              style={{ height: 44, width: 44, alignItems: "center", justifyContent: "center" }}
              accessibilityRole="button"
              accessibilityLabel={t("provider.waitlistScreen.settingsA11y")}
            >
              <Ionicons name="settings-outline" size={22} color={Colors.gray[800]} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setAddOpen(true);
              }}
              style={{ height: 44, width: 44, alignItems: "center", justifyContent: "center", marginLeft: 4 }}
              accessibilityRole="button"
              accessibilityLabel={t("provider.waitlistScreen.addWalkInA11y")}
            >
              <Ionicons name="add-circle-outline" size={26} color="#0891b2" />
            </TouchableOpacity>
          </View>
        }
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginBottom: 12 }}
        contentContainerStyle={{ paddingRight: 16, gap: 8, flexDirection: "row", alignItems: "center" }}
      >
        {filterChips.map((c) => {
          const active = statusFilter === c.id;
          return (
            <TouchableOpacity
              key={c.id}
              onPress={() => onPickStatusFilter(c.id)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 9999,
                backgroundColor: active ? "#0891b2" : Colors.gray[100],
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: "600", color: active ? "#fff" : Colors.gray[800] }}>{c.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {locations.length > 1 ? (
        <View style={{ marginBottom: 12 }}>
          <Text style={{ fontSize: 12, fontWeight: "600", color: Colors.gray[500], marginBottom: 8 }}>
            {t("provider.waitlistScreen.scopeLabel")}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, flexDirection: "row" }}>
            <TouchableOpacity
              onPress={onPickScopeAll}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: selectedLocationId == null ? "#0891b2" : Colors.gray[200],
                backgroundColor: selectedLocationId == null ? "#ecfeff" : Colors.white,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: "500", color: Colors.gray[900] }}>{t("provider.waitlistScreen.scopeAll")}</Text>
            </TouchableOpacity>
            {locations.map((loc) => {
              const active = selectedLocationId === loc.id;
              return (
                <TouchableOpacity
                  key={loc.id}
                  onPress={() => onPickScopeLocation(loc.id)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: active ? "#0891b2" : Colors.gray[200],
                    backgroundColor: active ? "#ecfeff" : Colors.white,
                    maxWidth: 200,
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: "500", color: Colors.gray[900] }} numberOfLines={1}>
                    {loc.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {data?.total != null ? (
        <Text style={{ fontSize: 12, color: Colors.gray[500], marginBottom: 8 }}>
          {t("provider.waitlistScreen.totalCount", { count: data.total })}
        </Text>
      ) : null}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {entries.length === 0 ? (
          <View style={{ paddingVertical: 48, paddingHorizontal: 16, alignItems: "center" }}>
            <Ionicons name="people-outline" size={48} color="#9ca3af" />
            <Text style={{ marginTop: 16, textAlign: "center", color: Colors.gray[600], fontWeight: "600" }}>
              {t("provider.waitlistScreen.emptyTitle")}
            </Text>
            <Text style={{ marginTop: 8, textAlign: "center", fontSize: 14, color: Colors.gray[500] }}>
              {t("provider.waitlistScreen.emptyHint")}
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
                    {entry.customer_name || "—"}
                  </Text>
                  <View style={{ borderRadius: 9999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: statusBgColor(entry.status) }}>
                    <Text style={{ fontSize: 12, fontWeight: "500", color: Colors.gray[800] }}>{entry.status}</Text>
                  </View>
                </View>
                {entry.service ? <Text style={{ fontSize: 14, color: Colors.gray[600] }}>{entry.service.title}</Text> : null}
                {staffLabel(entry.staff) ? (
                  <Text style={{ fontSize: 13, color: Colors.gray[500], marginTop: 2 }}>
                    {t("provider.waitlistScreen.staffPrefix")}: {staffLabel(entry.staff)}
                  </Text>
                ) : null}
                {(entry.preferred_date || entry.customer_phone) && (
                  <Text style={{ marginTop: 4, fontSize: 12, color: Colors.gray[500] }}>
                    {entry.preferred_date ? formatDateSafe(entry.preferred_date) : ""}
                    {entry.preferred_date && entry.customer_phone ? " · " : ""}
                    {entry.customer_phone ?? ""}
                  </Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      <BottomSheet visible={addOpen} onClose={() => setAddOpen(false)} title={t("provider.waitlistScreen.sheetAddTitle")} snapHeight="full">
        <ScrollView style={{ maxHeight: Platform.OS === "ios" ? 560 : 520 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={{ fontSize: 12, fontWeight: "600", color: Colors.gray[500], marginBottom: 6 }}>{t("provider.waitlistScreen.fieldName")}</Text>
          <TextInput
            style={inputStyle}
            value={addName}
            onChangeText={setAddName}
            placeholder="Jane Doe"
            placeholderTextColor="#9ca3af"
          />

          <Text style={{ fontSize: 12, fontWeight: "600", color: Colors.gray[500], marginTop: 12, marginBottom: 6 }}>{t("provider.waitlistScreen.fieldPhone")}</Text>
          <TextInput style={inputStyle} value={addPhone} onChangeText={setAddPhone} keyboardType="phone-pad" placeholder="+27…" placeholderTextColor="#9ca3af" />

          <Text style={{ fontSize: 12, fontWeight: "600", color: Colors.gray[500], marginTop: 12, marginBottom: 6 }}>{t("provider.waitlistScreen.fieldEmail")}</Text>
          <TextInput
            style={inputStyle}
            value={addEmail}
            onChangeText={setAddEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholder="client@email.com"
            placeholderTextColor="#9ca3af"
          />

          <Text style={{ fontSize: 12, fontWeight: "600", color: Colors.gray[500], marginTop: 12, marginBottom: 6 }}>{t("provider.waitlistScreen.fieldPreferredDate")}</Text>
          <TextInput
            style={inputStyle}
            value={addPreferredDate}
            onChangeText={setAddPreferredDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#9ca3af"
          />

          <Text style={{ fontSize: 12, fontWeight: "600", color: Colors.gray[500], marginTop: 12, marginBottom: 6 }}>{t("provider.waitlistScreen.fieldNotes")}</Text>
          <TextInput
            style={[inputStyle, { minHeight: 72 }]}
            value={addNotes}
            onChangeText={setAddNotes}
            multiline
            placeholder="…"
            placeholderTextColor="#9ca3af"
          />

          {services.length > 0 ? (
            <>
              <Text style={{ fontSize: 12, fontWeight: "600", color: Colors.gray[500], marginTop: 12, marginBottom: 8 }}>{t("provider.waitlistScreen.fieldService")}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                <TouchableOpacity
                  onPress={() => setAddServiceId(null)}
                  style={chipStyle(addServiceId == null)}
                >
                  <Text style={{ fontSize: 12, fontWeight: "600", color: Colors.gray[800] }}>{t("provider.waitlistScreen.optionalNone")}</Text>
                </TouchableOpacity>
                {services.map((s) => (
                  <TouchableOpacity key={s.id} onPress={() => setAddServiceId(s.id)} style={chipStyle(addServiceId === s.id)}>
                    <Text style={{ fontSize: 12, fontWeight: "600", color: Colors.gray[800] }} numberOfLines={1}>
                      {s.title}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          ) : null}

          {team.length > 0 ? (
            <>
              <Text style={{ fontSize: 12, fontWeight: "600", color: Colors.gray[500], marginTop: 8, marginBottom: 8 }}>{t("provider.waitlistScreen.fieldStaff")}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                <TouchableOpacity onPress={() => setAddStaffId(null)} style={chipStyle(addStaffId == null)}>
                  <Text style={{ fontSize: 12, fontWeight: "600", color: Colors.gray[800] }}>{t("provider.waitlistScreen.optionalNone")}</Text>
                </TouchableOpacity>
                {team.map((m) => (
                  <TouchableOpacity key={m.id} onPress={() => setAddStaffId(m.id)} style={chipStyle(addStaffId === m.id)}>
                    <Text style={{ fontSize: 12, fontWeight: "600", color: Colors.gray[800] }} numberOfLines={1}>
                      {m.name ?? "—"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          ) : null}

          {locations.length > 0 ? (
            <>
              <Text style={{ fontSize: 12, fontWeight: "600", color: Colors.gray[500], marginTop: 8, marginBottom: 8 }}>{t("provider.waitlistScreen.scopeLabel")}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 8 }}>
                {locations.map((loc) => (
                  <TouchableOpacity key={loc.id} onPress={() => setAddLocationId(loc.id)} style={chipStyle(addLocationId === loc.id)}>
                    <Text style={{ fontSize: 12, fontWeight: "600", color: Colors.gray[800] }} numberOfLines={1}>
                      {loc.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          ) : null}

          <ActionButton label={t("provider.waitlistScreen.submitAdd")} onPress={submitAddWalkIn} loading={adding} fullWidth style={{ marginTop: 12 }} />
        </ScrollView>
      </BottomSheet>

      <BottomSheet visible={selected != null} onClose={() => setSelected(null)} title={selected?.customer_name || t("provider.waitlistScreen.title")} subtitle={sheetSubtitle} snapHeight="full">
        {selected ? (
          <ScrollView style={{ maxHeight: 520 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {selected.customer_email ? (
              <Text style={{ fontSize: 14, color: Colors.gray[600], marginBottom: 6 }}>{selected.customer_email}</Text>
            ) : null}
            {selected.notes ? (
              <Text style={{ fontSize: 14, color: Colors.gray[700], marginBottom: 12 }}>{selected.notes}</Text>
            ) : null}

            <Text style={{ fontSize: 12, fontWeight: "600", color: Colors.gray[500], marginBottom: 8, textTransform: "uppercase" }}>
              {t("provider.waitlistScreen.statusSection")}
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

            <ActionButton label={t("provider.waitlistScreen.notifyClient")} onPress={() => notifyEntry(selected.id)} loading={notifying} fullWidth />
            <Text style={{ fontSize: 12, color: Colors.gray[500], marginTop: 8, marginBottom: 16 }}>{t("provider.waitlistScreen.notifyHint")}</Text>

            <Text style={{ fontSize: 12, fontWeight: "600", color: Colors.gray[500], marginBottom: 8, textTransform: "uppercase" }}>
              {t("provider.waitlistScreen.quickBookSection")}
            </Text>
            <Text style={{ fontSize: 13, color: Colors.gray[600], marginBottom: 8 }}>{t("provider.waitlistScreen.quickBookHint")}</Text>
            <TextInput
              style={inputStyle}
              value={qbDate}
              onChangeText={setQbDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#9ca3af"
            />
            <TextInput style={[inputStyle, { marginBottom: 12 }]} value={qbTime} onChangeText={setQbTime} placeholder="HH:MM" placeholderTextColor="#9ca3af" />
            <ActionButton
              label={t("provider.waitlistScreen.quickBookButton")}
              onPress={() => quickBook(selected)}
              loading={quickBooking}
              fullWidth
            />

            <TouchableOpacity style={{ marginTop: 16, paddingVertical: 12 }} onPress={() => openFullBooking(selected)} accessibilityRole="button">
              <Text style={{ fontSize: 15, fontWeight: "600", color: "#0891b2", textAlign: "center" }}>{t("provider.waitlistScreen.fullBooking")}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={{ marginTop: 12, paddingVertical: 14, alignItems: "center" }}
              onPress={() => removeEntry(selected)}
              disabled={deleting}
            >
              <Text style={{ color: "#b91c1c", fontWeight: "700" }}>{t("provider.waitlistScreen.deleteEntry")}</Text>
            </TouchableOpacity>
          </ScrollView>
        ) : null}
      </BottomSheet>
    </ScreenContainer>
  );
}

const inputStyle = {
  borderRadius: 12,
  borderWidth: 1,
  borderColor: Colors.gray[200],
  paddingHorizontal: 14,
  paddingVertical: 12,
  fontSize: 16,
  color: Colors.gray[900],
};

function chipStyle(active: boolean) {
  return {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 8,
    backgroundColor: active ? "#e0f2fe" : Colors.gray[100],
    borderWidth: 1,
    borderColor: active ? "#0891b2" : Colors.gray[200],
    maxWidth: 220,
  } as const;
}
