import { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  FlatList,
  Alert,
  Switch,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi, useApiPost, useApiMutation } from "@/hooks/useApi";
import { useResponsive } from "@/hooks/useResponsive";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Avatar } from "@/components/ui/Avatar";
import { SearchBar } from "@/components/ui/SearchBar";
import { FilterChipGroup } from "@/components/ui/FilterChip";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ActionButton } from "@/components/ui/ActionButton";
import { StatCard } from "@/components/ui/StatCard";
import { capitalizeFirst } from "@/lib/format";
import { twStyle } from "@/lib/twStyle";
import { E164PhoneField } from "@/components/E164PhoneField";
import { validateE164Phone } from "@/lib/phone-country-codes";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface StaffMember {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  avatar_url?: string | null;
  role: string;
  is_active: boolean;
  /** From API when available (e.g. from reviews); may be omitted. */
  average_rating?: number | null;
  commission_rate?: number | null;
  service_ids?: string[];
  locations?: {
    location_id: string;
    location_name: string | null;
    is_primary: boolean;
  }[];
}

interface ServiceItem {
  id: string;
  title: string;
}

interface LocationItem {
  id: string;
  name: string;
}

interface TeamAccessPayload {
  staff_id: string | null;
  can_manage_team: boolean;
  roster_detail_level?: "full" | "redacted";
  can_view_team_roster_pii?: boolean;
}

const ROLES = [
  { label: "Staff", value: "provider_staff" },
  { label: "Manager", value: "provider_manager" },
  { label: "Owner", value: "provider_owner" },
];

const EMPTY_FORM = {
  name: "",
  email: "",
  phone: "",
  role: "provider_staff",
  commission_rate: "",
  invite_email: false,
  location_ids: [] as string[],
  service_ids: [] as string[],
};

/* ------------------------------------------------------------------ */
/*  Screen                                                             */
/* ------------------------------------------------------------------ */

