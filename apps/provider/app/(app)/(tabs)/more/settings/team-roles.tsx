import { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  TextInput,
  Alert,
  Switch,
} from "react-native";
import { useTranslation } from "@beautonomi/i18n";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi, useApiPost, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ActionButton } from "@/components/ui/ActionButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { StatCard } from "@/components/ui/StatCard";
import { SearchBar } from "@/components/ui/SearchBar";
import { twStyle } from "@/lib/twStyle";
import { verticalFlatListPerf } from "@/lib/flatListPerformance";

interface Role {
  id: string;
  name: string;
  description: string | null;
  permissions: Record<string, boolean>;
  is_active: boolean;
  member_count?: number;
}
interface TeamAccessPayload {
  is_business_owner?: boolean;
  can_manage_team: boolean;
}

const PERMISSION_GROUPS = [
  {
    titleKey: "groupBookings",
    permissions: [
      { key: "view_calendar", labelKey: "permViewCalendar", icon: "calendar-outline" },
      { key: "create_appointments", labelKey: "permCreateAppointments", icon: "add-circle-outline" },
      { key: "edit_appointments", labelKey: "permEditAppointments", icon: "create-outline" },
      { key: "cancel_appointments", labelKey: "permCancelAppointments", icon: "close-circle-outline" },
      { key: "delete_appointments", labelKey: "permDeleteAppointments", icon: "trash-outline" },
    ],
  },
  {
    titleKey: "groupClients",
    permissions: [
      { key: "view_clients", labelKey: "permViewClients", icon: "people-outline" },
      { key: "edit_clients", labelKey: "permEditClients", icon: "person-add-outline" },
    ],
  },
  {
    titleKey: "groupBusiness",
    permissions: [
      { key: "view_reports", labelKey: "permViewReports", icon: "bar-chart-outline" },
      { key: "view_team", labelKey: "permViewTeam", icon: "people-outline" },
      { key: "manage_team", labelKey: "permManageTeam", icon: "people-circle-outline" },
      { key: "view_settings", labelKey: "permViewSettings", icon: "options-outline" },
      { key: "edit_settings", labelKey: "permEditSettings", icon: "settings-outline" },
    ],
  },
  {
    titleKey: "groupSalesProducts",
    permissions: [
      { key: "view_sales", labelKey: "permViewSales", icon: "receipt-outline" },
      { key: "create_sales", labelKey: "permCreateSales", icon: "add-circle-outline" },
      { key: "process_payments", labelKey: "permProcessPayments", icon: "card-outline" },
      { key: "view_services", labelKey: "permViewServices", icon: "list-outline" },
      { key: "edit_services", labelKey: "permEditServices", icon: "construct-outline" },
      { key: "view_products", labelKey: "permViewProducts", icon: "cube-outline" },
      { key: "edit_products", labelKey: "permEditProducts", icon: "cube-outline" },
    ],
  },
  {
    titleKey: "groupCommunication",
    permissions: [
      { key: "view_messages", labelKey: "permViewMessages", icon: "chatbubbles-outline" },
      { key: "send_messages", labelKey: "permSendMessages", icon: "chatbubble-outline" },
      { key: "create_explore_posts", labelKey: "permCreateExplorePosts", icon: "share-social-outline" },
    ],
  },
  {
    titleKey: "groupReviews",
    permissions: [
      { key: "view_reviews", labelKey: "permViewReviews", icon: "star-outline" },
      { key: "edit_reviews", labelKey: "permEditReviews", icon: "star-half-outline" },
      { key: "view_client_ratings", labelKey: "permViewClientRatings", icon: "person-circle-outline" },
      { key: "rate_clients", labelKey: "permRateClients", icon: "create-outline" },
    ],
  },
];

