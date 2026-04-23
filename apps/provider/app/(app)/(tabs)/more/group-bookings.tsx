import { useEffect, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  TextInput,
  Alert,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { useResponsive } from "@/hooks/useResponsive";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SearchBar } from "@/components/ui/SearchBar";
import { FilterChipGroup } from "@/components/ui/FilterChip";
import { StatCard } from "@/components/ui/StatCard";
import { Avatar } from "@/components/ui/Avatar";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ActionButton } from "@/components/ui/ActionButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { formatCurrency, formatDate } from "@/lib/format";
import { twStyle } from "@/lib/twStyle";
import { E164PhoneField } from "@/components/E164PhoneField";
import { validateE164Phone } from "@/lib/phone-country-codes";
import { useProvider } from "@/providers/ProviderContext";
import { buildZonedIsoForWallClock } from "@/lib/tz";
import { verticalFlatListPerf } from "@/lib/flatListPerformance";

// The list endpoint (GET /api/provider/group-bookings) maps participants to
// { client_name, client_email, client_phone, service_name, checked_in,
//   checked_in_time, checked_out, checked_out_time, price, ... }
// while the participant-create endpoint historically returned
// { customer_name, customer_email, customer_phone, status, paid, ... }.
// We accept both shapes here and normalise in the row renderer so mobile
// never crashes when the backend tweaks the payload.
interface Participant {
  id: string;
  // Historic / create-endpoint shape
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  // List-endpoint shape
  client_name?: string;
  client_phone?: string;
  client_email?: string;
  participant_name?: string;
  participant_phone?: string;
  participant_email?: string;
  status?: string;
  paid?: boolean;
  // Check-in/out (list endpoint uses _time suffix, DB uses _at)
  checked_in?: boolean;
  checked_in_time?: string | null;
  checked_in_at?: string | null;
  checked_out?: boolean;
  checked_out_time?: string | null;
  checked_out_at?: string | null;
  service_name?: string | null;
  price?: number;
}

interface GroupBooking {
  id: string;
  title?: string | null;
  scheduled_date: string;
  scheduled_time: string;
  duration_minutes: number;
  max_participants?: number;
  current_participants?: number;
  team_member_id: string | null;
  team_member_name?: string | null;
  service_id: string | null;
  service_name?: string | null;
  total_price: number;
  price_per_person?: number;
  status: string;
  notes: string | null;
  location_id: string | null;
  location_name?: string | null;
  ref_number: string | null;
  participants?: Participant[];
  created_at: string;
  // §Provider-audit 2026-04 (packages round 3 — mobile parity): the
  // group_bookings row already stores `package_id` (migration 520) and
  // `GET /api/provider/group-bookings` selects `*`, so we get it back from
  // the list endpoint. Keep it typed so the create / detail sheet can
  // show the attached package name + pass the id through on edits.
  package_id?: string | null;
}

/** Package list item from `GET /api/provider/packages` (shape mirrors
 *  `apps/provider/app/(app)/(tabs)/more/bookings/new.tsx`). */
interface PackageItem {
  id: string;
  offering_id?: string | null;
  product_id?: string | null;
  quantity?: number;
  offering?: {
    id: string;
    title?: string | null;
    name?: string | null;
    duration_minutes?: number | null;
    price?: number | null;
  } | null;
  product?: { id: string; name?: string | null; retail_price?: number | null } | null;
}

interface PackageRow {
  id: string;
  name: string;
  description?: string | null;
  price?: number | null;
  discount_percentage?: number | null;
  is_active?: boolean;
  items?: PackageItem[];
}

interface GroupBookingsResponse {
  data: GroupBooking[];
  total: number;
  page: number;
  total_pages: number;
}

const STATUS_FILTERS = [
  { label: "All", value: "all" },
  { label: "Confirmed", value: "confirmed" },
  { label: "Booked", value: "booked" },
  { label: "In progress", value: "started" },
  { label: "Completed", value: "completed" },
  { label: "Cancelled", value: "cancelled" },
];

type ServiceRow = { id: string; title: string; duration_minutes?: number; price?: number };
type TeamRow = { id: string; name?: string };

function statusStyle(s: string) {
  if (s === "confirmed") return { bg: "bg-blue-50", text: "text-blue-700" };
  if (s === "booked") return { bg: "bg-indigo-50", text: "text-indigo-700" };
  if (s === "pending") return { bg: "bg-slate-50", text: "text-slate-600" };
  if (s === "started") return { bg: "bg-amber-50", text: "text-amber-700" };
  if (s === "completed") return { bg: "bg-green-50", text: "text-green-700" };
  if (s === "cancelled") return { bg: "bg-red-50", text: "text-red-700" };
  return { bg: "bg-gray-100", text: "text-gray-500" };
}

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM_RE = /^\d{2}:\d{2}$/;

function SelectChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        twStyle("rounded-full border px-3 py-2"),
        selected ? twStyle("border-indigo-600 bg-indigo-50") : twStyle("border-gray-200 bg-gray-50"),
        { marginRight: 8, maxWidth: 220 },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <Text
        style={twStyle(`text-xs font-medium ${selected ? "text-indigo-800" : "text-gray-700"}`)}
        numberOfLines={1}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export default function GroupBookingsScreen() {
  useResponsive();
  const router = useRouter();
  const { provider, selectedLocationId } = useProvider();
  const providerTz = provider?.timezone ?? null;
  const locations = provider?.locations ?? [];

  const { data: servicesRaw } = useApi<ServiceRow[]>("/api/provider/services");
  const teamUrl = selectedLocationId
    ? `/api/provider/team?location_id=${encodeURIComponent(selectedLocationId)}`
    : "/api/provider/team";
  const { data: teamRaw } = useApi<TeamRow[]>(teamUrl);
  // §Provider-audit 2026-04 (packages round 3 — mobile parity): fetch the
  // provider's catalog packages so the create sheet can attach a
  // `package_id` to a group booking (parity with `GroupBookingDialog` on
  // web). Endpoint returns `{ data: { packages: [...] } }` via the
  // `successResponse` helper, so `useApi` unwraps the outer `data` and we
  // access `.packages` here. Filtered to active packages with at least one
  // item to avoid showing broken catalog entries.
  const packagesUrl = selectedLocationId
    ? `/api/provider/packages?location_id=${encodeURIComponent(selectedLocationId)}`
    : "/api/provider/packages";
  const { data: packagesRaw } = useApi<{ packages?: PackageRow[] }>(packagesUrl);
  const services = useMemo(() => (Array.isArray(servicesRaw) ? servicesRaw : []), [servicesRaw]);
  const teamMembers = useMemo(() => (Array.isArray(teamRaw) ? teamRaw : []), [teamRaw]);
  const packagesList = useMemo<PackageRow[]>(
    () =>
      (packagesRaw?.packages ?? []).filter(
        (p) => p.is_active !== false && Array.isArray(p.items) && p.items.length > 0,
      ),
    [packagesRaw],
  );
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [refreshing, setRefreshing] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<GroupBooking | null>(null);
  const [showAddParticipant, setShowAddParticipant] = useState(false);
  const [participantForm, setParticipantForm] = useState({ name: "", phone: "", email: "" });
  const [showEdit, setShowEdit] = useState(false);
  // B9: persist the id the edit sheet is operating on so a PATCH never goes
  // out to `/api/provider/group-bookings/` with an empty id after we clear
  // `selectedGroup` (which we do so the detail sheet closes under the edit
  // sheet on iOS).
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    date: "",
    time: "",
    duration: "",
    notes: "",
    maxParticipants: "",
    // §Provider-audit 2026-04 (packages round 4 — mobile edit parity):
    // the web `GroupBookingDialog` allows attach/swap of `package_id` when
    // editing an existing group booking. Mirror that on mobile so providers
    // no longer need to switch to the web portal just to re-link / detach
    // a package. `""` = no package, any id = attached, `"__DETACH__"` is a
    // sentinel we use internally to send `package_id: null` to the server.
    packageId: "",
    // Track the original id so we only send `package_id` in the PATCH
    // payload when it actually changed. Avoids clobbering the server-side
    // row with a no-op write on edits that didn't touch the package.
    originalPackageId: "",
  });
  const [showEditPackagePicker, setShowEditPackagePicker] = useState(false);

  // B10: create path — minimal form. Participants are added from the detail
  // sheet after the group is created, matching the existing "add participant"
  // flow.
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    title: "",
    date: "",
    time: "",
    duration: "60",
    maxParticipants: "10",
    notes: "",
    serviceId: "" as string,
    staffId: "" as string,
    locationId: "" as string,
    // §Provider-audit 2026-04 (packages round 3): track the attached
    // service_package so the POST payload can include `package_id` like
    // the web `GroupBookingDialog` does.
    packageId: "" as string,
  });
  const [showPackagePicker, setShowPackagePicker] = useState(false);

  const statusParam = filter !== "all" ? `&status=${filter}` : "";
  const { data: groupData, loading, error: groupError, refresh } = useApi<GroupBookingsResponse>(
    `/api/provider/group-bookings?limit=50${statusParam}`
  );
  const { execute: updateGroup, loading: updatingGroup } = useApiMutation("patch");
  const { execute: createGroup, loading: creatingGroup } = useApiMutation("post");
  const { execute: cancelGroup } = useApiMutation("delete");
  const { execute: addParticipant, loading: addingParticipant } = useApiMutation("post");
  const { execute: removeParticipant } = useApiMutation("delete");
  // Wave 4.1 (audit 2026-04 final 100/100): provider mobile check-in / out
  // parity with web. Check-in endpoint:
  //   POST /api/provider/group-bookings/:id/participants/:pid/check-in
  // Check-out endpoint:
  //   POST /api/provider/group-bookings/:id/participants/:pid/check-out
  const { execute: checkInParticipant } = useApiMutation("post");
  const { execute: checkOutParticipant } = useApiMutation("post");

  const groups = useMemo(() => groupData?.data ?? [], [groupData?.data]);

  // §Provider-audit 2026-04 (round 6): keep `selectedGroup` in sync with
  // the refreshed list. Previously the detail sheet stored a snapshot, so
  // after a check-in / add-participant / cancel the sheet still rendered
  // the stale participant list until the user closed & reopened it.
  useEffect(() => {
    if (!selectedGroup) return;
    const fresh = groups.find((g) => g.id === selectedGroup.id);
    if (fresh && fresh !== selectedGroup) {
      setSelectedGroup(fresh);
    }
  }, [groups, selectedGroup]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const filtered = useMemo(() => {
    if (!search.trim()) return groups;
    const q = search.toLowerCase();
    return groups.filter(
      (g) =>
        g.ref_number?.toLowerCase().includes(q) ||
        g.service_name?.toLowerCase().includes(q) ||
        g.team_member_name?.toLowerCase().includes(q) ||
        g.scheduled_date?.includes(q)
    );
  }, [groups, search]);

  const stats = useMemo(() => {
    const activeStatuses = new Set(["pending", "confirmed", "booked", "started"]);
    const upcoming = groups.filter((g) => activeStatuses.has(g.status)).length;
    const totalParticipants = groups.reduce((s, g) => s + (g.current_participants ?? 0), 0);
    const revenue = groups
      .filter((g) => g.status === "completed")
      .reduce((s, g) => s + (Number(g.total_price) || 0), 0);
    return { total: groupData?.total ?? groups.length, upcoming, totalParticipants, revenue };
  }, [groups, groupData]);

  async function handleCancel(group: GroupBooking) {
    Alert.alert("Cancel Group Booking", "This will cancel the entire group session.", [
      { text: "Keep", style: "cancel" },
      {
        text: "Cancel Booking",
        style: "destructive",
        onPress: async () => {
          const { error } = await cancelGroup(`/api/provider/group-bookings/${group.id}`);
          if (error) Alert.alert("Error", error);
          else {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setSelectedGroup(null);
            refresh();
          }
        },
      },
    ]);
  }

  async function handleStatusChange(group: GroupBooking, newStatus: string) {
    const { error } = await updateGroup(`/api/provider/group-bookings/${group.id}`, {
      status: newStatus,
    });
    if (error) { Alert.alert("Error", error); return; }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSelectedGroup(null);
    refresh();
  }

  function openEdit(group: GroupBooking) {
    const pkgId = group.package_id ?? "";
    setEditForm({
      date: group.scheduled_date,
      time: group.scheduled_time?.substring(0, 5) ?? "",
      duration: String(group.duration_minutes),
      notes: group.notes ?? "",
      maxParticipants: String(group.max_participants ?? ""),
      packageId: pkgId,
      originalPackageId: pkgId,
    });
    // B9: capture the id BEFORE clearing selectedGroup so the PATCH has a
    // real target even after the detail sheet closes.
    setEditingGroupId(group.id);
    setSelectedGroup(null);
    setShowEdit(true);
  }

  /**
   * §Provider-audit 2026-04 (packages round 4 — mobile edit parity):
   * apply a selected package (or detach) to the edit form. Unlike the
   * create path we do NOT auto-rewrite duration / service here — editing
   * an existing group can have staff & participants already attached,
   * silently shifting duration would be surprising. Web portal does the
   * same: changing the package on an existing booking only swaps the
   * `package_id` link (reporting + discount math); timing changes are
   * explicit edits by the user.
   */
  function applyPackageToEditForm(pkg: PackageRow | null) {
    if (!pkg) {
      setEditForm((p) => ({ ...p, packageId: "" }));
      Haptics.selectionAsync().catch(() => {});
      return;
    }
    setEditForm((p) => ({ ...p, packageId: pkg.id }));
    Haptics.selectionAsync().catch(() => {});
  }

  async function handleSaveEdit() {
    // B9: refuse to fire a PATCH without an id. Previously this would hit
    // `/api/provider/group-bookings/` which 404'd the group bookings list
    // endpoint (no PATCH there), silently losing the edit.
    if (!editingGroupId) {
      Alert.alert("Error", "No group booking selected for edit.");
      return;
    }

    if (editForm.date && !YMD_RE.test(editForm.date)) {
      Alert.alert("Invalid date", "Date must be in YYYY-MM-DD format.");
      return;
    }
    if (editForm.time && !HHMM_RE.test(editForm.time)) {
      Alert.alert("Invalid time", "Time must be in HH:MM format.");
      return;
    }

    // §Provider-audit 2026-04 (packages round 4 — mobile edit parity):
    // only include `package_id` when it actually changed. `null` means
    // explicit detach — `/api/provider/group-bookings/[id]` allows
    // `package_id` in its allowlist and accepts null via `body.package_id`
    // to clear the link.
    const packageChanged = editForm.packageId !== editForm.originalPackageId;
    const packageIdPayload = packageChanged
      ? { package_id: editForm.packageId ? editForm.packageId : null }
      : {};

    const { error } = await updateGroup(
      `/api/provider/group-bookings/${encodeURIComponent(editingGroupId)}`,
      {
        scheduled_date: editForm.date || undefined,
        scheduled_time: editForm.time || undefined,
        duration_minutes: editForm.duration ? Number(editForm.duration) : undefined,
        notes: editForm.notes.trim() || undefined,
        max_participants: editForm.maxParticipants ? Number(editForm.maxParticipants) : undefined,
        ...packageIdPayload,
      }
    );
    if (error) { Alert.alert("Error", error); return; }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowEdit(false);
    setEditingGroupId(null);
    refresh();
  }

  // B10: create a new group booking from the mobile provider app. Minimal
  // required fields (date/time/duration). Service/staff/location can be
  // filled in later via the edit sheet or the web portal.
  function openCreate() {
    const now = new Date();
    const hh = String(Math.min(23, now.getHours() + 1)).padStart(2, "0");
    const defaultLoc = selectedLocationId ?? locations[0]?.id ?? "";
    setCreateForm({
      title: "",
      date: now.toISOString().slice(0, 10),
      time: `${hh}:00`,
      duration: "60",
      maxParticipants: "10",
      notes: "",
      serviceId: "",
      staffId: "",
      locationId: defaultLoc,
      packageId: "",
    });
    setShowCreate(true);
  }

  /**
   * §Provider-audit 2026-04 (packages round 3): attach a package to the
   * create form. Mirrors `GroupBookingDialog.handleAddPackage` on web but
   * is simpler — the mobile create sheet doesn't expose a per-participant
   * picker (participants are added from the detail sheet after creation),
   * so we just adopt the first service item's offering as the group's
   * default service and sum the package's service durations into the
   * group duration. Server-side `group_bookings` stores only `package_id`
   * + `service_id` + `duration_minutes`, which is exactly what we're
   * writing here.
   */
  function applyPackageToCreateForm(pkg: PackageRow | null) {
    if (!pkg) {
      setCreateForm((p) => ({ ...p, packageId: "" }));
      return;
    }
    const serviceItems = (pkg.items ?? []).filter(
      (it) => !!it.offering_id || !!it.offering?.id,
    );
    const firstService = serviceItems[0];
    const firstServiceId =
      firstService?.offering_id ?? firstService?.offering?.id ?? "";

    // Prefer a service the provider already has in their service list so
    // downstream UI (service chips) can highlight it.
    const matchedService =
      firstServiceId ? services.find((s) => s.id === firstServiceId) : undefined;

    // Package duration = sum of service item durations (weighted by qty),
    // falling back to whatever is currently in the form.
    const totalDuration = serviceItems.reduce((acc, it) => {
      const d = Number(it.offering?.duration_minutes ?? 0);
      const q = Number(it.quantity ?? 1);
      return acc + (Number.isFinite(d) && d > 0 ? d * (Number.isFinite(q) && q > 0 ? q : 1) : 0);
    }, 0);

    setCreateForm((p) => {
      const next = { ...p, packageId: pkg.id };
      if (firstServiceId) {
        next.serviceId = firstServiceId;
      }
      if (!p.title.trim()) {
        next.title = pkg.name;
      }
      if (totalDuration > 0) {
        next.duration = String(totalDuration);
      } else if (matchedService?.duration_minutes && matchedService.duration_minutes > 0) {
        next.duration = String(matchedService.duration_minutes);
      }
      return next;
    });
    Haptics.selectionAsync().catch(() => {});
  }

  async function handleCreate() {
    if (!YMD_RE.test(createForm.date)) {
      Alert.alert("Invalid date", "Date must be in YYYY-MM-DD format.");
      return;
    }
    if (!HHMM_RE.test(createForm.time)) {
      Alert.alert("Invalid time", "Time must be in HH:MM format.");
      return;
    }
    const duration = Number(createForm.duration);
    if (!Number.isFinite(duration) || duration <= 0) {
      Alert.alert("Invalid duration", "Duration must be greater than 0 minutes.");
      return;
    }
    const maxParticipants = Number(createForm.maxParticipants);
    if (!Number.isFinite(maxParticipants) || maxParticipants <= 0) {
      Alert.alert("Invalid max participants", "Max participants must be greater than 0.");
      return;
    }

    const scheduledAt = buildZonedIsoForWallClock(
      createForm.date,
      createForm.time.substring(0, 5),
      providerTz,
    );
    if (!Number.isFinite(Date.parse(scheduledAt))) {
      Alert.alert("Invalid date/time", "Please enter a valid date and time.");
      return;
    }

    const svc = createForm.serviceId ? services.find((s) => s.id === createForm.serviceId) : undefined;
    const payload: Record<string, unknown> = {
      title: createForm.title.trim() || svc?.title || "Group Session",
      scheduled_at: scheduledAt,
      duration_minutes: duration,
      max_participants: maxParticipants,
      notes: createForm.notes.trim() || undefined,
    };
    if (createForm.serviceId) {
      payload.service_id = createForm.serviceId;
      payload.service_name = svc?.title;
    }
    if (createForm.staffId) payload.staff_id = createForm.staffId;
    if (createForm.locationId) payload.location_id = createForm.locationId;
    // §Provider-audit 2026-04 (packages round 3): attach the selected
    // service_package so downstream reporting + discount math apply,
    // matching the web `GroupBookingDialog` submit path.
    if (createForm.packageId) payload.package_id = createForm.packageId;

    const { error } = await createGroup("/api/provider/group-bookings", payload);
    if (error) { Alert.alert("Error", error); return; }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowCreate(false);
    refresh();
  }

  function openAddParticipant() {
    setParticipantForm({ name: "", phone: "", email: "" });
    setShowAddParticipant(true);
  }

  async function handleAddParticipant() {
    if (!selectedGroup || !participantForm.name.trim()) {
      Alert.alert("Required", "Participant name is required");
      return;
    }
    const phoneErr = validateE164Phone(participantForm.phone);
    if (phoneErr) {
      Alert.alert("Invalid phone", phoneErr);
      return;
    }
    const { error } = await addParticipant(
      `/api/provider/group-bookings/${selectedGroup.id}/participants`,
      {
        participant_name: participantForm.name.trim(),
        participant_phone: participantForm.phone.trim() || undefined,
        participant_email: participantForm.email.trim() || undefined,
        customer_name: participantForm.name.trim(),
        customer_phone: participantForm.phone.trim() || undefined,
        customer_email: participantForm.email.trim() || undefined,
      }
    );
    if (error) { Alert.alert("Error", error); return; }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowAddParticipant(false);
    refresh();
  }

  async function handleCheckIn(participant: Participant) {
    if (!selectedGroup) return;
    const { error } = await checkInParticipant(
      `/api/provider/group-bookings/${selectedGroup.id}/participants/${participant.id}/check-in`,
      {},
    );
    if (error) {
      Alert.alert("Error", error);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    refresh();
  }

  async function handleCheckOut(participant: Participant) {
    if (!selectedGroup) return;
    const { error } = await checkOutParticipant(
      `/api/provider/group-bookings/${selectedGroup.id}/participants/${participant.id}/check-out`,
      {},
    );
    if (error) {
      Alert.alert("Error", error);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    refresh();
  }

  async function handleRemoveParticipant(participant: Participant) {
    if (!selectedGroup) return;
    const displayName =
      participant.customer_name ||
      participant.client_name ||
      participant.participant_name ||
      "this participant";
    Alert.alert("Remove Participant", `Remove ${displayName}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          const { error } = await removeParticipant(
            `/api/provider/group-bookings/${selectedGroup.id}/participants/${participant.id}`
          );
          if (error) Alert.alert("Error", error);
          else refresh();
        },
      },
    ]);
  }

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title="Group Bookings"
        showBack
        subtitle={`${stats.total} groups · ${stats.upcoming} upcoming`}
        rightAction={
          <TouchableOpacity
            onPress={openCreate}
            style={twStyle("flex-row items-center rounded-full bg-indigo-600 px-3 py-1.5")}
            hitSlop={8}
            accessibilityLabel="Create group booking"
            accessibilityRole="button"
          >
            <Ionicons name="add" size={16} color="#ffffff" style={{ marginRight: 4 }} />
            <Text style={twStyle("text-xs font-semibold text-white")}>New</Text>
          </TouchableOpacity>
        }
      />

      <View style={{ flex: 1, minHeight: 0 }}>
      <View style={twStyle("mb-3 flex-row")}>
        <View style={[twStyle("flex-1"), { marginRight: 8 }]}>
          <StatCard title="Total" value={String(stats.total)} icon="people-outline" iconColor="#6366f1" iconBg="bg-indigo-50" compact />
        </View>
        <View style={[twStyle("flex-1"), { marginRight: 8 }]}>
          <StatCard title="People" value={String(stats.totalParticipants)} icon="person-outline" iconColor="#3b82f6" iconBg="bg-blue-50" compact />
        </View>
        <View style={twStyle("flex-1")}>
          <StatCard title="Revenue" value={formatCurrency(stats.revenue)} icon="cash-outline" iconColor="#22c55e" iconBg="bg-green-50" compact />
        </View>
      </View>

      <SearchBar value={search} onChangeText={setSearch} placeholder="Search by ref, service, staff..." />

      <View style={twStyle("my-3")}>
        <FilterChipGroup options={STATUS_FILTERS} selected={filter} onSelect={setFilter} />
      </View>

      {loading && !groups.length ? (
        <SkeletonList rows={4} />
      ) : groupError && !groups.length ? (
        <ErrorState message={groupError} onRetry={refresh} />
      ) : filtered.length === 0 ? (
        <EmptyState icon="people-outline" title="No group bookings" description="Group sessions will appear here" />
      ) : (
        <FlatList
          {...verticalFlatListPerf}
          data={filtered}
          keyExtractor={(g: GroupBooking) => g.id}
          style={{ flex: 1, minHeight: 0 }}
          showsVerticalScrollIndicator={true}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          contentContainerStyle={{ paddingBottom: 120 }}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          renderItem={({ item: group }: { item: GroupBooking }) => {
            const ss = statusStyle(group.status);
            return (
              <TouchableOpacity
                style={twStyle("rounded-xl border border-gray-100 bg-white p-4")}
                onPress={() => setSelectedGroup(group)}
                activeOpacity={0.7}
              >
                <View style={twStyle("flex-row items-start justify-between")}>
                  <View style={twStyle("flex-1")}>
                    <View style={twStyle("flex-row items-center")}>
                      <Text style={[twStyle("text-base font-semibold text-gray-900"), { marginRight: 8 }]}>
                        {group.title?.trim() || group.service_name || group.ref_number || "Group Session"}
                      </Text>
                      <View style={twStyle(`rounded-full px-2 py-0.5 ${ss.bg}`)}>
                        <Text style={twStyle(`text-[10px] font-medium capitalize ${ss.text}`)}>
                          {group.status}
                        </Text>
                      </View>
                    </View>
                    <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>
                      {formatDate(group.scheduled_date)} at {group.scheduled_time?.substring(0, 5)} · {group.duration_minutes}min
                    </Text>
                    <View style={twStyle("mt-1.5 flex-row items-center")}>
                      {group.team_member_name && (
                        <View style={[twStyle("flex-row items-center"), { marginRight: 12 }]}>
                          <Ionicons name="person-outline" size={12} color="#6b7280" style={{ marginRight: 4 }} />
                          <Text style={twStyle("text-xs text-gray-500")}>{group.team_member_name}</Text>
                        </View>
                      )}
                      <View style={twStyle("flex-row items-center")}>
                        <Ionicons name="people-outline" size={12} color="#6b7280" style={{ marginRight: 4 }} />
                        <Text style={twStyle("text-xs text-gray-500")}>
                          {group.current_participants ?? 0}
                          {group.max_participants ? `/${group.max_participants}` : ""} participants
                        </Text>
                      </View>
                    </View>
                  </View>
                  <Text style={twStyle("text-base font-bold text-gray-900")}>
                    {formatCurrency(Number(group.total_price) || 0)}
                  </Text>
                </View>

                {group.ref_number && (
                  <Text style={twStyle("mt-1 text-[10px] text-gray-400")}>#{group.ref_number}</Text>
                )}
              </TouchableOpacity>
            );
          }}
        />
      )}

      </View>

      {/* Group detail sheet */}
      <BottomSheet
        visible={!!selectedGroup && !showEdit && !showAddParticipant}
        onClose={() => setSelectedGroup(null)}
        title={
          selectedGroup?.title?.trim() ||
          selectedGroup?.service_name ||
          selectedGroup?.ref_number ||
          "Group Session"
        }
      >
        {selectedGroup && (
          <View>
            <View style={twStyle("mb-3 flex-row items-center justify-between")}>
              <Text style={twStyle("text-sm text-gray-500")}>
                {formatDate(selectedGroup.scheduled_date)} at {selectedGroup.scheduled_time?.substring(0, 5)}
              </Text>
              <View style={twStyle(`rounded-full px-3 py-1 ${statusStyle(selectedGroup.status).bg}`)}>
                <Text style={twStyle(`text-xs font-medium capitalize ${statusStyle(selectedGroup.status).text}`)}>
                  {selectedGroup.status}
                </Text>
              </View>
            </View>

            <View style={twStyle("mb-3 rounded-xl border border-gray-200 bg-gray-50 p-3")}>
              <View style={twStyle("flex-row justify-between mb-1")}>
                <Text style={twStyle("text-sm text-gray-500")}>Duration</Text>
                <Text style={twStyle("text-sm text-gray-700")}>{selectedGroup.duration_minutes} min</Text>
              </View>
              {selectedGroup.team_member_name && (
                <View style={twStyle("flex-row justify-between mb-1")}>
                  <Text style={twStyle("text-sm text-gray-500")}>Staff</Text>
                  <Text style={twStyle("text-sm text-gray-700")}>{selectedGroup.team_member_name}</Text>
                </View>
              )}
              {/* §Provider-audit 2026-04 (packages round 3): show the
                  attached service package name when the row has one, so
                  providers can visually confirm the package link exists.
                  Falls back to a neutral label if the package list hasn't
                  loaded yet or was since deleted from the catalog. */}
              {selectedGroup.package_id ? (
                <View style={twStyle("flex-row justify-between mb-1")}>
                  <Text style={twStyle("text-sm text-gray-500")}>Package</Text>
                  <Text style={twStyle("text-sm text-gray-700")} numberOfLines={1}>
                    {packagesList.find((p) => p.id === selectedGroup.package_id)?.name ?? "Attached"}
                  </Text>
                </View>
              ) : null}
              {selectedGroup.price_per_person && (
                <View style={twStyle("flex-row justify-between mb-1")}>
                  <Text style={twStyle("text-sm text-gray-500")}>Per Person</Text>
                  <Text style={twStyle("text-sm text-gray-700")}>{formatCurrency(selectedGroup.price_per_person)}</Text>
                </View>
              )}
              <View style={twStyle("flex-row justify-between mb-1")}>
                <Text style={twStyle("text-sm text-gray-500")}>Participants</Text>
                <Text style={twStyle("text-sm text-gray-700")}>
                  {selectedGroup.current_participants ?? 0}
                  {selectedGroup.max_participants ? ` / ${selectedGroup.max_participants}` : ""}
                </Text>
              </View>
              <View style={twStyle("mt-1 border-t border-gray-200 pt-2 flex-row justify-between")}>
                <Text style={twStyle("text-base font-bold text-gray-900")}>Total</Text>
                <Text style={twStyle("text-base font-bold text-gray-900")}>
                  {formatCurrency(Number(selectedGroup.total_price) || 0)}
                </Text>
              </View>
            </View>

            {selectedGroup.notes && (
              <View style={twStyle("mb-3 rounded-lg bg-gray-50 p-3")}>
                <Text style={twStyle("text-xs text-gray-600")}>{selectedGroup.notes}</Text>
              </View>
            )}

            {/* Participants */}
            <View style={twStyle("mb-3")}>
              <View style={twStyle("flex-row items-center justify-between mb-2")}>
                <Text style={twStyle("text-xs font-semibold uppercase text-gray-400")}>Participants</Text>
                {selectedGroup.status !== "completed" && selectedGroup.status !== "cancelled" && (
                  <TouchableOpacity
                    style={[twStyle("flex-row items-center"), { marginRight: 4 }]}
                    onPress={openAddParticipant}
                  >
                    <Ionicons name="add-circle-outline" size={16} color="#6366f1" style={{ marginRight: 4 }} />
                    <Text style={twStyle("text-xs font-medium text-indigo-600")}>Add</Text>
                  </TouchableOpacity>
                )}
              </View>

              {(selectedGroup.participants ?? []).length === 0 ? (
                <View style={twStyle("rounded-lg bg-gray-50 p-3")}>
                  <Text style={twStyle("text-center text-xs text-gray-400")}>No participants yet</Text>
                </View>
              ) : (
                (selectedGroup.participants ?? []).map((p) => {
                  const displayName =
                    p.customer_name ||
                    p.client_name ||
                    p.participant_name ||
                    "Guest";
                  const displayPhone =
                    p.customer_phone || p.client_phone || p.participant_phone;
                  const checkedIn =
                    p.checked_in === true ||
                    !!p.checked_in_time ||
                    !!p.checked_in_at;
                  const checkedOut =
                    p.checked_out === true ||
                    !!p.checked_out_time ||
                    !!p.checked_out_at;
                  const isCheckedIn = checkedIn && !checkedOut;
                  const isCheckedOut = checkedOut;
                  const canCheckInOut =
                    selectedGroup.status !== "completed" &&
                    selectedGroup.status !== "cancelled";
                  return (
                    <View key={p.id} style={twStyle("mb-1.5 rounded-lg bg-gray-50 p-3")}>
                      <View style={twStyle("flex-row items-center")}>
                        <Avatar name={displayName} size="sm" />
                        <View style={twStyle("ml-2 flex-1")}>
                          <Text style={twStyle("text-sm font-medium text-gray-900")}>{displayName}</Text>
                          {p.service_name ? (
                            <Text style={twStyle("text-xs text-gray-500")}>{p.service_name}</Text>
                          ) : null}
                          {displayPhone && (
                            <Text style={twStyle("text-xs text-gray-400")}>{displayPhone}</Text>
                          )}
                        </View>
                        <View style={twStyle("flex-row items-center")}>
                          <View style={[twStyle(`rounded-full px-2 py-0.5 ${(Number((p as Participant & { price?: number }).price) || 0) > 0 ? "bg-green-50" : "bg-amber-50"}`), { marginRight: 8 }]}>
                            <Text style={twStyle(`text-[10px] font-medium ${(Number((p as Participant & { price?: number }).price) || 0) > 0 ? "text-green-700" : "text-amber-700"}`)}>
                              {(Number((p as Participant & { price?: number }).price) || 0) > 0
                                ? formatCurrency(Number((p as Participant & { price?: number }).price) || 0)
                                : "No price"}
                            </Text>
                          </View>
                          {canCheckInOut && (
                            <TouchableOpacity onPress={() => handleRemoveParticipant(p)} hitSlop={8}>
                              <Ionicons name="close-circle" size={18} color="#ef4444" />
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                      {canCheckInOut && (
                        <View style={twStyle("mt-2 flex-row")}>
                          {!isCheckedIn && !isCheckedOut ? (
                            <TouchableOpacity
                              onPress={() => handleCheckIn(p)}
                              style={[
                                twStyle("flex-1 flex-row items-center justify-center rounded-md bg-blue-50 py-2"),
                                { marginRight: 8 },
                              ]}
                              accessibilityRole="button"
                              accessibilityLabel={`Check in ${p.customer_name}`}
                            >
                              <Ionicons name="log-in-outline" size={14} color="#1d4ed8" style={{ marginRight: 4 }} />
                              <Text style={twStyle("text-xs font-semibold text-blue-700")}>Check in</Text>
                            </TouchableOpacity>
                          ) : null}
                          {isCheckedIn ? (
                            <TouchableOpacity
                              onPress={() => handleCheckOut(p)}
                              style={[
                                twStyle("flex-1 flex-row items-center justify-center rounded-md bg-green-50 py-2"),
                                { marginRight: 8 },
                              ]}
                              accessibilityRole="button"
                              accessibilityLabel={`Check out ${p.customer_name}`}
                            >
                              <Ionicons name="log-out-outline" size={14} color="#15803d" style={{ marginRight: 4 }} />
                              <Text style={twStyle("text-xs font-semibold text-green-700")}>Check out</Text>
                            </TouchableOpacity>
                          ) : null}
                          {isCheckedOut ? (
                            <View style={twStyle("flex-1 flex-row items-center justify-center rounded-md bg-gray-100 py-2")}>
                              <Ionicons name="checkmark-done-outline" size={14} color="#4b5563" style={{ marginRight: 4 }} />
                              <Text style={twStyle("text-xs font-semibold text-gray-600")}>Completed</Text>
                            </View>
                          ) : null}
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </View>

            {/*
              §Provider-launch (audit 2026-04): refunds happen on
              individual participant bookings (there's no group-level
              refund endpoint). The mobile list previously had no
              entrypoint at all, so providers had to switch to the web
              portal.  This routes them to the filtered bookings list
              where the existing per-booking refund action lives.
            */}
            {selectedGroup.status !== "cancelled" ? (
              <TouchableOpacity
                style={twStyle("mb-3 flex-row items-center justify-center rounded-lg bg-amber-50 py-2.5")}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  const groupId = selectedGroup.id;
                  setSelectedGroup(null);
                  Alert.alert(
                    "Refund participant",
                    "Refunds are issued against each participant's individual booking. You'll be taken to the bookings list — open the booking you want to refund and use the refund action inside.",
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Open bookings",
                        onPress: () => {
                          router.push({
                            pathname: "/(app)/(tabs)/more/bookings",
                            params: { group_booking_id: groupId },
                          } as never);
                        },
                      },
                    ],
                  );
                }}
                accessibilityRole="button"
                accessibilityLabel="Refund a participant"
              >
                <Ionicons name="cash-outline" size={16} color="#b45309" />
                <Text style={[twStyle("text-sm font-medium text-amber-700"), { marginLeft: 6 }]}>
                  Refund a participant
                </Text>
              </TouchableOpacity>
            ) : null}

            {/* Actions */}
            {selectedGroup.status !== "completed" && selectedGroup.status !== "cancelled" && (
              <View style={twStyle("flex-row")}>
                <TouchableOpacity
                  style={[twStyle("flex-1 items-center rounded-lg bg-indigo-50 py-2.5"), { marginRight: 8 }]}
                  onPress={() => openEdit(selectedGroup)}
                >
                  <Text style={twStyle("text-sm font-medium text-indigo-700")}>Edit</Text>
                </TouchableOpacity>
                {selectedGroup.status === "confirmed" && (
                  <TouchableOpacity
                    style={[twStyle("flex-1 items-center rounded-lg bg-green-50 py-2.5"), { marginRight: 8 }]}
                    onPress={() => handleStatusChange(selectedGroup, "started")}
                  >
                    <Text style={twStyle("text-sm font-medium text-green-700")}>Start</Text>
                  </TouchableOpacity>
                )}
                {selectedGroup.status === "started" && (
                  <TouchableOpacity
                    style={[twStyle("flex-1 items-center rounded-lg bg-green-50 py-2.5"), { marginRight: 8 }]}
                    onPress={() => handleStatusChange(selectedGroup, "completed")}
                  >
                    <Text style={twStyle("text-sm font-medium text-green-700")}>Complete</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[twStyle("flex-1 items-center rounded-lg bg-red-50 py-2.5"), { marginRight: 8 }]}
                  onPress={() => handleCancel(selectedGroup)}
                >
                  <Text style={twStyle("text-sm font-medium text-red-700")}>Cancel</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </BottomSheet>

      {/* Edit form */}
      <BottomSheet
        visible={showEdit && !showEditPackagePicker}
        onClose={() => {
          setShowEdit(false);
          setEditingGroupId(null);
        }}
        title="Edit Group Booking"
      >
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {/* §Provider-audit 2026-04 (packages round 4 — mobile edit
              parity): package attach/swap row inside the edit sheet.
              Tapping opens the dedicated picker sheet, detach writes
              `package_id: null`, swap writes the new id. All three paths
              end up in the PATCH payload on Save. */}
          {packagesList.length > 0 ? (
            <View style={twStyle("mb-3")}>
              <View style={twStyle("mb-2 flex-row items-center justify-between")}>
                <Text style={twStyle("text-sm font-medium text-gray-700")}>Package</Text>
                {editForm.packageId ? (
                  <TouchableOpacity
                    onPress={() => applyPackageToEditForm(null)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Detach package"
                  >
                    <Text style={twStyle("text-xs font-medium text-red-600")}>Detach</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              <TouchableOpacity
                onPress={() => setShowEditPackagePicker(true)}
                activeOpacity={0.7}
                style={twStyle(
                  `flex-row items-center justify-between rounded-xl border px-4 py-3 ${
                    editForm.packageId
                      ? "border-indigo-300 bg-indigo-50"
                      : "border-gray-200 bg-gray-50"
                  }`,
                )}
                accessibilityRole="button"
                accessibilityLabel={
                  editForm.packageId ? "Change attached package" : "Attach a package"
                }
              >
                <View style={twStyle("flex-1 flex-row items-center")}>
                  <Ionicons
                    name="cube-outline"
                    size={16}
                    color={editForm.packageId ? "#4338ca" : "#6b7280"}
                    style={{ marginRight: 8 }}
                  />
                  <Text
                    style={twStyle(
                      `text-sm ${editForm.packageId ? "text-indigo-800 font-medium" : "text-gray-600"}`,
                    )}
                    numberOfLines={1}
                  >
                    {editForm.packageId
                      ? packagesList.find((p) => p.id === editForm.packageId)?.name ?? "Package attached"
                      : "Tap to attach a service package"}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
              </TouchableOpacity>
              {editForm.packageId !== editForm.originalPackageId ? (
                <Text style={twStyle("mt-1 text-[11px] text-amber-600")}>
                  Package change will save on &quot;Save Changes&quot;. Duration and service stay as shown — update them manually if needed.
                </Text>
              ) : null}
            </View>
          ) : null}
          <View style={twStyle("mb-3 flex-row")}>
            <View style={[twStyle("flex-1"), { marginRight: 12 }]}>
              <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Date</Text>
              <TextInput
                style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
                value={editForm.date}
                onChangeText={(t) => setEditForm((p) => ({ ...p, date: t }))}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#9ca3af"
              />
            </View>
            <View style={twStyle("flex-1")}>
              <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Time</Text>
              <TextInput
                style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
                value={editForm.time}
                onChangeText={(t) => setEditForm((p) => ({ ...p, time: t }))}
                placeholder="HH:MM"
                placeholderTextColor="#9ca3af"
              />
            </View>
          </View>
          <View style={twStyle("mb-3 flex-row")}>
            <View style={[twStyle("flex-1"), { marginRight: 12 }]}>
              <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Duration (min)</Text>
              <TextInput
                style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
                value={editForm.duration}
                onChangeText={(t) => setEditForm((p) => ({ ...p, duration: t }))}
                keyboardType="number-pad"
                placeholder="60"
                placeholderTextColor="#9ca3af"
              />
            </View>
            <View style={twStyle("flex-1")}>
              <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Max Participants</Text>
              <TextInput
                style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
                value={editForm.maxParticipants}
                onChangeText={(t) => setEditForm((p) => ({ ...p, maxParticipants: t }))}
                keyboardType="number-pad"
                placeholder="No limit"
                placeholderTextColor="#9ca3af"
              />
            </View>
          </View>
          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Notes</Text>
          <TextInput
            style={twStyle("mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
            value={editForm.notes}
            onChangeText={(t) => setEditForm((p) => ({ ...p, notes: t }))}
            placeholder="Optional notes..."
            placeholderTextColor="#9ca3af"
            multiline
          />
          <ActionButton label="Save Changes" onPress={handleSaveEdit} loading={updatingGroup} fullWidth />
        </ScrollView>
      </BottomSheet>

      {/* §Provider-audit 2026-04 (packages round 4 — mobile edit parity):
          picker sheet for the edit flow. Kept separate from the create
          picker so the currently-attached package is highlighted against
          the editForm state (not createForm). */}
      <BottomSheet
        visible={showEditPackagePicker}
        onClose={() => setShowEditPackagePicker(false)}
        title="Change package"
      >
        {packagesList.length === 0 ? (
          <EmptyState
            icon="cube-outline"
            title="No packages yet"
            description="Create a package from the Packages screen or the provider web portal."
          />
        ) : (
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={{ maxHeight: 480 }}
          >
            {editForm.packageId ? (
              <TouchableOpacity
                onPress={() => {
                  applyPackageToEditForm(null);
                  setShowEditPackagePicker(false);
                }}
                activeOpacity={0.7}
                style={twStyle(
                  "mb-2 flex-row items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3",
                )}
                accessibilityRole="button"
              >
                <View style={twStyle("flex-row items-center")}>
                  <Ionicons name="close-circle-outline" size={16} color="#dc2626" style={{ marginRight: 8 }} />
                  <Text style={twStyle("text-sm font-medium text-red-700")}>
                    Detach current package
                  </Text>
                </View>
              </TouchableOpacity>
            ) : null}

            {packagesList.map((pkg) => {
              const isSelected = editForm.packageId === pkg.id;
              const serviceCount = (pkg.items ?? []).filter(
                (it) => !!it.offering_id || !!it.offering?.id,
              ).length;
              const productCount = (pkg.items ?? []).filter(
                (it) => !!it.product_id || !!it.product?.id,
              ).length;
              const priceNum = typeof pkg.price === "number" ? pkg.price : null;
              const discount =
                typeof pkg.discount_percentage === "number" && pkg.discount_percentage > 0
                  ? pkg.discount_percentage
                  : null;

              return (
                <TouchableOpacity
                  key={pkg.id}
                  onPress={() => {
                    applyPackageToEditForm(pkg);
                    setShowEditPackagePicker(false);
                  }}
                  activeOpacity={0.7}
                  style={twStyle(
                    `mb-2 rounded-xl border px-4 py-3 ${
                      isSelected
                        ? "border-indigo-400 bg-indigo-50"
                        : "border-gray-200 bg-white"
                    }`,
                  )}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                >
                  <View style={twStyle("flex-row items-start justify-between")}>
                    <View style={twStyle("flex-1")}>
                      <Text
                        style={twStyle("text-sm font-semibold text-gray-900")}
                        numberOfLines={1}
                      >
                        {pkg.name}
                      </Text>
                      {pkg.description ? (
                        <Text
                          style={twStyle("mt-0.5 text-xs text-gray-500")}
                          numberOfLines={2}
                        >
                          {pkg.description}
                        </Text>
                      ) : null}
                      <View style={twStyle("mt-1.5 flex-row items-center")}>
                        {serviceCount > 0 ? (
                          <Text
                            style={[twStyle("text-[11px] text-gray-500"), { marginRight: 10 }]}
                          >
                            {serviceCount} service{serviceCount === 1 ? "" : "s"}
                          </Text>
                        ) : null}
                        {productCount > 0 ? (
                          <Text
                            style={[twStyle("text-[11px] text-gray-500"), { marginRight: 10 }]}
                          >
                            {productCount} product{productCount === 1 ? "" : "s"}
                          </Text>
                        ) : null}
                        {discount != null ? (
                          <View
                            style={twStyle("rounded-full bg-green-50 px-1.5 py-0.5")}
                          >
                            <Text style={twStyle("text-[10px] font-medium text-green-700")}>
                              -{discount}%
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                    <View style={[twStyle("items-end"), { marginLeft: 12 }]}>
                      {priceNum != null ? (
                        <Text style={twStyle("text-sm font-semibold text-gray-900")}>
                          {formatCurrency(priceNum)}
                        </Text>
                      ) : null}
                      {isSelected ? (
                        <View style={twStyle("mt-1")}>
                          <Ionicons name="checkmark-circle" size={16} color="#4338ca" />
                        </View>
                      ) : null}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </BottomSheet>

      {/* Add participant */}
      <BottomSheet visible={showAddParticipant} onClose={() => setShowAddParticipant(false)} title="Add Participant">
        <View>
          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Name *</Text>
          <TextInput
            style={twStyle("mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
            value={participantForm.name}
            onChangeText={(t) => setParticipantForm((p) => ({ ...p, name: t }))}
            placeholder="Client name"
            placeholderTextColor="#9ca3af"
          />
          <E164PhoneField
            label="Phone"
            valueE164={participantForm.phone}
            onChangeE164={(e164) => setParticipantForm((p) => ({ ...p, phone: e164 }))}
            muted
            accessibilityLabel="Participant phone"
          />
          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Email</Text>
          <TextInput
            style={twStyle("mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
            value={participantForm.email}
            onChangeText={(t) => setParticipantForm((p) => ({ ...p, email: t }))}
            placeholder="Optional"
            placeholderTextColor="#9ca3af"
            keyboardType="email-address"
          />
          <ActionButton label="Add Participant" onPress={handleAddParticipant} loading={addingParticipant} fullWidth />
        </View>
      </BottomSheet>

      {/* B10: Create new group booking */}
      <BottomSheet
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        title="New Group Booking"
      >
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Title</Text>
          <TextInput
            style={twStyle("mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
            value={createForm.title}
            onChangeText={(t) => setCreateForm((p) => ({ ...p, title: t }))}
            placeholder="e.g. Bridal Party (defaults to service name if empty)"
            placeholderTextColor="#9ca3af"
          />

          {locations.length > 0 ? (
            <View style={twStyle("mb-3")}>
              <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>Location</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <SelectChip
                  label="Not set"
                  selected={!createForm.locationId}
                  onPress={() => setCreateForm((p) => ({ ...p, locationId: "" }))}
                />
                {locations.map((loc) => (
                  <SelectChip
                    key={loc.id}
                    label={loc.name}
                    selected={createForm.locationId === loc.id}
                    onPress={() => setCreateForm((p) => ({ ...p, locationId: loc.id }))}
                  />
                ))}
              </ScrollView>
            </View>
          ) : null}

          {packagesList.length > 0 ? (
            <View style={twStyle("mb-3")}>
              <View style={twStyle("mb-2 flex-row items-center justify-between")}>
                <Text style={twStyle("text-sm font-medium text-gray-700")}>Package (optional)</Text>
                {createForm.packageId ? (
                  <TouchableOpacity
                    onPress={() => applyPackageToCreateForm(null)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Detach package"
                  >
                    <Text style={twStyle("text-xs font-medium text-red-600")}>Detach</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              <TouchableOpacity
                onPress={() => setShowPackagePicker(true)}
                activeOpacity={0.7}
                style={twStyle(
                  `flex-row items-center justify-between rounded-xl border px-4 py-3 ${
                    createForm.packageId
                      ? "border-indigo-300 bg-indigo-50"
                      : "border-gray-200 bg-gray-50"
                  }`,
                )}
                accessibilityRole="button"
                accessibilityLabel={
                  createForm.packageId ? "Change selected package" : "Choose a package"
                }
              >
                <View style={twStyle("flex-1 flex-row items-center")}>
                  <Ionicons
                    name="cube-outline"
                    size={16}
                    color={createForm.packageId ? "#4338ca" : "#6b7280"}
                    style={{ marginRight: 8 }}
                  />
                  <Text
                    style={twStyle(
                      `text-sm ${createForm.packageId ? "text-indigo-800 font-medium" : "text-gray-600"}`,
                    )}
                    numberOfLines={1}
                  >
                    {createForm.packageId
                      ? packagesList.find((p) => p.id === createForm.packageId)?.name ?? "Package attached"
                      : "Tap to attach a service package"}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
              </TouchableOpacity>
              {createForm.packageId ? (
                <Text style={twStyle("mt-1 text-[11px] text-gray-500")}>
                  Package sets the default service + duration. You can still override them below.
                </Text>
              ) : null}
            </View>
          ) : null}

          {services.length > 0 ? (
            <View style={twStyle("mb-3")}>
              <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>Service</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <SelectChip
                  label="None"
                  selected={!createForm.serviceId}
                  onPress={() => setCreateForm((p) => ({ ...p, serviceId: "" }))}
                />
                {services.map((svc) => (
                  <SelectChip
                    key={svc.id}
                    label={svc.title}
                    selected={createForm.serviceId === svc.id}
                    onPress={() => {
                      setCreateForm((p) => {
                        const next = { ...p, serviceId: svc.id };
                        if (svc.duration_minutes && svc.duration_minutes > 0) {
                          next.duration = String(svc.duration_minutes);
                        }
                        return next;
                      });
                    }}
                  />
                ))}
              </ScrollView>
            </View>
          ) : null}

          {teamMembers.length > 0 ? (
            <View style={twStyle("mb-3")}>
              <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>Staff</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <SelectChip
                  label="None"
                  selected={!createForm.staffId}
                  onPress={() => setCreateForm((p) => ({ ...p, staffId: "" }))}
                />
                {teamMembers.map((m) => (
                  <SelectChip
                    key={m.id}
                    label={m.name?.trim() || "Team member"}
                    selected={createForm.staffId === m.id}
                    onPress={() => setCreateForm((p) => ({ ...p, staffId: m.id }))}
                  />
                ))}
              </ScrollView>
            </View>
          ) : null}

          <View style={twStyle("mb-3 flex-row")}>
            <View style={[twStyle("flex-1"), { marginRight: 12 }]}>
              <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Date *</Text>
              <TextInput
                style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
                value={createForm.date}
                onChangeText={(t) => setCreateForm((p) => ({ ...p, date: t }))}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#9ca3af"
              />
            </View>
            <View style={twStyle("flex-1")}>
              <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Time *</Text>
              <TextInput
                style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
                value={createForm.time}
                onChangeText={(t) => setCreateForm((p) => ({ ...p, time: t }))}
                placeholder="HH:MM"
                placeholderTextColor="#9ca3af"
              />
            </View>
          </View>
          <View style={twStyle("mb-3 flex-row")}>
            <View style={[twStyle("flex-1"), { marginRight: 12 }]}>
              <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Duration (min) *</Text>
              <TextInput
                style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
                value={createForm.duration}
                onChangeText={(t) => setCreateForm((p) => ({ ...p, duration: t }))}
                keyboardType="number-pad"
                placeholder="60"
                placeholderTextColor="#9ca3af"
              />
            </View>
            <View style={twStyle("flex-1")}>
              <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Max Participants *</Text>
              <TextInput
                style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
                value={createForm.maxParticipants}
                onChangeText={(t) => setCreateForm((p) => ({ ...p, maxParticipants: t }))}
                keyboardType="number-pad"
                placeholder="10"
                placeholderTextColor="#9ca3af"
              />
            </View>
          </View>
          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Notes</Text>
          <TextInput
            style={twStyle("mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
            value={createForm.notes}
            onChangeText={(t) => setCreateForm((p) => ({ ...p, notes: t }))}
            placeholder="Optional notes..."
            placeholderTextColor="#9ca3af"
            multiline
          />
          <Text style={twStyle("mb-3 text-xs text-gray-500")}>
            Add participants after creation from the group detail sheet. Service and staff are sent to the
            server with the same fields as the web portal.
          </Text>
          <ActionButton label="Create Group" onPress={handleCreate} loading={creatingGroup} fullWidth />
        </ScrollView>
      </BottomSheet>

      {/* §Provider-audit 2026-04 (packages round 3 — mobile parity):
          dedicated picker sheet, opened from the create sheet's "Package"
          row. Closes itself on select so the provider lands back on the
          create sheet with the attached package visible. */}
      <BottomSheet
        visible={showPackagePicker}
        onClose={() => setShowPackagePicker(false)}
        title="Choose a package"
      >
        {packagesList.length === 0 ? (
          <EmptyState
            icon="cube-outline"
            title="No packages yet"
            description="Create a package from the Packages screen or the provider web portal."
          />
        ) : (
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={{ maxHeight: 480 }}
          >
            {createForm.packageId ? (
              <TouchableOpacity
                onPress={() => {
                  applyPackageToCreateForm(null);
                  setShowPackagePicker(false);
                }}
                activeOpacity={0.7}
                style={twStyle(
                  "mb-2 flex-row items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3",
                )}
                accessibilityRole="button"
              >
                <View style={twStyle("flex-row items-center")}>
                  <Ionicons name="close-circle-outline" size={16} color="#dc2626" style={{ marginRight: 8 }} />
                  <Text style={twStyle("text-sm font-medium text-red-700")}>
                    Detach current package
                  </Text>
                </View>
              </TouchableOpacity>
            ) : null}

            {packagesList.map((pkg) => {
              const isSelected = createForm.packageId === pkg.id;
              const serviceCount = (pkg.items ?? []).filter(
                (it) => !!it.offering_id || !!it.offering?.id,
              ).length;
              const productCount = (pkg.items ?? []).filter(
                (it) => !!it.product_id || !!it.product?.id,
              ).length;
              const priceNum = typeof pkg.price === "number" ? pkg.price : null;
              const discount =
                typeof pkg.discount_percentage === "number" && pkg.discount_percentage > 0
                  ? pkg.discount_percentage
                  : null;

              return (
                <TouchableOpacity
                  key={pkg.id}
                  onPress={() => {
                    applyPackageToCreateForm(pkg);
                    setShowPackagePicker(false);
                  }}
                  activeOpacity={0.7}
                  style={twStyle(
                    `mb-2 rounded-xl border px-4 py-3 ${
                      isSelected
                        ? "border-indigo-400 bg-indigo-50"
                        : "border-gray-200 bg-white"
                    }`,
                  )}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                >
                  <View style={twStyle("flex-row items-start justify-between")}>
                    <View style={twStyle("flex-1")}>
                      <Text
                        style={twStyle("text-sm font-semibold text-gray-900")}
                        numberOfLines={1}
                      >
                        {pkg.name}
                      </Text>
                      {pkg.description ? (
                        <Text
                          style={twStyle("mt-0.5 text-xs text-gray-500")}
                          numberOfLines={2}
                        >
                          {pkg.description}
                        </Text>
                      ) : null}
                      <View style={twStyle("mt-1.5 flex-row items-center")}>
                        {serviceCount > 0 ? (
                          <Text
                            style={[twStyle("text-[11px] text-gray-500"), { marginRight: 10 }]}
                          >
                            {serviceCount} service{serviceCount === 1 ? "" : "s"}
                          </Text>
                        ) : null}
                        {productCount > 0 ? (
                          <Text
                            style={[twStyle("text-[11px] text-gray-500"), { marginRight: 10 }]}
                          >
                            {productCount} product{productCount === 1 ? "" : "s"}
                          </Text>
                        ) : null}
                        {discount != null ? (
                          <View
                            style={twStyle("rounded-full bg-green-50 px-1.5 py-0.5")}
                          >
                            <Text style={twStyle("text-[10px] font-medium text-green-700")}>
                              -{discount}%
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                    <View style={[twStyle("items-end"), { marginLeft: 12 }]}>
                      {priceNum != null ? (
                        <Text style={twStyle("text-sm font-semibold text-gray-900")}>
                          {formatCurrency(priceNum)}
                        </Text>
                      ) : null}
                      {isSelected ? (
                        <View style={twStyle("mt-1")}>
                          <Ionicons name="checkmark-circle" size={16} color="#4338ca" />
                        </View>
                      ) : null}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </BottomSheet>
    </ScreenContainer>
  );
}