export default function TeamListScreen() {
  const router = useRouter();
  const { isTablet } = useResponsive();

  // Fetch all staff (no location filter) so the full team is visible; filter by location in UI if needed
  const { data: teamAccess } = useApi<TeamAccessPayload>("/api/provider/team-access");
  const canManageTeam = teamAccess?.can_manage_team === true;
  const rosterRedacted = teamAccess?.roster_detail_level === "redacted";

  const { data: staff, loading, error: staffError, refresh } = useApi<StaffMember[]>(
    "/api/provider/staff",
  );
  const { data: services } = useApi<ServiceItem[]>("/api/provider/services");
  const { data: locations } = useApi<LocationItem[]>("/api/provider/locations");
  const { execute: createMember, loading: creating } = useApiPost<
    Record<string, unknown>,
    StaffMember
  >("/api/provider/staff");
  const { execute: updateMember, loading: updating } = useApiMutation("patch");
  const { execute: deleteMember } = useApiMutation("delete");

  // --- Local state ---
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [editSheetOpen, setEditSheetOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<StaffMember | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [editForm, setEditForm] = useState({ ...EMPTY_FORM });

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  // --- Filtering ---
  const filtered = useMemo(() => {
    let list = staff ?? [];
    if (filter === "active") list = list.filter((s) => s.is_active);
    if (filter === "inactive") list = list.filter((s) => !s.is_active);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.email.toLowerCase().includes(q) ||
          s.role.toLowerCase().includes(q),
      );
    }
    return list;
  }, [staff, filter, search]);

  // --- Summary stats ---
  const totalCount = staff?.length ?? 0;
  const activeCount = staff?.filter((s) => s.is_active).length ?? 0;
  const avgRating = useMemo(() => {
    if (!staff || staff.length === 0) return 0;
    const rated = staff.filter((s) => s.average_rating != null);
    if (rated.length === 0) return 0;
    return rated.reduce((sum, s) => sum + (s.average_rating ?? 0), 0) / rated.length;
  }, [staff]);

  // --- Add member ---
  function openAddSheet() {
    if (!canManageTeam) {
      Alert.alert("Permission", "Only owners or managers with “Manage team” can add staff.");
      return;
    }
    setForm({ ...EMPTY_FORM });
    setAddSheetOpen(true);
  }

  function toggleFormLocation(locId: string) {
    setForm((prev) => ({
      ...prev,
      location_ids: prev.location_ids.includes(locId)
        ? prev.location_ids.filter((x) => x !== locId)
        : [...prev.location_ids, locId],
    }));
  }

  function toggleFormService(svcId: string) {
    setForm((prev) => ({
      ...prev,
      service_ids: prev.service_ids.includes(svcId)
        ? prev.service_ids.filter((x) => x !== svcId)
        : [...prev.service_ids, svcId],
    }));
  }

  function toggleEditFormService(svcId: string) {
    setEditForm((prev) => ({
      ...prev,
      service_ids: prev.service_ids.includes(svcId)
        ? prev.service_ids.filter((x) => x !== svcId)
        : [...prev.service_ids, svcId],
    }));
  }

  function openEditSheet(member: StaffMember) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditingMember(member);
    setEditForm({
      name: member.name,
      email: member.email,
      phone: member.phone ?? "",
      role: member.role,
      commission_rate:
        member.commission_rate != null && !Number.isNaN(Number(member.commission_rate))
          ? String(member.commission_rate)
          : "",
      invite_email: false,
      location_ids: member.locations?.map((l) => l.location_id) ?? [],
      service_ids: member.service_ids?.length ? [...member.service_ids] : [],
    });
    setEditSheetOpen(true);
  }

  async function handleEditSubmit() {
    if (!editingMember) return;
    if (!editForm.name.trim()) {
      Alert.alert("Validation", "Name is required.");
      return;
    }
    const phoneErr = editForm.phone ? validateE164Phone(editForm.phone) : null;
    if (phoneErr) {
      Alert.alert("Invalid phone", phoneErr);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const payload: Record<string, unknown> = {
      name: editForm.name.trim(),
      phone: editForm.phone.trim() || null,
      role: editForm.role,
      location_ids: editForm.location_ids,
      service_ids: editForm.service_ids,
    };
    if (editForm.commission_rate.trim()) {
      payload.commission_rate = parseFloat(editForm.commission_rate);
    } else if (
      editingMember.commission_rate != null &&
      editingMember.commission_rate !== undefined
    ) {
      payload.commission_rate = null;
    }
    const { error } = await updateMember(`/api/provider/staff/${editingMember.id}`, payload);
    if (error) {
      Alert.alert("Error", error);
    } else {
      setEditSheetOpen(false);
      setEditingMember(null);
      refresh();
    }
  }

  function handleLongPress(member: StaffMember) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!canManageTeam) {
      Alert.alert(
        member.name,
        "Only owners or managers with “Manage team” can edit or remove team members.",
      );
      return;
    }
    Alert.alert(member.name, "What would you like to do?", [
      { text: "Edit", onPress: () => openEditSheet(member) },
      {
        text: member.is_active ? "Deactivate" : "Activate",
        onPress: async () => {
          const { error } = await updateMember(`/api/provider/staff/${member.id}`, {
            is_active: !member.is_active,
          });
          if (error) Alert.alert("Error", error);
          else refresh();
        },
      },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          Alert.alert(
            "Remove team member",
            `Remove ${member.name} from your team? This cannot be undone.`,
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Remove",
                style: "destructive",
                onPress: async () => {
                  const { error } = await deleteMember(`/api/provider/staff/${member.id}`, {});
                  if (error) Alert.alert("Error", error);
                  else refresh();
                },
              },
            ]
          );
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  async function handleSubmit() {
    if (!canManageTeam) {
      Alert.alert("Permission", "You do not have permission to add team members.");
      return;
    }
    if (!form.name.trim() || !form.email.trim()) {
      Alert.alert("Validation", "Name and email are required.");
      return;
    }
    const phoneErr = form.phone.trim() ? validateE164Phone(form.phone) : null;
    if (phoneErr) {
      Alert.alert("Invalid phone", phoneErr);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const payload = {
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() || undefined,
      role: form.role,
      commission_rate: form.commission_rate
        ? parseFloat(form.commission_rate)
        : null,
      invite_email: form.invite_email,
      location_ids: form.location_ids,
      service_ids: form.service_ids,
    };
    const { error } = await createMember(payload as any);
    if (error) {
      Alert.alert("Error", error);
    } else {
      setAddSheetOpen(false);
      refresh();
    }
  }

  // --- Render ---
  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title="Team"
        showBack
        subtitle={`${totalCount} members`}
        rightAction={
          canManageTeam ? (
            <TouchableOpacity
              onPress={openAddSheet}
              style={twStyle("flex-row items-center rounded-xl bg-gray-900 px-4 py-2")}
              accessibilityLabel="Add team member"
              accessibilityRole="button"
            >
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={twStyle("ml-1 text-sm font-semibold text-white")}>Add</Text>
            </TouchableOpacity>
          ) : undefined
        }
      />

      <View style={{ flex: 1, minHeight: 0 }}>
      {/* ── Summary Stats ── */}
      <View style={twStyle("mb-4 flex-row")}>
        <View style={[twStyle("flex-1"), { marginRight: 12 }]}>
          <StatCard
            title="Total"
            value={String(totalCount)}
            icon="people-outline"
            compact
          />
        </View>
        <View style={[twStyle("flex-1"), { marginRight: 12 }]}>
          <StatCard
            title="Active"
            value={String(activeCount)}
            icon="checkmark-circle-outline"
            iconColor="#22c55e"
            iconBg="bg-green-50"
            compact
          />
        </View>
        <View style={twStyle("flex-1")}>
          <StatCard
            title="Avg Rating"
            value={avgRating.toFixed(1)}
            icon="star-outline"
            iconColor="#f59e0b"
            iconBg="bg-amber-50"
            compact
          />
        </View>
      </View>

      {/* ── Search & Filter ── */}
      <View style={twStyle("mb-3")}>
        <SearchBar
          placeholder="Search by name, email, role..."
          value={search}
          onChangeText={setSearch}
        />
      </View>
      <View style={twStyle("mb-3")}>
        <FilterChipGroup
          options={[
            { label: "All", value: "all" },
            { label: "Active", value: "active" },
            { label: "Inactive", value: "inactive" },
          ]}
          selected={filter}
          onSelect={setFilter}
        />
      </View>
      {rosterRedacted ? (
        <Text style={twStyle("mb-3 text-xs text-gray-500 px-1")}>
          Colleague emails and phones are hidden. An owner can grant “View team” to show them.
        </Text>
      ) : null}

      {/* ── Team List ── */}
      {loading && !staff ? (
        <SkeletonList rows={4} />
      ) : staffError && !staff ? (
        <ErrorState message={staffError} onRetry={refresh} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title="No team members"
          description={
            search || filter !== "all"
              ? "No results match your search or filter"
              : "Add team members to manage your staff"
          }
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(s: StaffMember) => s.id}
          style={{ flex: 1, minHeight: 0 }}
          showsVerticalScrollIndicator={true}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          contentContainerStyle={{ paddingBottom: 120 }}
          numColumns={isTablet ? 2 : 1}
          columnWrapperStyle={isTablet ? { marginBottom: 12 } : undefined}
          renderItem={({ item: member, index }: { item: StaffMember; index: number }) => (
            <View style={isTablet && index % 2 === 0 ? { marginRight: 12 } : undefined}>
            <TouchableOpacity
              style={twStyle(`${
                isTablet
                  ? "flex-1 rounded-2xl border border-gray-100 bg-white p-4"
                  : "flex-row items-center border-b border-gray-50 py-3.5"
              }`)}
              onPress={() =>
                router.push(`/(app)/(tabs)/more/team-member/${member.id}` as any)
              }
              onLongPress={() => handleLongPress(member)}
              delayLongPress={400}
              accessibilityLabel={`View ${member.name}`}
            >
              {isTablet ? (
                <View style={twStyle("items-center")}>
                  <Avatar
                    name={member.name}
                    imageUrl={member.avatar_url}
                    size="lg"
                  />
                  <Text style={twStyle("mt-2 text-base font-semibold text-gray-900")}>
                    {member.name}
                  </Text>
                  <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>
                    {capitalizeFirst(member.role)}
                  </Text>
                  <View style={twStyle("mt-2 flex-row items-center")}>
                    <View
                      style={twStyle(`mr-1.5 h-2 w-2 rounded-full ${member.is_active ? "bg-green-500" : "bg-gray-300"}`)}
                    />
                    <Text style={twStyle("text-xs text-gray-500")}>
                      {member.is_active ? "Active" : "Inactive"}
                    </Text>
                  </View>
                  {member.average_rating != null && (
                    <View style={twStyle("mt-1 flex-row items-center")}>
                      <Ionicons name="star" size={12} color="#f59e0b" />
                      <Text style={twStyle("ml-0.5 text-xs text-gray-500")}>
                        {member.average_rating.toFixed(1)}
                      </Text>
                    </View>
                  )}
                  {member.locations?.[0]?.location_name && (
                    <Text style={twStyle("mt-1 text-xs text-gray-400")}>
                      {member.locations[0].location_name}
                    </Text>
                  )}
                </View>
              ) : (
                <>
                  <Avatar
                    name={member.name}
                    imageUrl={member.avatar_url}
                    size="md"
                  />
                  <View style={twStyle("ml-3 flex-1")}>
                    <Text style={twStyle("text-base font-medium text-gray-900")}>
                      {member.name}
                    </Text>
                    <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>
                      {capitalizeFirst(member.role)}
                      {member.locations?.[0]?.location_name
                        ? ` · ${member.locations[0].location_name}`
                        : ""}
                    </Text>
                  </View>
                  <View style={twStyle("flex-row items-center")}>
                    {member.average_rating != null && (
                      <View style={[twStyle("flex-row items-center"), { marginRight: 8 }]}>
                        <Ionicons name="star" size={12} color="#f59e0b" />
                        <Text style={twStyle("ml-0.5 text-xs text-gray-500")}>
                          {member.average_rating.toFixed(1)}
                        </Text>
                      </View>
                    )}
                    <View
                      style={[twStyle(`h-2 w-2 rounded-full ${member.is_active ? "bg-green-500" : "bg-gray-300"}`), { marginRight: 8 }]}
                    />
                    <Ionicons name="chevron-forward" size={16} color="#d1d5db" />
                  </View>
                </>
              )}
            </TouchableOpacity>
            </View>
          )}
        />
      )}

      </View>

      {/* ════════════════════════════════════════════════════════════ */}
      {/*  Add Team Member Bottom Sheet                               */}
      {/* ════════════════════════════════════════════════════════════ */}
      <BottomSheet
        visible={addSheetOpen}
        onClose={() => setAddSheetOpen(false)}
        title="Add Team Member"
        snapHeight="full"
      >
        {/* Name */}
        <FormField
          label="Full Name *"
          value={form.name}
          onChangeText={(t) => setForm((p) => ({ ...p, name: t }))}
          placeholder="Full name"
        />

        {/* Contact */}
        <FormField
          label="Email *"
          value={form.email}
          onChangeText={(t) => setForm((p) => ({ ...p, email: t }))}
          placeholder="email@example.com"
          keyboardType="email-address"
        />
        <E164PhoneField
          label="Phone"
          valueE164={form.phone}
          onChangeE164={(e164) => setForm((p) => ({ ...p, phone: e164 }))}
          compact
          muted
          accessibilityLabel="Team member phone"
        />

        {/* Role Selector */}
        <Text style={twStyle("mb-1 mt-2 text-sm font-medium text-gray-700")}>Role</Text>
        <View style={twStyle("mb-3 flex-row flex-wrap")}>
          {ROLES.map((r) => (
            <TouchableOpacity
              key={r.value}
              style={[twStyle(`rounded-full px-4 py-2 ${form.role === r.value ? "bg-gray-900" : "border border-gray-200 bg-white"}`), { marginRight: 8, marginBottom: 8 }]}
              onPress={() => setForm((p) => ({ ...p, role: r.value }))}
              accessibilityLabel={`Select role ${r.label}`}
            >
              <Text
                style={twStyle(`text-sm font-medium ${form.role === r.value ? "text-white" : "text-gray-600"}`)}
              >
                {r.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Commission Rate */}
        <FormField
          label="Commission Rate (%)"
          value={form.commission_rate}
          onChangeText={(t) => setForm((p) => ({ ...p, commission_rate: t }))}
          placeholder="e.g. 30"
          keyboardType="numeric"
        />

        {/* Location Assignment */}
        {locations && locations.length > 0 && (
          <>
            <Text style={twStyle("mb-1 mt-2 text-sm font-medium text-gray-700")}>
              Assign Locations
            </Text>
            <View style={twStyle("mb-3 rounded-xl border border-gray-200 bg-gray-50")}>
              {locations.map((loc, i) => {
                const isSelected = form.location_ids.includes(loc.id);
                return (
                  <TouchableOpacity
                    key={loc.id}
                    style={twStyle(`flex-row items-center px-4 py-3 ${i < locations.length - 1 ? "border-b border-gray-100" : ""}`)}
                    onPress={() => toggleFormLocation(loc.id)}
                    accessibilityLabel={`${isSelected ? "Deselect" : "Select"} ${loc.name}`}
                  >
                    <Ionicons
                      name={isSelected ? "checkbox" : "square-outline"}
                      size={20}
                      color={isSelected ? "#6366f1" : "#9ca3af"}
                    />
                    <Text style={twStyle("ml-3 text-sm text-gray-900")}>{loc.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        {/* Service Assignment */}
        {services && services.length > 0 && (
          <>
            <Text style={twStyle("mb-1 mt-2 text-sm font-medium text-gray-700")}>
              Assign Services
            </Text>
            <View style={twStyle("mb-3 rounded-xl border border-gray-200 bg-gray-50")}>
              {services.map((svc, i) => {
                const isSelected = form.service_ids.includes(svc.id);
                return (
                  <TouchableOpacity
                    key={svc.id}
                    style={twStyle(`flex-row items-center px-4 py-3 ${i < services.length - 1 ? "border-b border-gray-100" : ""}`)}
                    onPress={() => toggleFormService(svc.id)}
                    accessibilityLabel={`${isSelected ? "Deselect" : "Select"} ${svc.title}`}
                  >
                    <Ionicons
                      name={isSelected ? "checkbox" : "square-outline"}
                      size={20}
                      color={isSelected ? "#6366f1" : "#9ca3af"}
                    />
                    <Text style={twStyle("ml-3 text-sm text-gray-900")}>{svc.title}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        {/* Invite via email toggle */}
        <View style={twStyle("mb-4 flex-row items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3")}>
          <View>
            <Text style={twStyle("text-sm font-medium text-gray-900")}>
              Invite via Email
            </Text>
            <Text style={twStyle("text-xs text-gray-500")}>
              Send an invitation email to join
            </Text>
          </View>
          <Switch
            value={form.invite_email}
            onValueChange={(v) => setForm((p) => ({ ...p, invite_email: v }))}
            trackColor={{ false: "#d1d5db", true: "#6366f1" }}
            thumbColor="#fff"
            accessibilityLabel="Toggle email invitation"
          />
        </View>

        {/* Submit */}
        <ActionButton
          label="Add Team Member"
          onPress={handleSubmit}
          loading={creating}
          fullWidth
        />
      </BottomSheet>

      {/* ════════════════════════════════════════════════════════════ */}
      {/*  Edit Team Member Bottom Sheet                              */}
      {/* ════════════════════════════════════════════════════════════ */}
      <BottomSheet
        visible={editSheetOpen}
        onClose={() => { setEditSheetOpen(false); setEditingMember(null); }}
        title={`Edit ${editingMember?.name ?? "team member"}`}
        snapHeight="auto"
      >
        <FormField
          label="Full Name *"
          value={editForm.name}
          onChangeText={(t) => setEditForm((p) => ({ ...p, name: t }))}
          placeholder="Full name"
        />

        <E164PhoneField
          label="Phone"
          valueE164={editForm.phone}
          onChangeE164={(e164) => setEditForm((p) => ({ ...p, phone: e164 }))}
          compact
          muted
          accessibilityLabel="Team member phone"
        />

        {/* Role */}
        <Text style={twStyle("mb-1 mt-2 text-sm font-medium text-gray-700")}>Role</Text>
        <View style={twStyle("mb-3 flex-row flex-wrap")}>
          {ROLES.map((r) => (
            <TouchableOpacity
              key={r.value}
              style={[
                twStyle(`rounded-full px-4 py-2 ${editForm.role === r.value ? "bg-gray-900" : "border border-gray-200 bg-white"}`),
                { marginRight: 8, marginBottom: 8 },
              ]}
              onPress={() => setEditForm((p) => ({ ...p, role: r.value }))}
              accessibilityLabel={`Select role ${r.label}`}
            >
              <Text style={twStyle(`text-sm font-medium ${editForm.role === r.value ? "text-white" : "text-gray-600"}`)}>
                {r.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <FormField
          label="Commission Rate (%)"
          value={editForm.commission_rate}
          onChangeText={(t) => setEditForm((p) => ({ ...p, commission_rate: t }))}
          placeholder="e.g. 30"
          keyboardType="numeric"
        />

        {/* Location Assignment */}
        {locations && locations.length > 0 && (
          <>
            <Text style={twStyle("mb-1 mt-2 text-sm font-medium text-gray-700")}>Locations</Text>
            <View style={twStyle("mb-3 rounded-xl border border-gray-200 bg-gray-50")}>
              {locations.map((loc, i) => {
                const isSelected = editForm.location_ids.includes(loc.id);
                return (
                  <TouchableOpacity
                    key={loc.id}
                    style={twStyle(`flex-row items-center px-4 py-3 ${i < locations.length - 1 ? "border-b border-gray-100" : ""}`)}
                    onPress={() =>
                      setEditForm((p) => ({
                        ...p,
                        location_ids: isSelected
                          ? p.location_ids.filter((x) => x !== loc.id)
                          : [...p.location_ids, loc.id],
                      }))
                    }
                    accessibilityLabel={`${isSelected ? "Deselect" : "Select"} ${loc.name}`}
                  >
                    <Ionicons
                      name={isSelected ? "checkbox" : "square-outline"}
                      size={20}
                      color={isSelected ? "#6366f1" : "#9ca3af"}
                    />
                    <Text style={twStyle("ml-3 text-sm text-gray-900")}>{loc.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        {services && services.length > 0 && (
          <>
            <Text style={twStyle("mb-1 mt-2 text-sm font-medium text-gray-700")}>
              Assign Services
            </Text>
            <View style={twStyle("mb-3 rounded-xl border border-gray-200 bg-gray-50")}>
              {services.map((svc, i) => {
                const isSelected = editForm.service_ids.includes(svc.id);
                return (
                  <TouchableOpacity
                    key={svc.id}
                    style={twStyle(
                      `flex-row items-center px-4 py-3 ${i < services.length - 1 ? "border-b border-gray-100" : ""}`,
                    )}
                    onPress={() => toggleEditFormService(svc.id)}
                    accessibilityLabel={`${isSelected ? "Deselect" : "Select"} ${svc.title}`}
                  >
                    <Ionicons
                      name={isSelected ? "checkbox" : "square-outline"}
                      size={20}
                      color={isSelected ? "#6366f1" : "#9ca3af"}
                    />
                    <Text style={twStyle("ml-3 text-sm text-gray-900")}>{svc.title}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        <ActionButton
          label="Save changes"
          onPress={handleEditSubmit}
          loading={updating}
          fullWidth
        />
      </BottomSheet>
    </ScreenContainer>
  );
}

/* ------------------------------------------------------------------ */
/*  Inline Form Field                                                  */
/* ------------------------------------------------------------------ */

function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "email-address" | "phone-pad" | "numeric";
}) {
  return (
    <View style={twStyle("mb-3")}>
      <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{label}</Text>
      <TextInput
        style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
        placeholder={placeholder}
        placeholderTextColor="#9ca3af"
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        accessibilityLabel={label}
      />
    </View>
  );
}
