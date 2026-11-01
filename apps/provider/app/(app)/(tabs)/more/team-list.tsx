import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Alert,
  ScrollView,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi, useApiPost, useApiMutation } from "@/hooks/useApi";
import { useResponsive } from "@/hooks/useResponsive";
import { useProvider } from "@/providers/ProviderContext";
import { getWebProviderBaseUrl } from "@/lib/web-url";
import { pushInAppBrowser } from "@/lib/in-app-web";
import { shouldUseAppleIap } from "@/lib/iap/platform";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Avatar } from "@/components/ui/Avatar";
import { SearchBar } from "@/components/ui/SearchBar";
import { FilterChipGroup } from "@/components/ui/FilterChip";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { ActionButton } from "@/components/ui/ActionButton";
import { StatCard } from "@/components/ui/StatCard";
import { capitalizeFirst } from "@/lib/format";
import { twStyle } from "@/lib/twStyle";
import { isPlanGateErrorCode, showPlanGateAlert } from "@/lib/plan-gate";
import { verticalFlatListPerf } from "@/lib/flatListPerformance";
import { Colors } from "@/constants/colors";
import { useTranslation } from "@beautonomi/i18n";
import { DirectionalIcon } from "@/components/ui/DirectionalIcon";
import { StaffAddWizardSheet } from "@/components/team/StaffAddWizardSheet";

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
  /** True when `providers.user_id` matches the signed-in user (same as server `is_business_owner`). */
  is_business_owner?: boolean;
  can_manage_team: boolean;
  roster_detail_level?: "full" | "redacted";
  can_view_team_roster_pii?: boolean;
  staff_add_can_proceed?: boolean;
  staff_add_current_count?: number;
  staff_add_limit_value?: number | null;
}

function staffRoleLabel(role: string, tl: (key: string, opts?: Record<string, unknown>) => string): string {
  if (role === "provider_staff") return tl("roleStaff");
  if (role === "provider_manager") return tl("roleManager");
  if (role === "provider_owner") return tl("roleOwner");
  return capitalizeFirst(role);
}

/* ------------------------------------------------------------------ */
/*  Screen                                                             */
/* ------------------------------------------------------------------ */

