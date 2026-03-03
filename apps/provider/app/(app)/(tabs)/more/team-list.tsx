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
import { useApi, useApiPost } from "@/hooks/useApi";
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

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface StaffMember {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  role: string;
  is_active: boolean;
  average_rating: number | null;
  locations: {
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
  const { data: staff, loading, error: staffError, refresh } = useApi<StaffMember[]>(
    "/api/provider/staff",
  );
  const { data: services } = useApi<ServiceItem[]>("/api/provider/services");
  const { data: locations } = useApi<LocationItem[]>("/api/provider/locations");
  const { execute: createMember, loading: creating } = useApiPost<
    Record<string, unknown>,
    StaffMember
  >("/api/provider/staff");

  // --- Local state ---
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });

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

  async function handleSubmit() {
    if (!form.name.trim() || !form.email.trim()) {
      Alert.alert("Validation", "Name and email are required.");
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
          <TouchableOpacity
            onPress={openAddSheet}
            className="flex-row items-center rounded-xl bg-gray-900 px-4 py-2"
            accessibilityLabel="Add team member"
            accessibilityRole="button"
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text className="ml-1 text-sm font-semibold text-white">Add</Text>
          </TouchableOpacity>
        }
      />

      <View style={{ flex: 1, minHeight: 0 }}>
      {/* ── Summary Stats ── */}
      <View className="mb-4 flex-row gap-3">
        <View className="flex-1">
          <StatCard
            title="Total"
            value={String(totalCount)}
            icon="people-outline"
            compact
          />
        </View>
        <View className="flex-1">
          <StatCard
            title="Active"
            value={String(activeCount)}
            icon="checkmark-circle-outline"
            iconColor="#22c55e"
            iconBg="bg-green-50"
            compact
          />
        </View>
        <View className="flex-1">
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
      <View className="mb-3">
        <SearchBar
          placeholder="Search by name, email, role..."
          value={search}
          onChangeText={setSearch}
        />
      </View>
      <View className="mb-3">
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
          contentContainerStyle={{ paddingBottom: 120, gap: isTablet ? 12 : 0 }}
          numColumns={isTablet ? 2 : 1}
          columnWrapperStyle={isTablet ? { gap: 12 } : undefined}
          renderItem={({ item: member }: { item: StaffMember }) => (
            <TouchableOpacity
              className={`${
                isTablet
                  ? "flex-1 rounded-2xl border border-gray-100 bg-white p-4"
                  : "flex-row items-center border-b border-gray-50 py-3.5"
              }`}
              onPress={() =>
                router.push(`/(app)/(tabs)/more/team-member/${member.id}` as any)
              }
              accessibilityLabel={`View ${member.name}`}
            >
              {isTablet ? (
                <View className="items-center">
                  <Avatar
                    name={member.name}
                    imageUrl={member.avatar_url}
                    size="lg"
                  />
                  <Text className="mt-2 text-base font-semibold text-gray-900">
                    {member.name}
                  </Text>
                  <Text className="mt-0.5 text-xs text-gray-500">
                    {capitalizeFirst(member.role)}
                  </Text>
                  <View className="mt-2 flex-row items-center">
                    <View
                      className={`mr-1.5 h-2 w-2 rounded-full ${member.is_active ? "bg-green-500" : "bg-gray-300"}`}
                    />
                    <Text className="text-xs text-gray-500">
                      {member.is_active ? "Active" : "Inactive"}
                    </Text>
                  </View>
                  {member.average_rating != null && (
                    <View className="mt-1 flex-row items-center">
                      <Ionicons name="star" size={12} color="#f59e0b" />
                      <Text className="ml-0.5 text-xs text-gray-500">
                        {member.average_rating.toFixed(1)}
                      </Text>
                    </View>
                  )}
                  {member.locations?.[0]?.location_name && (
                    <Text className="mt-1 text-xs text-gray-400">
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
                  <View className="ml-3 flex-1">
                    <Text className="text-base font-medium text-gray-900">
                      {member.name}
                    </Text>
                    <Text className="mt-0.5 text-xs text-gray-500">
                      {capitalizeFirst(member.role)}
                      {member.locations?.[0]?.location_name
                        ? ` · ${member.locations[0].location_name}`
                        : ""}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-2">
                    {member.average_rating != null && (
                      <View className="flex-row items-center">
                        <Ionicons name="star" size={12} color="#f59e0b" />
                        <Text className="ml-0.5 text-xs text-gray-500">
                          {member.average_rating.toFixed(1)}
                        </Text>
                      </View>
                    )}
                    <View
                      className={`h-2 w-2 rounded-full ${member.is_active ? "bg-green-500" : "bg-gray-300"}`}
                    />
                    <Ionicons name="chevron-forward" size={16} color="#d1d5db" />
                  </View>
                </>
              )}
            </TouchableOpacity>
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
        <FormField
          label="Phone"
          value={form.phone}
          onChangeText={(t) => setForm((p) => ({ ...p, phone: t }))}
          placeholder="+27 xxx xxx xxxx"
          keyboardType="phone-pad"
        />

        {/* Role Selector */}
        <Text className="mb-1 mt-2 text-sm font-medium text-gray-700">Role</Text>
        <View className="mb-3 flex-row flex-wrap gap-2">
          {ROLES.map((r) => (
            <TouchableOpacity
              key={r.value}
              className={`rounded-full px-4 py-2 ${form.role === r.value ? "bg-gray-900" : "border border-gray-200 bg-white"}`}
              onPress={() => setForm((p) => ({ ...p, role: r.value }))}
              accessibilityLabel={`Select role ${r.label}`}
            >
              <Text
                className={`text-sm font-medium ${form.role === r.value ? "text-white" : "text-gray-600"}`}
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
            <Text className="mb-1 mt-2 text-sm font-medium text-gray-700">
              Assign Locations
            </Text>
            <View className="mb-3 rounded-xl border border-gray-200 bg-gray-50">
              {locations.map((loc, i) => {
                const isSelected = form.location_ids.includes(loc.id);
                return (
                  <TouchableOpacity
                    key={loc.id}
                    className={`flex-row items-center px-4 py-3 ${i < locations.length - 1 ? "border-b border-gray-100" : ""}`}
                    onPress={() => toggleFormLocation(loc.id)}
                    accessibilityLabel={`${isSelected ? "Deselect" : "Select"} ${loc.name}`}
                  >
                    <Ionicons
                      name={isSelected ? "checkbox" : "square-outline"}
                      size={20}
                      color={isSelected ? "#6366f1" : "#9ca3af"}
                    />
                    <Text className="ml-3 text-sm text-gray-900">{loc.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        {/* Service Assignment */}
        {services && services.length > 0 && (
          <>
            <Text className="mb-1 mt-2 text-sm font-medium text-gray-700">
              Assign Services
            </Text>
            <View className="mb-3 rounded-xl border border-gray-200 bg-gray-50">
              {services.map((svc, i) => {
                const isSelected = form.service_ids.includes(svc.id);
                return (
                  <TouchableOpacity
                    key={svc.id}
                    className={`flex-row items-center px-4 py-3 ${i < services.length - 1 ? "border-b border-gray-100" : ""}`}
                    onPress={() => toggleFormService(svc.id)}
                    accessibilityLabel={`${isSelected ? "Deselect" : "Select"} ${svc.title}`}
                  >
                    <Ionicons
                      name={isSelected ? "checkbox" : "square-outline"}
                      size={20}
                      color={isSelected ? "#6366f1" : "#9ca3af"}
                    />
                    <Text className="ml-3 text-sm text-gray-900">{svc.title}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        {/* Invite via email toggle */}
        <View className="mb-4 flex-row items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
          <View>
            <Text className="text-sm font-medium text-gray-900">
              Invite via Email
            </Text>
            <Text className="text-xs text-gray-500">
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
    <View className="mb-3">
      <Text className="mb-1 text-sm font-medium text-gray-700">{label}</Text>
      <TextInput
        className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
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
