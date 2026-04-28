import { useEffect, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  TextInput,
  Alert,
  ScrollView,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { addDays, format as formatDateFns, isSameDay, parseISO, startOfDay } from "date-fns";
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
import { api } from "@/lib/api-client";
import { AddressAutocomplete } from "@/components/ui/AddressAutocomplete";
import { StaticMapImage } from "@/components/ui/StaticMapImage";
import { normalizeProductsList } from "@/lib/unpack-provider-api";

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
  location_type?: "at_salon" | "at_home";
  address_line1?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  address_postal_code?: string | null;
  address_country?: string | null;
  address_latitude?: number | null;
  address_longitude?: number | null;
  travel_fee?: number | null;
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

interface AvailableSlotsApiRow {
  time: string;
  available: boolean;
  reason?: string;
}

interface AvailableSlotsApiResponse {
  slots: string[];
  date: string;
  slot_grid?: AvailableSlotsApiRow[];
  provider_timezone?: string | null;
}

const STATUS_FILTERS = [
  { label: "All", value: "all" },
  { label: "Confirmed", value: "confirmed" },
  { label: "Booked", value: "booked" },
  { label: "In progress", value: "started" },
  { label: "Completed", value: "completed" },
  { label: "Cancelled", value: "cancelled" },
];

type ServiceRow = {
  id: string;
  title: string;
  duration_minutes?: number;
  price?: number;
  service_type?: string;
  variant_name?: string | null;
  parent_service_id?: string | null;
};
type TeamRow = { id: string; name?: string };
type ParticipantFormRow = { id: string; name: string; phone: string; email: string };
type ProductRow = {
  id: string;
  name: string;
  price: number;
  variants?: { id: string; name: string; price: number }[];
};
type SelectedGroupProduct = {
  productId: string;
  productName: string;
  productVariantId?: string;
  productVariantName?: string;
  quantity: number;
  unitPrice: number;
};
type EditingGroupContext = {
  serviceId: string | null;
  staffId: string | null;
  locationId: string | null;
  locationType: "at_salon" | "at_home";
};

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

function serviceLabel(service: ServiceRow): string {
  if (service.variant_name?.trim()) return `${service.title} · ${service.variant_name.trim()}`;
  if (service.service_type === "variant") return `${service.title} · Variant`;
  return service.title;
}

export default function GroupBookingsScreen() {
  useResponsive();
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const params = useLocalSearchParams<{
    open_group_id?: string;
    default_date?: string;
    default_time?: string;
    default_staff_id?: string;
    default_location_id?: string;
  }>();
  const { provider, selectedLocationId } = useProvider();
  const providerTz = provider?.timezone ?? null;
  const locations = provider?.locations ?? [];

  const { data: servicesRaw } = useApi<ServiceRow[]>("/api/provider/services?include_variants=true");
  const { data: productsRaw } = useApi<unknown>("/api/provider/products?limit=200");
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
  const productsList = useMemo(() => normalizeProductsList(productsRaw) as ProductRow[], [productsRaw]);
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
  const [editingGroupContext, setEditingGroupContext] = useState<EditingGroupContext | null>(null);

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
    locationType: "at_salon" as "at_salon" | "at_home",
    addressSearchValue: "",
    addressLine1: "",
    addressCity: "",
    addressState: "",
    addressPostalCode: "",
    addressCountry: "South Africa",
    addressLatitude: null as number | null,
    addressLongitude: null as number | null,
    travelFee: "",
    // §Provider-audit 2026-04 (packages round 3): track the attached
    // service_package so the POST payload can include `package_id` like
    // the web `GroupBookingDialog` does.
    packageId: "" as string,
  });
  const [createParticipants, setCreateParticipants] = useState<ParticipantFormRow[]>([]);
  const [createProducts, setCreateProducts] = useState<SelectedGroupProduct[]>([]);
  const [showPackagePicker, setShowPackagePicker] = useState(false);
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [validatingCreateAddress, setValidatingCreateAddress] = useState(false);

  const createDateOptions = useMemo(
    () => Array.from({ length: 21 }, (_, i) => addDays(startOfDay(new Date()), i)),
    [],
  );
  const editDateOptions = useMemo(() => {
    const base = editForm.date && YMD_RE.test(editForm.date) ? parseISO(`${editForm.date}T00:00:00`) : new Date();
    return Array.from({ length: 21 }, (_, i) => addDays(startOfDay(base), i));
  }, [editForm.date]);

  const statusParam = filter !== "all" ? `&status=${filter}` : "";
  const { data: groupData, loading, error: groupError, refresh } = useApi<GroupBookingsResponse>(
    `/api/provider/group-bookings?limit=50${statusParam}`
  );
  const { execute: updateGroup, loading: updatingGroup } = useApiMutation("patch");
  const { execute: createGroup, loading: creatingGroup } = useApiMutation<{
    id?: string;
    data?: { id?: string; ref_number?: string | null };
    ref_number?: string | null;
  }>("post");
  const { execute: createBooking, loading: creatingParticipantBooking } = useApiMutation<{
    id?: string;
    data?: { id?: string };
  }>("post");
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

  const createSlotParams = useMemo(() => {
    const serviceIds = createForm.serviceId ? [createForm.serviceId] : [];
    return {
      date: createForm.date,
      duration: Number(createForm.duration) || 60,
      staffId: createForm.staffId || "",
      locationId: createForm.locationId || selectedLocationId || "",
      serviceIds,
    };
  }, [createForm.date, createForm.duration, createForm.staffId, createForm.locationId, createForm.serviceId, selectedLocationId]);

  const createSlotsUrl = useMemo(() => {
    if (!createSlotParams.date || !YMD_RE.test(createSlotParams.date)) return "";
    let q =
      `/api/provider/bookings/available-slots?date=${encodeURIComponent(createSlotParams.date)}` +
      `&duration_minutes=${encodeURIComponent(String(createSlotParams.duration))}`;
    if (createSlotParams.staffId) q += `&staff_ids=${encodeURIComponent(createSlotParams.staffId)}`;
    if (createForm.locationType === "at_salon" && createSlotParams.locationId) q += `&location_id=${encodeURIComponent(createSlotParams.locationId)}`;
    if (createSlotParams.serviceIds.length > 0) {
      q += `&service_ids=${encodeURIComponent(createSlotParams.serviceIds.join(","))}`;
    }
    q += createForm.locationType === "at_home"
      ? "&mode=mobile&travel_buffer=30"
      : "&mode=salon&travel_buffer=0";
    return q;
  }, [createForm.locationType, createSlotParams]);

  const { data: createSlotsData, loading: createSlotsLoading } = useApi<AvailableSlotsApiResponse>(
    createSlotsUrl,
    { enabled: createSlotsUrl.length > 0 },
  );

  const createSlotRows = useMemo(() => {
    if (Array.isArray(createSlotsData?.slot_grid) && createSlotsData.slot_grid.length > 0) {
      return createSlotsData.slot_grid;
    }
    if (Array.isArray(createSlotsData?.slots)) {
      return createSlotsData.slots.map((time) => ({ time, available: true } as AvailableSlotsApiRow));
    }
    return [] as AvailableSlotsApiRow[];
  }, [createSlotsData]);

  const editSlotParams = useMemo(() => {
    const duration = Number(editForm.duration) || 60;
    const staffId = editingGroupContext?.staffId || "";
    const locationId = editingGroupContext?.locationId || "";
    const serviceIds = editingGroupContext?.serviceId ? [editingGroupContext.serviceId] : [];
    return { date: editForm.date, duration, staffId, locationId, serviceIds };
  }, [editForm.date, editForm.duration, editingGroupContext]);

  const editSlotsUrl = useMemo(() => {
    if (!showEdit) return "";
    if (!editSlotParams.date || !YMD_RE.test(editSlotParams.date)) return "";
    let q =
      `/api/provider/bookings/available-slots?date=${encodeURIComponent(editSlotParams.date)}` +
      `&duration_minutes=${encodeURIComponent(String(editSlotParams.duration))}`;
    if (editSlotParams.staffId) q += `&staff_ids=${encodeURIComponent(editSlotParams.staffId)}`;
    if (editSlotParams.locationId) q += `&location_id=${encodeURIComponent(editSlotParams.locationId)}`;
    if (editSlotParams.serviceIds.length > 0) {
      q += `&service_ids=${encodeURIComponent(editSlotParams.serviceIds.join(","))}`;
    }
    q += `&mode=salon&travel_buffer=0`;
    return q;
  }, [showEdit, editSlotParams]);

  const { data: editSlotsData, loading: editSlotsLoading } = useApi<AvailableSlotsApiResponse>(
    editSlotsUrl,
    { enabled: editSlotsUrl.length > 0 },
  );

  const editSlotRows = useMemo(() => {
    if (Array.isArray(editSlotsData?.slot_grid) && editSlotsData.slot_grid.length > 0) {
      return editSlotsData.slot_grid;
    }
    if (Array.isArray(editSlotsData?.slots)) {
      return editSlotsData.slots.map((time) => ({ time, available: true } as AvailableSlotsApiRow));
    }
    return [] as AvailableSlotsApiRow[];
  }, [editSlotsData]);

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

  useEffect(() => {
    const openId = typeof params.open_group_id === "string" ? params.open_group_id : "";
    if (!openId) return;
    const group = groups.find((g) => g.id === openId);
    if (group) {
      setSelectedGroup(group);
    }
  }, [groups, params.open_group_id]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  useEffect(() => {
    if (!createForm.date || !YMD_RE.test(createForm.date)) return;
    const available = createSlotRows.filter((s) => s.available).map((s) => s.time);
    if (available.length === 0) return;
    setCreateForm((prev) => {
      if (prev.time && available.includes(prev.time)) return prev;
      return { ...prev, time: available[0] ?? prev.time };
    });
  }, [createForm.date, createSlotRows]);

  useEffect(() => {
    if (!showEdit) return;
    if (!editForm.date || !YMD_RE.test(editForm.date)) return;
    const available = editSlotRows.filter((s) => s.available).map((s) => s.time);
    if (available.length === 0) return;
    setEditForm((prev) => {
      if (prev.time && available.includes(prev.time)) return prev;
      return { ...prev, time: available[0] ?? prev.time };
    });
  }, [showEdit, editForm.date, editSlotRows]);

  async function verifyGroupSlotAvailability(args: {
    date: string;
    time: string;
    durationMinutes: number;
    staffId?: string | null;
    locationId?: string | null;
    serviceId?: string | null;
    locationType?: "at_salon" | "at_home";
  }): Promise<string | null> {
    const scheduledAt = buildZonedIsoForWallClock(args.date, args.time.substring(0, 5), providerTz);
    if (!Number.isFinite(Date.parse(scheduledAt))) {
      return "Invalid schedule date/time.";
    }
    const params = new URLSearchParams({
      scheduled_at: scheduledAt,
      duration_minutes: String(args.durationMinutes),
      mode: args.locationType === "at_home" ? "mobile" : "salon",
      travel_buffer: args.locationType === "at_home" ? "30" : "0",
    });
    if (args.staffId) params.set("staff_ids", args.staffId);
    if (args.locationType !== "at_home" && args.locationId) params.set("location_id", args.locationId);
    if (args.serviceId) params.set("offering_ids", args.serviceId);
    const res = await api.get<{ available?: boolean; conflicts?: string[] }>(
      `/api/provider/bookings/check-availability?${params.toString()}`,
    );
    if (res.error) return res.error.message || "Could not verify availability.";
    if (res.data?.available === false) {
      return (res.data.conflicts ?? ["Selected slot is not available."]).join("\n");
    }
    return null;
  }

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
    setEditingGroupContext({
      serviceId: group.service_id ?? null,
      staffId: group.team_member_id ?? null,
      locationId: group.location_id ?? null,
      locationType: group.location_type === "at_home" ? "at_home" : "at_salon",
    });
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
    const durationToCheck = editForm.duration ? Number(editForm.duration) : 60;
    if (!Number.isFinite(durationToCheck) || durationToCheck <= 0) {
      Alert.alert("Invalid duration", "Duration must be greater than 0 minutes.");
      return;
    }
    const availabilityError = await verifyGroupSlotAvailability({
      date: editForm.date,
      time: editForm.time,
      durationMinutes: durationToCheck,
      staffId: editingGroupContext?.staffId,
      locationId: editingGroupContext?.locationId,
      serviceId: editingGroupContext?.serviceId,
      locationType: editingGroupContext?.locationType,
    });
    if (availabilityError) {
      Alert.alert("Time not available", availabilityError);
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
    setEditingGroupContext(null);
    refresh();
  }

  // B10: create a new group booking from the mobile provider app. Minimal
  // required fields (date/time/duration). Service/staff/location can be
  // filled in later via the edit sheet or the web portal.
  function openCreate() {
    const now = new Date();
    const hh = String(Math.min(23, now.getHours() + 1)).padStart(2, "0");
    const requestedDate =
      typeof params.default_date === "string" && YMD_RE.test(params.default_date)
        ? params.default_date
        : now.toISOString().slice(0, 10);
    const requestedTime =
      typeof params.default_time === "string" && HHMM_RE.test(params.default_time)
        ? params.default_time
        : `${hh}:00`;
    const requestedStaffId = typeof params.default_staff_id === "string" ? params.default_staff_id : "";
    const requestedLocationId = typeof params.default_location_id === "string" ? params.default_location_id : "";
    const defaultLoc = selectedLocationId ?? locations[0]?.id ?? "";
    setCreateForm({
      title: "",
      date: requestedDate,
      time: requestedTime,
      duration: "60",
      maxParticipants: "10",
      notes: "",
      serviceId: "",
      staffId: requestedStaffId,
      locationId: requestedLocationId || defaultLoc,
      locationType: "at_salon",
      addressSearchValue: "",
      addressLine1: "",
      addressCity: "",
      addressState: "",
      addressPostalCode: "",
      addressCountry: "South Africa",
      addressLatitude: null,
      addressLongitude: null,
      travelFee: "",
      packageId: "",
    });
    setCreateParticipants([{ id: `participant-${Date.now()}`, name: "", phone: "", email: "" }]);
    setCreateProducts([]);
    setShowCreate(true);
  }

  function addCreateParticipantRow() {
    setCreateParticipants((prev) => [
      ...prev,
      { id: `participant-${Date.now()}-${prev.length}`, name: "", phone: "", email: "" },
    ]);
  }

  function updateCreateParticipantRow(id: string, patch: Partial<ParticipantFormRow>) {
    setCreateParticipants((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function removeCreateParticipantRow(id: string) {
    setCreateParticipants((prev) =>
      prev.length <= 1 ? [{ id: `participant-${Date.now()}`, name: "", phone: "", email: "" }] : prev.filter((p) => p.id !== id),
    );
  }

  async function createParticipantBookingAndLink(args: {
    groupId: string;
    groupRef?: string | null;
    scheduledDate: string;
    scheduledTime: string;
    serviceId: string;
    staffId?: string | null;
    locationId?: string | null;
    locationType: "at_salon" | "at_home";
    address?: {
      address_line1: string;
      address_city?: string;
      address_state?: string;
      address_postal_code?: string;
      address_country?: string;
      address_latitude?: number | null;
      address_longitude?: number | null;
      travel_fee?: number;
    };
    products?: SelectedGroupProduct[];
    durationMinutes: number;
    unitPrice: number;
    participant: { name: string; phone?: string; email?: string };
    isPrimary: boolean;
  }) {
    const scheduledAt = buildZonedIsoForWallClock(
      args.scheduledDate,
      args.scheduledTime.substring(0, 5),
      providerTz,
    );
    if (!Number.isFinite(Date.parse(scheduledAt))) {
      return { error: "This group booking has an invalid date/time." };
    }

    const bookingPayload: Record<string, unknown> = {
      customer_name: args.participant.name.trim(),
      customer_phone: args.participant.phone?.trim() || undefined,
      customer_email: args.participant.email?.trim() || undefined,
      scheduled_at: scheduledAt,
      location_type: args.locationType,
      location_id: args.locationType === "at_salon" ? (args.locationId || undefined) : undefined,
      ...(args.locationType === "at_home" && args.address
        ? {
            address_line1: args.address.address_line1,
            address_city: args.address.address_city,
            address_state: args.address.address_state,
            address_postal_code: args.address.address_postal_code,
            address_country: args.address.address_country,
            address_latitude: args.address.address_latitude,
            address_longitude: args.address.address_longitude,
            travel_fee: args.address.travel_fee || 0,
          }
        : {}),
      staff_id: args.staffId || undefined,
      team_member_id: args.staffId || undefined,
      service_id: args.serviceId,
      offering_id: args.serviceId,
      services: [
        {
          service_id: args.serviceId,
          offering_id: args.serviceId,
          serviceId: args.serviceId,
          staff_id: args.staffId || undefined,
          price: args.unitPrice,
          duration_minutes: args.durationMinutes,
          duration: args.durationMinutes,
        },
      ],
      products: (args.products ?? []).map((p) => ({
        productId: p.productId,
        productName: p.productName,
        quantity: p.quantity,
        unitPrice: p.unitPrice,
        totalPrice: p.unitPrice * p.quantity,
        productVariantId: p.productVariantId || null,
      })),
      subtotal: args.unitPrice,
      total_amount:
        args.unitPrice +
        (args.locationType === "at_home" ? Number(args.address?.travel_fee || 0) : 0) +
        (args.products ?? []).reduce((sum, p) => sum + p.unitPrice * p.quantity, 0),
      booking_source: "provider",
      status: "confirmed",
      special_requests: args.groupRef
        ? `Group booking ${args.groupRef}`
        : `Group booking ${args.groupId}`,
    };

    const bookingRes = await createBooking("/api/provider/bookings", bookingPayload);
    if (bookingRes.error || !bookingRes.data) {
      return { error: bookingRes.error || "Could not create participant booking." };
    }
    const createdBookingId = bookingRes.data?.id || bookingRes.data?.data?.id || null;
    if (!createdBookingId) {
      return { error: "Booking was created without an id response." };
    }

    const linkRes = await addParticipant(`/api/provider/group-bookings/${args.groupId}/participants`, {
      booking_id: createdBookingId,
      participant_name: args.participant.name.trim(),
      is_primary_contact: args.isPrimary,
    });
    if (linkRes.error) {
      return { error: linkRes.error };
    }
    return { error: null };
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
    if (!createForm.serviceId) {
      Alert.alert("Service required", "Select a service so participant bookings can be created for calendar + accounting.");
      return;
    }
    if (!createForm.staffId) {
      Alert.alert("Staff required", "Select a team member to schedule this group booking correctly.");
      return;
    }
    if (createForm.locationType === "at_home") {
      if (!createForm.addressLine1.trim()) {
        Alert.alert("Address required", "Search and select the client address so the map pin and travel fee are accurate.");
        return;
      }
      if (createForm.addressLatitude == null || createForm.addressLongitude == null) {
        Alert.alert("Map pin required", "Choose a Mapbox address suggestion so the exact coordinates are saved.");
        return;
      }
    }
    const createAvailabilityError = await verifyGroupSlotAvailability({
      date: createForm.date,
      time: createForm.time,
      durationMinutes: duration,
      staffId: createForm.staffId,
      locationId: createForm.locationType === "at_home" ? null : (createForm.locationId || selectedLocationId || null),
      serviceId: createForm.serviceId,
      locationType: createForm.locationType,
    });
    if (createAvailabilityError) {
      Alert.alert("Time not available", createAvailabilityError);
      return;
    }
    const participantsToCreate = createParticipants
      .map((p) => ({
        name: p.name.trim(),
        phone: p.phone.trim(),
        email: p.email.trim(),
      }))
      .filter((p) => p.name.length > 0 || p.phone.length > 0 || p.email.length > 0);
    if (participantsToCreate.length === 0) {
      Alert.alert("Participant required", "Add at least one participant so the group creates booking records.");
      return;
    }
    for (const [idx, p] of participantsToCreate.entries()) {
      if (!p.name) {
        Alert.alert("Participant name required", `Participant ${idx + 1} needs a name.`);
        return;
      }
      const phoneErr = validateE164Phone(p.phone);
      if (phoneErr) {
        Alert.alert("Invalid phone", `Participant ${idx + 1}: ${phoneErr}`);
        return;
      }
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
    const travelFee = Math.max(0, Number(createForm.travelFee || 0) || 0);
    const productsTotal = createProducts.reduce((sum, p) => sum + (Number(p.unitPrice) || 0) * Math.max(1, Number(p.quantity) || 1), 0);
    const participantTotal = participantsToCreate.length * (Number(svc?.price ?? 0) || 0);
    const payload: Record<string, unknown> = {
      title: createForm.title.trim() || (svc ? serviceLabel(svc) : undefined) || "Group Session",
      scheduled_at: scheduledAt,
      duration_minutes: duration,
      max_participants: maxParticipants,
      notes: createForm.notes.trim() || undefined,
      location_type: createForm.locationType,
      travel_fee: createForm.locationType === "at_home" ? travelFee : 0,
      total_price: participantTotal + productsTotal + (createForm.locationType === "at_home" ? travelFee : 0),
      products: createProducts.map((p) => ({
        product_id: p.productId,
        product_name: p.productName,
        product_variant_id: p.productVariantId || null,
        product_variant_name: p.productVariantName,
        quantity: p.quantity,
        unit_price: p.unitPrice,
        total_price: p.unitPrice * p.quantity,
      })),
    };
    if (createForm.serviceId) {
      payload.service_id = createForm.serviceId;
      payload.service_name = svc ? serviceLabel(svc) : undefined;
    }
    if (createForm.staffId) payload.staff_id = createForm.staffId;
    if (createForm.locationType === "at_salon" && createForm.locationId) payload.location_id = createForm.locationId;
    if (createForm.locationType === "at_home") {
      payload.address_line1 = createForm.addressLine1.trim();
      payload.address_city = createForm.addressCity.trim() || undefined;
      payload.address_state = createForm.addressState.trim() || undefined;
      payload.address_postal_code = createForm.addressPostalCode.trim() || undefined;
      payload.address_country = createForm.addressCountry.trim() || "South Africa";
      payload.address_latitude = createForm.addressLatitude;
      payload.address_longitude = createForm.addressLongitude;
      payload.address_place_name = createForm.addressSearchValue || createForm.addressLine1;
    }
    // §Provider-audit 2026-04 (packages round 3): attach the selected
    // service_package so downstream reporting + discount math apply,
    // matching the web `GroupBookingDialog` submit path.
    if (createForm.packageId) payload.package_id = createForm.packageId;

    const { data: createdGroup, error } = await createGroup("/api/provider/group-bookings", payload);
    if (error) { Alert.alert("Error", error); return; }
    const createdGroupId = createdGroup?.id || createdGroup?.data?.id || null;
    if (!createdGroupId) {
      Alert.alert("Created group", "The group was created, but the API did not return an id to attach participants.");
      setShowCreate(false);
      refresh();
      return;
    }

    const groupRef = createdGroup?.ref_number || createdGroup?.data?.ref_number || null;
    const unitPrice = Number(svc?.price ?? 0) || 0;
    for (const [idx, participant] of participantsToCreate.entries()) {
      const res = await createParticipantBookingAndLink({
        groupId: createdGroupId,
        groupRef,
        scheduledDate: createForm.date,
        scheduledTime: createForm.time,
        serviceId: createForm.serviceId,
        staffId: createForm.staffId,
        locationId: createForm.locationType === "at_home" ? null : createForm.locationId,
        locationType: createForm.locationType,
        address: createForm.locationType === "at_home"
          ? {
              address_line1: createForm.addressLine1.trim(),
              address_city: createForm.addressCity.trim(),
              address_state: createForm.addressState.trim(),
              address_postal_code: createForm.addressPostalCode.trim(),
              address_country: createForm.addressCountry.trim() || "South Africa",
              address_latitude: createForm.addressLatitude,
              address_longitude: createForm.addressLongitude,
              travel_fee: idx === 0 ? travelFee : 0,
            }
          : undefined,
        products: idx === 0 ? createProducts : [],
        durationMinutes: duration,
        unitPrice,
        participant,
        isPrimary: idx === 0,
      });
      if (res.error) {
        Alert.alert(
          "Group created, participant failed",
          `${participant.name}: ${res.error}`,
        );
        refresh();
        return;
      }
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowCreate(false);
    refresh();
  }

  async function applyCreateAddress(parsed: {
    full_address: string;
    address_line1: string;
    city: string;
    state: string;
    postal_code: string;
    country: string;
    latitude: number;
    longitude: number;
  }) {
    setCreateForm((p) => ({
      ...p,
      addressSearchValue: parsed.full_address,
      addressLine1: parsed.address_line1,
      addressCity: parsed.city,
      addressState: parsed.state,
      addressPostalCode: parsed.postal_code,
      addressCountry: parsed.country,
      addressLatitude: parsed.latitude,
      addressLongitude: parsed.longitude,
    }));

    const addressString = parsed.full_address || `${parsed.address_line1}, ${parsed.city}, ${parsed.country}`;
    if (!provider?.id || !addressString.trim()) return;
    setValidatingCreateAddress(true);
    try {
      const res = await api.post<{
        valid?: boolean;
        travelFee?: number;
        coordinates?: { latitude: number; longitude: number };
        address?: { line1?: string; city?: string; state?: string; country?: string; postalCode?: string; fullAddress?: string };
        reason?: string;
      }>("/api/location/validate", {
        address: addressString,
        provider_id: provider.id,
      });
      const data = res.data ?? {};
      if (!data.valid) {
        Alert.alert("Outside service area", data.reason || "This address is outside your active service zones.");
        return;
      }
      setCreateForm((p) => ({
        ...p,
        addressSearchValue: data.address?.fullAddress || parsed.full_address,
        addressLine1: data.address?.line1 || parsed.address_line1,
        addressCity: data.address?.city || parsed.city,
        addressState: data.address?.state || parsed.state,
        addressPostalCode: data.address?.postalCode || parsed.postal_code,
        addressCountry: data.address?.country || parsed.country || "South Africa",
        addressLatitude: data.coordinates?.latitude ?? parsed.latitude,
        addressLongitude: data.coordinates?.longitude ?? parsed.longitude,
        travelFee: String(Math.max(0, Number(data.travelFee || 0))),
      }));
    } catch (e) {
      Alert.alert("Travel fee unavailable", e instanceof Error ? e.message : "Could not calculate the travel fee.");
    } finally {
      setValidatingCreateAddress(false);
    }
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
    const serviceId = selectedGroup.service_id ?? null;
    if (!serviceId) {
      Alert.alert(
        "Service missing",
        "This group booking has no service. Edit the group booking first to set a service, then add participants.",
      );
      return;
    }

    const matchedService = services.find((s) => s.id === serviceId);
    const unitPrice = Number(selectedGroup.price_per_person ?? matchedService?.price ?? 0) || 0;
    const durationMinutes = Number(
      selectedGroup.duration_minutes || matchedService?.duration_minutes || 60,
    );

    const res = await createParticipantBookingAndLink({
      groupId: selectedGroup.id,
      groupRef: selectedGroup.ref_number,
      scheduledDate: selectedGroup.scheduled_date,
      scheduledTime: selectedGroup.scheduled_time || "",
      serviceId,
      staffId: selectedGroup.team_member_id,
      locationId: selectedGroup.location_type === "at_home" ? null : selectedGroup.location_id,
      locationType: selectedGroup.location_type === "at_home" ? "at_home" : "at_salon",
      address: selectedGroup.location_type === "at_home"
        ? {
            address_line1: selectedGroup.address_line1 || "",
            address_city: selectedGroup.address_city || "",
            address_state: selectedGroup.address_state || "",
            address_postal_code: selectedGroup.address_postal_code || "",
            address_country: selectedGroup.address_country || "South Africa",
            address_latitude: selectedGroup.address_latitude ?? null,
            address_longitude: selectedGroup.address_longitude ?? null,
            travel_fee: 0,
          }
        : undefined,
      products: [],
      durationMinutes,
      unitPrice,
      participant: participantForm,
      isPrimary: (selectedGroup.current_participants ?? 0) === 0,
    });
    if (res.error) {
      Alert.alert("Participant creation failed", res.error);
      return;
    }

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
      <TouchableOpacity
        onPress={openCreate}
        activeOpacity={0.86}
        style={twStyle("mb-3 overflow-hidden rounded-2xl bg-gray-900 p-4")}
        accessibilityRole="button"
        accessibilityLabel="Create a new group booking"
      >
        <View style={twStyle("flex-row items-center justify-between")}>
          <View style={twStyle("flex-1 pr-3")}>
            <View style={twStyle("mb-2 flex-row items-center")}>
              <View style={twStyle("mr-2 rounded-full bg-white/10 px-2 py-1")}>
                <Text style={twStyle("text-[10px] font-semibold uppercase tracking-wide text-indigo-100")}>
                  New
                </Text>
              </View>
              <Text style={twStyle("text-xs font-medium text-indigo-100")}>
                Guided group setup
              </Text>
            </View>
            <Text style={twStyle("text-lg font-bold text-white")}>Create a group booking</Text>
            <Text style={twStyle("mt-1 text-xs leading-5 text-gray-300")}>
              Add a shared time slot, service, team member, and initial participants with calendar checks.
            </Text>
          </View>
          <View style={twStyle("h-11 w-11 items-center justify-center rounded-2xl bg-indigo-500")}>
            <Ionicons name="add" size={24} color="#ffffff" />
          </View>
        </View>
      </TouchableOpacity>

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
        <EmptyState
          icon="people-outline"
          title="No group bookings"
          description="Create a group session for bridal parties, events, families, or shared service appointments."
          actionLabel="Create group booking"
          actionAccessibilityLabel="Create a new group booking"
          onAction={openCreate}
        />
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
          setEditingGroupContext(null);
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
          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Date</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={twStyle("mb-3")} contentContainerStyle={{ paddingVertical: 4 }}>
            {editDateOptions.map((d) => {
              const dateKey = formatDateFns(d, "yyyy-MM-dd");
              const isActive = editForm.date === dateKey;
              return (
                <TouchableOpacity
                  key={dateKey}
                  style={[
                    twStyle(`items-center rounded-xl px-3 py-2.5 ${isActive ? "bg-gray-900" : "border border-gray-200 bg-white"}`),
                    { minWidth: 56, marginRight: 8 },
                  ]}
                  onPress={() => setEditForm((p) => ({ ...p, date: dateKey }))}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: isActive }}
                >
                  <Text style={twStyle(`text-[10px] ${isActive ? "text-gray-300" : "text-gray-500"}`)}>
                    {isSameDay(d, new Date()) ? "Today" : formatDateFns(d, "EEE")}
                  </Text>
                  <Text style={twStyle(`text-base font-bold ${isActive ? "text-white" : "text-gray-900"}`)}>
                    {formatDateFns(d, "d")}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <View style={twStyle("mb-3 rounded-xl border border-gray-200 bg-gray-50 p-3")}>
            <View style={twStyle("mb-2 flex-row items-center justify-between")}>
              <Text style={twStyle("text-sm font-medium text-gray-700")}>Time slot</Text>
              {editSlotsLoading ? <ActivityIndicator size="small" color="#6b7280" /> : null}
            </View>
            {editSlotRows.length > 0 ? (
              <View style={twStyle("flex-row flex-wrap")}>
                {editSlotRows.map((slot) => {
                  const isActive = editForm.time === slot.time;
                  return (
                    <TouchableOpacity
                      key={`edit-slot-${slot.time}`}
                      disabled={!slot.available}
                      onPress={() => setEditForm((p) => ({ ...p, time: slot.time }))}
                      style={[
                        twStyle(
                          `mb-2 mr-2 rounded-full border px-3 py-1.5 ${
                            isActive
                              ? "border-indigo-600 bg-indigo-50"
                              : slot.available
                                ? "border-gray-200 bg-white"
                                : "border-gray-100 bg-gray-100"
                          }`,
                        ),
                      ]}
                    >
                      <Text
                        style={twStyle(
                          `text-xs font-medium ${
                            isActive ? "text-indigo-700" : slot.available ? "text-gray-700" : "text-gray-400"
                          }`,
                        )}
                      >
                        {slot.time}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <Text style={twStyle("text-xs text-gray-500")}>
                No available slots for this date with current duration/staff.
              </Text>
            )}
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
          <ActionButton
            label="Add Participant"
            onPress={handleAddParticipant}
            loading={addingParticipant || creatingParticipantBooking}
            fullWidth
          />
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

          <View style={twStyle("mb-3")}>
            <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>Where is it happening?</Text>
            <View style={twStyle("mb-3 flex-row")}>
              <TouchableOpacity
                onPress={() => setCreateForm((p) => ({ ...p, locationType: "at_salon" }))}
                style={[twStyle(`flex-1 rounded-xl border px-3 py-3 ${createForm.locationType === "at_salon" ? "border-indigo-500 bg-indigo-50" : "border-gray-200 bg-white"}`), { marginRight: 8 }]}
                accessibilityRole="radio"
                accessibilityState={{ checked: createForm.locationType === "at_salon" }}
              >
                <Text style={twStyle("text-sm font-semibold text-gray-900")}>At salon</Text>
                <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>Use a provider location</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setCreateForm((p) => ({ ...p, locationType: "at_home", locationId: "" }))}
                style={twStyle(`flex-1 rounded-xl border px-3 py-3 ${createForm.locationType === "at_home" ? "border-indigo-500 bg-indigo-50" : "border-gray-200 bg-white"}`)}
                accessibilityRole="radio"
                accessibilityState={{ checked: createForm.locationType === "at_home" }}
              >
                <Text style={twStyle("text-sm font-semibold text-gray-900")}>At home</Text>
                <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>Save address + map pin</Text>
              </TouchableOpacity>
            </View>

            {createForm.locationType === "at_salon" && locations.length > 0 ? (
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
            ) : null}

            {createForm.locationType === "at_home" ? (
              <View style={twStyle("rounded-2xl border border-blue-100 bg-blue-50 p-3")}>
                <Text style={twStyle("mb-2 text-xs text-blue-800")}>
                  Select a Mapbox suggestion so coordinates are saved for travel buffer and fee accuracy.
                </Text>
                <AddressAutocomplete
                  label="Search address"
                  value={createForm.addressSearchValue}
                  countryCode="ZA"
                  geocodeTypes={["address"]}
                  placeholder="Start typing street address..."
                  onSelect={(parsed) => {
                    void applyCreateAddress(parsed);
                  }}
                  onBlur={(q) => setCreateForm((p) => ({ ...p, addressSearchValue: q, addressLine1: p.addressLine1 || q }))}
                />
                {validatingCreateAddress ? (
                  <View style={twStyle("mt-2 flex-row items-center")}>
                    <ActivityIndicator size="small" color="#2563eb" />
                    <Text style={twStyle("ml-2 text-xs text-blue-700")}>Calculating travel fee...</Text>
                  </View>
                ) : null}
                {createForm.addressLatitude != null && createForm.addressLongitude != null ? (
                  <View style={{ marginTop: 12, alignItems: "center" }}>
                    <StaticMapImage
                      latitude={createForm.addressLatitude}
                      longitude={createForm.addressLongitude}
                      width={Math.min(windowWidth - 48, 400)}
                      height={150}
                      zoom={15}
                    />
                    <Text style={twStyle("mt-1.5 text-xs text-gray-500")}>
                      Selected map pin{Number(createForm.travelFee || 0) > 0 ? ` · Travel fee ${formatCurrency(Number(createForm.travelFee || 0))}` : ""}
                    </Text>
                  </View>
                ) : null}
                <Text style={twStyle("mb-1 mt-3 text-xs font-medium text-gray-600")}>Street line</Text>
                <TextInput
                  style={twStyle("rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900")}
                  value={createForm.addressLine1}
                  onChangeText={(t) => setCreateForm((p) => ({ ...p, addressLine1: t }))}
                  placeholder="Street and number"
                  placeholderTextColor="#9ca3af"
                />
                <View style={[twStyle("flex-row"), { marginTop: 10 }]}>
                  <TextInput
                    style={[twStyle("flex-1 rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900"), { marginRight: 8 }]}
                    value={createForm.addressCity}
                    onChangeText={(t) => setCreateForm((p) => ({ ...p, addressCity: t }))}
                    placeholder="City"
                    placeholderTextColor="#9ca3af"
                  />
                  <TextInput
                    style={twStyle("flex-1 rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900")}
                    value={createForm.addressPostalCode}
                    onChangeText={(t) => setCreateForm((p) => ({ ...p, addressPostalCode: t }))}
                    placeholder="Postal code"
                    placeholderTextColor="#9ca3af"
                  />
                </View>
                <Text style={twStyle("mb-1 mt-3 text-xs font-medium text-gray-600")}>Travel fee (optional)</Text>
                <TextInput
                  style={twStyle("rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900")}
                  value={createForm.travelFee}
                  onChangeText={(t) => setCreateForm((p) => ({ ...p, travelFee: t }))}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor="#9ca3af"
                />
              </View>
            ) : null}
          </View>

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
                    label={serviceLabel(svc)}
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

          <View style={twStyle("mb-3 rounded-2xl border border-gray-100 bg-gray-50 p-3")}>
            <View style={twStyle("mb-2 flex-row items-center justify-between")}>
              <Text style={twStyle("text-sm font-medium text-gray-700")}>Products (optional)</Text>
              <TouchableOpacity
                onPress={() => setShowProductPicker(true)}
                style={twStyle("flex-row items-center rounded-full bg-white px-2.5 py-1")}
                accessibilityRole="button"
              >
                <Ionicons name="add" size={14} color="#4f46e5" />
                <Text style={twStyle("ml-1 text-xs font-semibold text-indigo-700")}>Add product</Text>
              </TouchableOpacity>
            </View>
            {createProducts.length === 0 ? (
              <Text style={twStyle("text-xs text-gray-500")}>No products added.</Text>
            ) : (
              createProducts.map((p, idx) => (
                <View key={`${p.productId}-${p.productVariantId ?? "simple"}`} style={twStyle("mb-2 flex-row items-center justify-between rounded-xl bg-white px-3 py-2")}>
                  <View style={twStyle("min-w-0 flex-1")}>
                    <Text style={twStyle("text-sm font-medium text-gray-900")} numberOfLines={1}>
                      {p.productName}{p.productVariantName ? ` · ${p.productVariantName}` : ""}
                    </Text>
                    <Text style={twStyle("text-xs text-gray-500")}>{formatCurrency(p.unitPrice)} × {p.quantity}</Text>
                  </View>
                  <View style={twStyle("flex-row items-center")}>
                    <TouchableOpacity
                      onPress={() => {
                        setCreateProducts((prev) => prev.map((item, i) => i === idx ? { ...item, quantity: Math.max(1, item.quantity - 1) } : item));
                      }}
                      style={twStyle("rounded-full bg-gray-100 px-2 py-1")}
                    >
                      <Text style={twStyle("text-sm font-bold text-gray-700")}>-</Text>
                    </TouchableOpacity>
                    <Text style={twStyle("mx-2 text-sm text-gray-700")}>{p.quantity}</Text>
                    <TouchableOpacity
                      onPress={() => {
                        setCreateProducts((prev) => prev.map((item, i) => i === idx ? { ...item, quantity: item.quantity + 1 } : item));
                      }}
                      style={twStyle("rounded-full bg-gray-100 px-2 py-1")}
                    >
                      <Text style={twStyle("text-sm font-bold text-gray-700")}>+</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setCreateProducts((prev) => prev.filter((_, i) => i !== idx))}
                      style={twStyle("ml-2")}
                      hitSlop={8}
                    >
                      <Ionicons name="close-circle-outline" size={18} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>

          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Date *</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={twStyle("mb-3")} contentContainerStyle={{ paddingVertical: 4 }}>
            {createDateOptions.map((d) => {
              const dateKey = formatDateFns(d, "yyyy-MM-dd");
              const isActive = createForm.date === dateKey;
              return (
                <TouchableOpacity
                  key={dateKey}
                  style={[
                    twStyle(`items-center rounded-xl px-3 py-2.5 ${isActive ? "bg-gray-900" : "border border-gray-200 bg-white"}`),
                    { minWidth: 56, marginRight: 8 },
                  ]}
                  onPress={() => setCreateForm((p) => ({ ...p, date: dateKey }))}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: isActive }}
                >
                  <Text style={twStyle(`text-[10px] ${isActive ? "text-gray-300" : "text-gray-500"}`)}>
                    {isSameDay(d, new Date()) ? "Today" : formatDateFns(d, "EEE")}
                  </Text>
                  <Text style={twStyle(`text-base font-bold ${isActive ? "text-white" : "text-gray-900"}`)}>
                    {formatDateFns(d, "d")}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <View style={twStyle("mb-3 rounded-xl border border-gray-200 bg-gray-50 p-3")}>
            <View style={twStyle("mb-2 flex-row items-center justify-between")}>
              <Text style={twStyle("text-sm font-medium text-gray-700")}>Time slot *</Text>
              {createSlotsLoading ? <ActivityIndicator size="small" color="#6b7280" /> : null}
            </View>
            {createSlotRows.length > 0 ? (
              <View style={twStyle("flex-row flex-wrap")}>
                {createSlotRows.map((slot) => {
                  const isActive = createForm.time === slot.time;
                  return (
                    <TouchableOpacity
                      key={`create-slot-${slot.time}`}
                      disabled={!slot.available}
                      onPress={() => setCreateForm((p) => ({ ...p, time: slot.time }))}
                      style={[
                        twStyle(
                          `mb-2 mr-2 rounded-full border px-3 py-1.5 ${
                            isActive
                              ? "border-indigo-600 bg-indigo-50"
                              : slot.available
                                ? "border-gray-200 bg-white"
                                : "border-gray-100 bg-gray-100"
                          }`,
                        ),
                      ]}
                    >
                      <Text
                        style={twStyle(
                          `text-xs font-medium ${
                            isActive ? "text-indigo-700" : slot.available ? "text-gray-700" : "text-gray-400"
                          }`,
                        )}
                      >
                        {slot.time}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <Text style={twStyle("text-xs text-gray-500")}>
                No available slots for this date with current selection.
              </Text>
            )}
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

          <View style={twStyle("mb-4 rounded-2xl border border-purple-100 bg-purple-50 p-3")}>
            <View style={twStyle("mb-2 flex-row items-center justify-between")}>
              <View style={twStyle("flex-row items-center")}>
                <Ionicons name="people-outline" size={16} color="#7c3aed" style={{ marginRight: 6 }} />
                <Text style={twStyle("text-sm font-semibold text-purple-900")}>Initial participants</Text>
              </View>
              <TouchableOpacity
                onPress={addCreateParticipantRow}
                style={twStyle("flex-row items-center rounded-full bg-white px-2.5 py-1")}
                accessibilityRole="button"
                accessibilityLabel="Add initial participant"
              >
                <Ionicons name="add" size={14} color="#7c3aed" />
                <Text style={twStyle("ml-1 text-xs font-semibold text-purple-700")}>Add</Text>
              </TouchableOpacity>
            </View>
            <Text style={twStyle("mb-3 text-xs text-purple-700")}>
              These people become real bookings immediately, so calendar availability and accounting stay aligned.
            </Text>

            {createParticipants.map((participant, idx) => (
              <View key={participant.id} style={twStyle("mb-3 rounded-xl border border-purple-100 bg-white p-3")}>
                <View style={twStyle("mb-2 flex-row items-center justify-between")}>
                  <Text style={twStyle("text-xs font-semibold uppercase text-gray-400")}>
                    Participant {idx + 1}
                  </Text>
                  <TouchableOpacity
                    onPress={() => removeCreateParticipantRow(participant.id)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove participant ${idx + 1}`}
                  >
                    <Ionicons name="close-circle-outline" size={18} color="#ef4444" />
                  </TouchableOpacity>
                </View>
                <Text style={twStyle("mb-1 text-xs font-medium text-gray-600")}>Name *</Text>
                <TextInput
                  style={twStyle("mb-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900")}
                  value={participant.name}
                  onChangeText={(name) => updateCreateParticipantRow(participant.id, { name })}
                  placeholder="Client name"
                  placeholderTextColor="#9ca3af"
                />
                <E164PhoneField
                  label="Phone"
                  valueE164={participant.phone}
                  onChangeE164={(phone) => updateCreateParticipantRow(participant.id, { phone })}
                  muted
                  accessibilityLabel={`Participant ${idx + 1} phone`}
                />
                <Text style={twStyle("mb-1 text-xs font-medium text-gray-600")}>Email</Text>
                <TextInput
                  style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900")}
                  value={participant.email}
                  onChangeText={(email) => updateCreateParticipantRow(participant.id, { email })}
                  placeholder="Optional"
                  placeholderTextColor="#9ca3af"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
            ))}
          </View>

          <ActionButton
            label={validatingCreateAddress ? "Checking address..." : "Create Group"}
            onPress={handleCreate}
            loading={creatingGroup || creatingParticipantBooking || addingParticipant || validatingCreateAddress}
            fullWidth
          />
        </ScrollView>
      </BottomSheet>

      <BottomSheet
        visible={showProductPicker}
        onClose={() => setShowProductPicker(false)}
        title="Add product"
      >
        {productsList.length === 0 ? (
          <EmptyState
            icon="bag-outline"
            title="No products"
            description="Add retail products in inventory first, then attach them to a group booking."
          />
        ) : (
          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 420 }}>
            {productsList.map((product) => {
              if (product.variants && product.variants.length > 0) {
                return (
                  <View key={product.id}>
                    <Text style={twStyle("px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500")}>
                      {product.name}
                    </Text>
                    {product.variants.map((variant) => {
                      const alreadyAdded = createProducts.some((p) => p.productId === product.id && p.productVariantId === variant.id);
                      return (
                        <TouchableOpacity
                          key={variant.id}
                          onPress={() => {
                            if (!alreadyAdded) {
                              setCreateProducts((prev) => [...prev, {
                                productId: product.id,
                                productName: product.name,
                                productVariantId: variant.id,
                                productVariantName: variant.name,
                                quantity: 1,
                                unitPrice: variant.price,
                              }]);
                            }
                            setShowProductPicker(false);
                          }}
                          style={twStyle(`flex-row items-center justify-between border-b border-gray-100 px-4 py-3 ${alreadyAdded ? "bg-indigo-50" : ""}`)}
                          accessibilityRole="button"
                        >
                          <Text style={twStyle("flex-1 text-sm text-gray-900")} numberOfLines={1}>{variant.name}</Text>
                          <Text style={twStyle("ml-3 text-sm font-medium text-gray-700")}>{formatCurrency(variant.price)}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                );
              }
              const alreadyAdded = createProducts.some((p) => p.productId === product.id && !p.productVariantId);
              return (
                <TouchableOpacity
                  key={product.id}
                  onPress={() => {
                    if (!alreadyAdded) {
                      setCreateProducts((prev) => [...prev, {
                        productId: product.id,
                        productName: product.name,
                        quantity: 1,
                        unitPrice: product.price,
                      }]);
                    }
                    setShowProductPicker(false);
                  }}
                  style={twStyle(`flex-row items-center justify-between border-b border-gray-100 px-4 py-3 ${alreadyAdded ? "bg-indigo-50" : ""}`)}
                  accessibilityRole="button"
                >
                  <Text style={twStyle("flex-1 text-sm text-gray-900")} numberOfLines={1}>{product.name}</Text>
                  <Text style={twStyle("ml-3 text-sm font-medium text-gray-700")}>{formatCurrency(product.price)}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
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