export default function TeamListScreen() {
  const { t } = useTranslation();
  const tl = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(`provider.mobile.screens.teamList.${key}`, opts) as string,
    [t],
  );
  const router = useRouter();
  const params = useLocalSearchParams<{ add?: string }>();
  const addIntentDone = useRef(false);
  const { isTablet } = useResponsive();
  const { provider, selectedLocationId } = useProvider();
  const isFreelancer = provider?.business_type === "freelancer";

  const staffUrl = useMemo(() => {
    return selectedLocationId
      ? `/api/provider/staff?location_id=${encodeURIComponent(selectedLocationId)}`
      : "/api/provider/staff";
  }, [selectedLocationId]);

  const { data: teamAccess, loading: teamAccessLoading } =
    useApi<TeamAccessPayload>("/api/provider/team-access");
  const canManageTeam =
    teamAccess?.is_business_owner === true || teamAccess?.can_manage_team === true;
  const rosterRedacted = teamAccess?.roster_detail_level === "redacted";

  const { data: staff, loading, error: staffError, refresh } = useApi<StaffMember[]>(staffUrl);
  const { data: services } = useApi<ServiceItem[]>("/api/provider/services");
  const { data: locations } = useApi<LocationItem[]>("/api/provider/locations");
  const { execute: createMember } = useApiPost<
    Record<string, unknown>,
    StaffMember
  >("/api/provider/staff");
  const { execute: updateMember } = useApiMutation("patch");
  const { execute: deleteMember } = useApiMutation("delete");
  const { execute: postStaffAction } = useApiMutation("post");

  // --- Local state ---
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [addSheetOpen, setAddSheetOpen] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  // Reset so a later navigation with ?add=1 can open the sheet again
  useEffect(() => {
    if (params.add !== "1") addIntentDone.current = false;
  }, [params.add]);

  // Deep link / hub "Add member" → open add sheet once team access is known
  useEffect(() => {
    if (params.add !== "1" || addIntentDone.current) return;
    if (teamAccessLoading) return;
    addIntentDone.current = true;
    if (isFreelancer || !canManageTeam) return;
    setAddSheetOpen(true);
  }, [params.add, teamAccessLoading, isFreelancer, canManageTeam, selectedLocationId, locations]);

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
  const serviceProvidersCount =
    staff?.filter((s) => s.role === "provider_staff" || s.role === "provider_manager").length ?? 0;
  const onShiftCount = activeCount;
  // §Provider-audit 2026-04 (round 8): return null when no staff have been
  // rated yet so the summary card can show "—" instead of a misleading 0.0
  // stars (which looked like the whole team was rated 0/5).
  const avgRating = useMemo<number | null>(() => {
    if (!staff || staff.length === 0) return null;
    const rated = staff.filter((s) => s.average_rating != null);
    if (rated.length === 0) return null;
    return rated.reduce((sum, s) => sum + (s.average_rating ?? 0), 0) / rated.length;
  }, [staff]);

  const teamListSubtitle = useMemo(() => {
    const base = tl("subtitleCount", { count: totalCount });
    if (!selectedLocationId || !provider?.locations?.length) return base;
    const loc = provider.locations.find((l) => l.id === selectedLocationId);
    return loc?.name ? tl("subtitleWithLocation", { base, location: loc.name }) : base;
  }, [totalCount, selectedLocationId, provider?.locations, tl]);

  // --- Add member ---
  function openAddSheet() {
    if (isFreelancer) {
      Alert.alert(
        tl("salonRequiredTitle"),
        tl("salonRequiredAdd"),
      );
      return;
    }
    if (!canManageTeam) {
      Alert.alert(tl("permissionTitle"), tl("permissionAdd"));
      return;
    }
    setAddSheetOpen(true);
  }

  function openEditSheet(member: StaffMember) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/(app)/(tabs)/more/team-member/${member.id}?edit=1` as never);
  }

  function handleLongPress(member: StaffMember) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!canManageTeam) {
      Alert.alert(
        member.name,
        tl("permissionEdit"),
      );
      return;
    }
    Alert.alert(member.name, tl("whatToDo"), [
      { text: tl("edit"), onPress: () => openEditSheet(member) },
      ...(canManageTeam && member.email
        ? [
            {
              text: tl("sendPasswordReset"),
              onPress: async () => {
                Alert.alert(
                  tl("sendPasswordReset"),
                  tl("sendPasswordResetBody", { name: member.name }),
                  [
                    { text: tl("cancel"), style: "cancel" },
                    {
                      text: tl("send"),
                      onPress: async () => {
                        const { error } = await postStaffAction(
                          `/api/provider/staff/${member.id}/reset-password`,
                          {},
                        );
                        if (error) Alert.alert(tl("errorTitle"), error);
                        else {
                          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                          Alert.alert(tl("resetSentTitle"), tl("resetSentBody"));
                        }
                      },
                    },
                  ],
                );
              },
            },
          ]
        : []),
      {
        text: member.is_active ? tl("deactivate") : tl("activate"),
        onPress: async () => {
          const { error } = await updateMember(`/api/provider/staff/${member.id}`, {
            is_active: !member.is_active,
          });
          if (error) Alert.alert(tl("errorTitle"), error);
          else refresh();
        },
      },
      {
        text: tl("remove"),
        style: "destructive",
        onPress: () => {
          Alert.alert(
            tl("removeTitle"),
            tl("removeBody", { name: member.name }),
            [
              { text: tl("cancel"), style: "cancel" },
              {
                text: tl("remove"),
                style: "destructive",
                onPress: async () => {
                  const { error } = await deleteMember(`/api/provider/staff/${member.id}`, {});
                  if (error) Alert.alert(tl("errorTitle"), error);
                  else refresh();
                },
              },
            ]
          );
        },
      },
      { text: tl("cancel"), style: "cancel" },
    ]);
  }

  const addWizardLocationIds = useMemo(
    () =>
      selectedLocationId
        ? [selectedLocationId]
        : (locations ?? []).map((l) => l.id),
    [selectedLocationId, locations],
  );

  const addWizardOfferingIds = useMemo(() => (services ?? []).map((s) => s.id), [services]);

  const addWizardStaffOptions = useMemo(
    () => (staff ?? []).filter((s) => s.is_active).map((s) => ({ id: s.id, name: s.name })),
    [staff],
  );

  const addWizardStaffLimit = useMemo(() => {
    if (teamAccess?.staff_add_limit_value == null && teamAccess?.staff_add_current_count == null) {
      return undefined;
    }
    return {
      canProceed: teamAccess?.staff_add_can_proceed !== false,
      currentCount: teamAccess?.staff_add_current_count ?? 0,
      limitValue: teamAccess?.staff_add_limit_value ?? null,
    };
  }, [teamAccess]);

  // --- Render ---
  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title={tl("title")}
        showBack
        subtitle={teamListSubtitle}
        rightAction={
          canManageTeam && !isFreelancer ? (
            <TouchableOpacity
              onPress={openAddSheet}
              style={twStyle("flex-row items-center rounded-xl bg-gray-900 px-4 py-2")}
              accessibilityLabel={tl("addA11y")}
              accessibilityRole="button"
            >
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={twStyle("ms-1 text-sm font-semibold text-white")}>{tl("add")}</Text>
            </TouchableOpacity>
          ) : undefined
        }
      />

      <View style={{ flex: 1, minHeight: 0 }}>
      {/* ── Team List ── */}
      {loading && !staff ? (
        <SkeletonList rows={4} />
      ) : staffError && !staff ? (
        <ErrorState message={staffError} onRetry={refresh} />
      ) : (
        <FlatList
          {...verticalFlatListPerf}
          data={filtered}
          keyExtractor={(s: StaffMember) => s.id}
          style={{ flex: 1, minHeight: 0 }}
          showsVerticalScrollIndicator={true}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          contentContainerStyle={{ paddingBottom: 120 }}
          numColumns={isTablet ? 2 : 1}
          columnWrapperStyle={isTablet ? { marginBottom: 12 } : undefined}
          ListHeaderComponent={
            <View style={twStyle("mb-2")}>
              {!teamAccessLoading && !canManageTeam ? (
                <View
                  style={twStyle("mb-3 mx-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5")}
                >
                  <Text style={twStyle("text-sm text-amber-900")}>
                    {tl("readOnlyBanner")}
                  </Text>
                </View>
              ) : null}
              {isFreelancer ? (
                <View
                  style={[
                    twStyle("mb-3 rounded-xl border px-3 py-3"),
                    { borderColor: "rgba(255, 0, 119, 0.2)", backgroundColor: "rgba(255, 0, 119, 0.05)" },
                  ]}
                >
                  <Text style={twStyle("text-sm text-gray-700")}>
                    <Text style={twStyle("font-semibold text-[#FF0077]")}>{tl("freelancerLead")}</Text>{" "}
                    {tl("freelancerBody")}
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      if (shouldUseAppleIap()) {
                        router.push("/(app)/(tabs)/more/settings/subscription" as never);
                        return;
                      }
                      const base = getWebProviderBaseUrl().replace(/\/$/, "");
                      pushInAppBrowser(router, `${base}/provider/settings/upgrade-to-salon`, tl("upgradeTitle"));
                    }}
                    style={twStyle("mt-3 self-start rounded-lg bg-[#FF0077] px-4 py-2.5")}
                    accessibilityLabel={tl("upgradeToSalonA11y")}
                    accessibilityRole="button"
                  >
                    <Text style={twStyle("text-sm font-semibold text-white")}>{tl("upgradeToSalon")}</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
              {/* ── Summary Stats (aligned with provider web team members) ── */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 4, gap: 12, paddingEnd: 4 }}
                style={twStyle("mb-4")}
              >
                <View style={{ width: 132 }}>
                  <StatCard
                    title={tl("statTotal")}
                    value={String(totalCount)}
                    icon="people-outline"
                    compact
                  />
                </View>
                <View style={{ width: 132 }}>
                  <StatCard
                    title={tl("statActive")}
                    value={String(activeCount)}
                    icon="checkmark-circle-outline"
                    iconColor="#22c55e"
                    iconBg="#dcfce7"
                    compact
                  />
                </View>
                <View style={{ width: 152 }}>
                  <StatCard
                    title={tl("statServiceProviders")}
                    value={String(serviceProvidersCount)}
                    icon="briefcase-outline"
                    iconColor="#9333ea"
                    iconBg="#f3e8ff"
                    compact
                  />
                </View>
                <View style={{ width: 132 }}>
                  <StatCard
                    title={tl("statOnShift")}
                    value={String(onShiftCount)}
                    icon="time-outline"
                    iconColor={Colors.primary}
                    iconBg={Colors.primaryLight}
                    compact
                  />
                </View>
                <View style={{ width: 132 }}>
                  <StatCard
                    title={tl("statAvgRating")}
                    value={avgRating == null ? "—" : avgRating.toFixed(1)}
                    icon="star-outline"
                    iconColor="#f59e0b"
                    iconBg="#ffedd5"
                    compact
                  />
                </View>
              </ScrollView>

              {/* ── Search & Filter ── */}
              <View style={twStyle("mb-3")}>
                <SearchBar
                  placeholder={tl("searchPlaceholder")}
                  value={search}
                  onChangeText={setSearch}
                />
              </View>
              <View style={twStyle("mb-3")}>
                <FilterChipGroup
                  options={[
                    { label: tl("filterAll"), value: "all" },
                    { label: tl("filterActive"), value: "active" },
                    { label: tl("filterInactive"), value: "inactive" },
                  ]}
                  selected={filter}
                  onSelect={setFilter}
                />
              </View>
              {rosterRedacted ? (
                <Text style={twStyle("mb-3 text-xs text-gray-500 px-1")}>
                  {tl("rosterRedacted")}
                </Text>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            filtered.length === 0 ? (
              <EmptyState
                icon="people-outline"
                title={selectedLocationId && !search && filter === "all" ? tl("emptyLocationTitle") : tl("emptyTitle")}
                description={
                  search || filter !== "all"
                    ? tl("emptyFiltered")
                    : selectedLocationId
                      ? tl("emptyLocationBody")
                      : tl("emptyBody")
                }
              />
            ) : null
          }
          renderItem={({ item: member, index }: { item: StaffMember; index: number }) => (
            <View style={isTablet && index % 2 === 0 ? { marginEnd: 12 } : undefined}>
            <TouchableOpacity
              style={twStyle(`${
                isTablet
                  ? "flex-1 rounded-2xl border border-gray-100 bg-white p-4"
                  : "flex-row items-center border-b border-gray-50 py-3.5"
              }`)}
              onPress={() =>
                router.push(`/(app)/(tabs)/more/team-member/${member.id}` as never)
              }
              onLongPress={() => handleLongPress(member)}
              delayLongPress={400}
              accessibilityLabel={tl("viewMemberA11y", { name: member.name })}
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
                    {staffRoleLabel(member.role, tl)}
                  </Text>
                  <View style={twStyle("mt-2 flex-row items-center")}>
                    <View
                      style={twStyle(`me-1.5 h-2 w-2 rounded-full ${member.is_active ? "bg-green-500" : "bg-gray-300"}`)}
                    />
                    <Text style={twStyle("text-xs text-gray-500")}>
                      {member.is_active ? tl("active") : tl("inactive")}
                    </Text>
                  </View>
                  {member.average_rating != null && (
                    <View style={twStyle("mt-1 flex-row items-center")}>
                      <Ionicons name="star" size={12} color="#f59e0b" />
                      <Text style={twStyle("ms-0.5 text-xs text-gray-500")}>
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
                  <View style={twStyle("ms-3 flex-1")}>
                    <Text style={twStyle("text-base font-medium text-gray-900")}>
                      {member.name}
                    </Text>
                    <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>
                      {staffRoleLabel(member.role, tl)}
                      {member.locations?.[0]?.location_name
                        ? ` · ${member.locations[0].location_name}`
                        : ""}
                    </Text>
                  </View>
                  <View style={twStyle("flex-row items-center")}>
                    {member.average_rating != null && (
                      <View style={[twStyle("flex-row items-center"), { marginEnd: 8 }]}>
                        <Ionicons name="star" size={12} color="#f59e0b" />
                        <Text style={twStyle("ms-0.5 text-xs text-gray-500")}>
                          {member.average_rating.toFixed(1)}
                        </Text>
                      </View>
                    )}
                    <View
                      style={[twStyle(`h-2 w-2 rounded-full ${member.is_active ? "bg-green-500" : "bg-gray-300"}`), { marginEnd: 8 }]}
                    />
                    <DirectionalIcon name="chevron-forward" size={16} color="#d1d5db" />
                  </View>
                </>
              )}
            </TouchableOpacity>
            </View>
          )}
        />
      )}

      </View>

      <StaffAddWizardSheet
        visible={addSheetOpen}
        onClose={() => setAddSheetOpen(false)}
        locationIds={addWizardLocationIds}
        offeringIds={addWizardOfferingIds}
        locations={(locations ?? []).map((l) => ({ id: l.id, name: l.name }))}
        offerings={(services ?? []).map((s) => ({ id: s.id, title: s.title }))}
        staffOptions={addWizardStaffOptions}
        staffLimit={addWizardStaffLimit}
        onCreated={() => refresh()}
        createMember={createMember}
        router={router}
      />

    </ScreenContainer>
  );
}