const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap((g) => g.permissions);
const LEGACY_PERMISSION_ALIASES: Record<string, string[]> = {
  view_calendar: ["view_bookings", "manage_bookings"],
  edit_appointments: ["manage_bookings"],
  cancel_appointments: ["manage_bookings"],
  view_products: ["manage_products"],
  edit_products: ["manage_products"],
  view_sales: ["process_sales", "view_finances"],
  create_sales: ["process_sales"],
  process_payments: ["process_sales", "view_finances"],
  view_team: ["manage_staff"],
  manage_team: ["manage_staff"],
  view_reports: ["view_finances"],
};

function normalizeRolePermissions(
  permissions: Record<string, boolean> | null | undefined,
): Record<string, boolean> {
  const source = permissions ?? {};
  const normalized: Record<string, boolean> = {};
  for (const perm of ALL_PERMISSIONS) {
    if (source[perm.key] === true) {
      normalized[perm.key] = true;
      continue;
    }
    if (LEGACY_PERMISSION_ALIASES[perm.key]?.some((legacyKey) => source[legacyKey] === true)) {
      normalized[perm.key] = true;
    }
  }
  return normalized;
}

export default function TeamRolesScreen() {
  const { t } = useTranslation();
  const tr = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(`provider.mobile.screens.teamRoles.${key}`, opts) as string,
    [t],
  );
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    name: "",
    description: "",
    permissions: {} as Record<string, boolean>,
  });
  const { data: teamAccess } = useApi<TeamAccessPayload>("/api/provider/team-access");
  const canManageTeam =
    teamAccess?.is_business_owner === true || teamAccess?.can_manage_team === true;

  const { data: roles, loading, error: loadError, refresh } = useApi<Role[]>(
    "/api/provider/roles"
  );
  const { execute: createRole, loading: creating } = useApiPost<any, any>(
    "/api/provider/roles"
  );
  const { execute: updateRole, loading: updatingRole } =
    useApiMutation("patch");
  const { execute: deleteRole } = useApiMutation("delete");

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const filtered = useMemo(() => {
    if (!roles) return [];
    if (!search) return roles;
    const q = search.toLowerCase();
    return roles.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.description?.toLowerCase().includes(q)
    );
  }, [roles, search]);

  const totalMembers = useMemo(
    () => roles?.reduce((sum, r) => sum + (r.member_count ?? 0), 0) ?? 0,
    [roles]
  );
  const avgPermissions = useMemo(() => {
    if (!roles?.length) return 0;
    const sum = roles.reduce(
      (acc, r) => acc + Object.values(r.permissions).filter(Boolean).length,
      0
    );
    return Math.round(sum / roles.length);
  }, [roles]);

  function openCreate() {
    if (!canManageTeam) return;
    setEditing(null);
    setForm({ name: "", description: "", permissions: {} });
    setShowForm(true);
  }

  function openEdit(role: Role) {
    if (!canManageTeam) return;
    setEditing(role);
    setForm({
      name: role.name,
      description: role.description ?? "",
      permissions: normalizeRolePermissions(role.permissions),
    });
    setShowForm(true);
  }

  function duplicateRole(role: Role) {
    if (!canManageTeam) return;
    setEditing(null);
    setForm({
      name: tr("copyName", { name: role.name }),
      description: role.description ?? "",
      permissions: normalizeRolePermissions(role.permissions),
    });
    setShowForm(true);
  }

  function togglePermission(key: string) {
    if (!canManageTeam) return;
    setForm((p) => ({
      ...p,
      permissions: { ...p.permissions, [key]: !p.permissions[key] },
    }));
  }

  function toggleGroupAll(keys: string[]) {
    if (!canManageTeam) return;
    const allEnabled = keys.every((k) => form.permissions[k]);
    setForm((p) => {
      const next = { ...p.permissions };
      keys.forEach((k) => {
        next[k] = !allEnabled;
      });
      return { ...p, permissions: next };
    });
  }

  function selectAllPermissions() {
    if (!canManageTeam) return;
    setForm((p) => {
      const next = { ...p.permissions };
      ALL_PERMISSIONS.forEach((perm) => {
        next[perm.key] = true;
      });
      return { ...p, permissions: next };
    });
  }

  function clearAllPermissions() {
    if (!canManageTeam) return;
    setForm((p) => ({ ...p, permissions: {} }));
  }

  async function handleSave() {
    if (!canManageTeam) {
      Alert.alert(tr("permissionTitle"), tr("permissionBody"));
      return;
    }
    if (!form.name.trim()) {
      Alert.alert(tr("requiredTitle"), tr("requiredBody"));
      return;
    }
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      permissions: normalizeRolePermissions(form.permissions),
    };
    const wasEditing = Boolean(editing);
    if (editing) {
      const { error } = await updateRole(
        `/api/provider/roles/${editing.id}`,
        payload
      );
      if (error) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert(tr("errorTitle"), error);
        return;
      }
    } else {
      const { error } = await createRole(payload);
      if (error) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert(tr("errorTitle"), error);
        return;
      }
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowForm(false);
    refresh();
    // §Provider-audit 2026-04: surface an explicit confirmation so owners
    // know the role save landed. The form sheet auto-closes, which
    // previously left users uncertain whether the change persisted.
    Alert.alert(
      wasEditing ? tr("updatedTitle") : tr("createdTitle"),
      wasEditing ? tr("updatedBody") : tr("createdBody"),
    );
  }

  function handleDelete(role: Role) {
    if (!canManageTeam) return;
    if (role.member_count && role.member_count > 0) {
      Alert.alert(
        tr("cannotDeleteTitle"),
        tr("cannotDeleteAssigned", { count: role.member_count })
      );
      return;
    }
    Alert.alert(tr("deleteTitle"), tr("deleteBody", { name: role.name }), [
      { text: tr("cancel"), style: "cancel" },
      {
        text: tr("delete"),
        style: "destructive",
        onPress: async () => {
          const { error } = await deleteRole(
            `/api/provider/roles/${role.id}`
          );
          if (error) Alert.alert(tr("errorTitle"), error);
          else refresh();
        },
      },
    ]);
  }

  const enabledCount = (perms: Record<string, boolean>) =>
    Object.values(perms).filter(Boolean).length;

  const formEnabledCount = enabledCount(form.permissions);

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title={tr("title")}
        showBack
        subtitle={canManageTeam ? tr("subtitleManage") : tr("subtitleReadonly")}
        rightAction={
          canManageTeam ? (
            <TouchableOpacity
              style={twStyle("h-10 w-10 items-center justify-center rounded-full bg-gray-900")}
              onPress={openCreate}
            >
              <Ionicons name="add" size={20} color="#fff" />
            </TouchableOpacity>
          ) : undefined
        }
      />
      {!canManageTeam ? (
        <Text style={twStyle("mb-3 px-1 text-xs text-gray-500")}>
          {tr("readonlyHint")}
        </Text>
      ) : null}

      {roles && roles.length > 0 && (
        <View style={twStyle("mb-3 flex-row")}>
          <View style={[twStyle("flex-1"), { marginEnd: 8 }]}>
            <StatCard
              title={tr("statRoles")}
              value={String(roles.length)}
              icon="shield-outline"
              iconColor="#6366f1"
              iconBg="bg-indigo-50"
              compact
            />
          </View>
          <View style={[twStyle("flex-1"), { marginEnd: 8 }]}>
            <StatCard
              title={tr("statMembers")}
              value={String(totalMembers)}
              icon="people-outline"
              iconColor="#22c55e"
              iconBg="bg-green-50"
              compact
            />
          </View>
          <View style={twStyle("flex-1")}>
            <StatCard
              title={tr("statAvgPerms")}
              value={String(avgPermissions)}
              icon="key-outline"
              iconColor="#f59e0b"
              iconBg="bg-amber-50"
              compact
            />
          </View>
        </View>
      )}

      {roles && roles.length > 3 && (
        <View style={twStyle("mb-3")}>
          <SearchBar
            value={search}
            onChangeText={setSearch}
            placeholder={tr("searchPlaceholder")}
          />
        </View>
      )}

      {loading && !roles && !loadError ? (
        <SkeletonList rows={4} />
      ) : loadError && !roles ? (
        <ErrorState message={loadError} onRetry={refresh} />
      ) : !filtered.length ? (
        <EmptyState
          icon="shield-outline"
          title={search ? tr("emptyMatches") : tr("emptyTitle")}
          description={
            search
              ? tr("emptyMatchesHint")
              : tr("emptyHint")
          }
        />
      ) : (
        <FlatList
          {...verticalFlatListPerf}
          data={filtered}
          keyExtractor={(r: Role) => r.id}
          showsVerticalScrollIndicator={false}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          contentContainerStyle={{ paddingBottom: 120 }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderItem={({ item: role }: { item: Role }) => {
            const permCount = enabledCount(role.permissions);
            return (
              <TouchableOpacity
                style={twStyle("rounded-xl border border-gray-100 bg-white p-4")}
                onPress={() => openEdit(role)}
                disabled={!canManageTeam}
                onLongPress={() => {
                  if (!canManageTeam) return;
                  Alert.alert(role.name, undefined, [
                    { text: tr("cancel"), style: "cancel" },
                    { text: tr("edit"), onPress: () => openEdit(role) },
                    {
                      text: tr("duplicate"),
                      onPress: () => duplicateRole(role),
                    },
                    {
                      text: tr("delete"),
                      style: "destructive",
                      onPress: () => handleDelete(role),
                    },
                  ]);
                }}
                activeOpacity={0.7}
              >
                <View style={twStyle("flex-row items-start justify-between")}>
                  <View style={twStyle("flex-row flex-1 items-center")}>
                    <View style={twStyle("h-10 w-10 items-center justify-center rounded-lg bg-indigo-50")}>
                      <Ionicons
                        name="shield-checkmark-outline"
                        size={20}
                        color="#6366f1"
                      />
                    </View>
                    <View style={twStyle("ms-3 flex-1")}>
                      <Text style={twStyle("text-sm font-semibold text-gray-900")}>
                        {role.name}
                      </Text>
                      {role.description && (
                        <Text
                          style={twStyle("mt-0.5 text-xs text-gray-500")}
                          numberOfLines={1}
                        >
                          {role.description}
                        </Text>
                      )}
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => handleDelete(role)} disabled={!canManageTeam}>
                    <Ionicons
                      name="trash-outline"
                      size={16}
                      color={canManageTeam ? "#ef4444" : "#d1d5db"}
                    />
                  </TouchableOpacity>
                </View>
                <View style={twStyle("mt-2 flex-row items-center")}>
                  <View style={[twStyle("flex-row items-center"), { marginEnd: 4 }]}>
                    <Ionicons name="key-outline" size={12} color="#6366f1" />
                    <Text style={twStyle("text-xs text-indigo-600")}>
                      {tr("permissionsCount", { count: permCount, total: ALL_PERMISSIONS.length })}
                    </Text>
                  </View>
                  {role.member_count !== undefined && (
                    <View style={[twStyle("flex-row items-center"), { marginEnd: 12 }]}>
                      <Ionicons
                        name="people-outline"
                        size={12}
                        color="#6b7280"
                      />
                      <Text style={twStyle("text-xs text-gray-500")}>
                        {tr("memberCount", { count: role.member_count })}
                      </Text>
                    </View>
                  )}
                </View>
                {/* Permission bar */}
                <View style={twStyle("mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100")}>
                  <View
                    style={[twStyle("h-1.5 rounded-full bg-indigo-500"), {
                      width: `${(permCount / ALL_PERMISSIONS.length) * 100}%`,
                    }]}
                  />
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      <BottomSheet
        visible={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? tr("editTitle") : tr("newTitle")}
      >
        <View>
          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
            {tr("nameLabel")}
          </Text>
          <TextInput
            style={twStyle("mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
            value={form.name}
            onChangeText={(text) => setForm((p) => ({ ...p, name: text }))}
            placeholder={tr("namePlaceholder")}
            placeholderTextColor="#9ca3af"
          />
          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
            {tr("description")}
          </Text>
          <TextInput
            style={twStyle("mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
            value={form.description}
            onChangeText={(text) =>
              setForm((p) => ({ ...p, description: text }))
            }
            placeholder={tr("descriptionPlaceholder")}
            placeholderTextColor="#9ca3af"
          />

          <View style={twStyle("mb-2 flex-row items-center justify-between")}>
            <Text style={twStyle("text-xs font-semibold uppercase text-gray-400")}>
              {tr("permissionsHeader", { count: formEnabledCount, total: ALL_PERMISSIONS.length })}
            </Text>
            <View style={twStyle("flex-row")}>
              <TouchableOpacity style={{ marginEnd: 8 }} onPress={selectAllPermissions}>
                <Text style={twStyle("text-[10px] font-medium text-indigo-600")}>
                  {tr("selectAll")}
                </Text>
              </TouchableOpacity>
              <Text style={[twStyle("text-[10px] text-gray-300"), { marginEnd: 8 }]}>|</Text>
              <TouchableOpacity onPress={clearAllPermissions}>
                <Text style={twStyle("text-[10px] font-medium text-gray-400")}>
                  {tr("clearAll")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {PERMISSION_GROUPS.map((group) => {
            const groupKeys = group.permissions.map((p) => p.key);
            const allGroupEnabled = groupKeys.every(
              (k) => form.permissions[k]
            );
            return (
              <View
                key={group.titleKey}
                style={twStyle("mb-3 overflow-hidden rounded-xl border border-gray-100 bg-white")}
              >
                <TouchableOpacity
                  style={twStyle("flex-row items-center justify-between bg-gray-50 px-4 py-2.5")}
                  onPress={() => toggleGroupAll(groupKeys)}
                >
                  <Text style={twStyle("text-xs font-semibold text-gray-600")}>
                    {tr(group.titleKey)}
                  </Text>
                  <View
                    style={twStyle(`h-4 w-4 items-center justify-center rounded ${
                      allGroupEnabled
                        ? "bg-indigo-600"
                        : "border border-gray-300"
                    }`)}
                  >
                    {allGroupEnabled && (
                      <Ionicons
                        name="checkmark"
                        size={10}
                        color="#fff"
                      />
                    )}
                  </View>
                </TouchableOpacity>
                {group.permissions.map((perm, idx) => (
                  <View
                    key={perm.key}
                    style={twStyle(`flex-row items-center justify-between px-4 py-3 ${
                      idx < group.permissions.length - 1
                        ? "border-b border-gray-50"
                        : ""
                    }`)}
                  >
                    <View style={twStyle("flex-row items-center")}>
                      <Ionicons
                        name={perm.icon as keyof typeof Ionicons.glyphMap}
                        style={{ marginEnd: 8 }}
                        size={14}
                        color={
                          form.permissions[perm.key]
                            ? "#6366f1"
                            : "#9ca3af"
                        }
                      />
                      <Text style={twStyle("text-sm text-gray-700")}>
                        {tr(perm.labelKey)}
                      </Text>
                    </View>
                    <Switch
                      value={!!form.permissions[perm.key]}
                      onValueChange={() => togglePermission(perm.key)}
                      trackColor={{ false: "#d1d5db", true: "#818cf8" }}
                      thumbColor={
                        form.permissions[perm.key] ? "#6366f1" : "#f4f4f5"
                      }
                      style={{
                        transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }],
                      }}
                    />
                  </View>
                ))}
              </View>
            );
          })}

          <View style={twStyle("mt-2")}>
            <ActionButton
              label={editing ? tr("updateRole") : tr("createRole")}
              onPress={handleSave}
              loading={creating || updatingRole}
              fullWidth
            />
          </View>
        </View>
      </BottomSheet>
    </ScreenContainer>
  );
}
