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

interface Role {
  id: string;
  name: string;
  description: string | null;
  permissions: Record<string, boolean>;
  is_active: boolean;
  member_count?: number;
}
interface TeamAccessPayload {
  can_manage_team: boolean;
}

const PERMISSION_GROUPS = [
  {
    title: "Bookings",
    permissions: [
      { key: "view_bookings", label: "View Bookings", icon: "calendar-outline" },
      { key: "create_appointments", label: "Create Appointments", icon: "add-circle-outline" },
      { key: "edit_appointments", label: "Edit Appointments", icon: "create-outline" },
    ],
  },
  {
    title: "Clients",
    permissions: [
      { key: "view_clients", label: "View Clients", icon: "people-outline" },
      { key: "edit_clients", label: "Edit Clients", icon: "person-add-outline" },
    ],
  },
  {
    title: "Business",
    permissions: [
      { key: "view_reports", label: "View Reports", icon: "bar-chart-outline" },
      { key: "manage_team", label: "Manage Team", icon: "people-circle-outline" },
      { key: "edit_settings", label: "Edit Settings", icon: "settings-outline" },
    ],
  },
  {
    title: "Sales",
    permissions: [
      { key: "manage_products", label: "Manage Products", icon: "cube-outline" },
      { key: "process_sales", label: "Process Sales", icon: "card-outline" },
    ],
  },
  {
    title: "Communication",
    permissions: [
      { key: "send_messages", label: "Send Messages", icon: "chatbubble-outline" },
      { key: "create_explore_posts", label: "Create Explore posts", icon: "share-social-outline" },
    ],
  },
];

const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap((g) => g.permissions);

export default function TeamRolesScreen() {
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
  const canManageTeam = teamAccess?.can_manage_team === true;

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
      permissions: { ...role.permissions },
    });
    setShowForm(true);
  }

  function duplicateRole(role: Role) {
    if (!canManageTeam) return;
    setEditing(null);
    setForm({
      name: `${role.name} (Copy)`,
      description: role.description ?? "",
      permissions: { ...role.permissions },
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
      Alert.alert("Permission", "You do not have permission to manage team roles.");
      return;
    }
    if (!form.name.trim()) {
      Alert.alert("Required", "Role name is required");
      return;
    }
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      permissions: form.permissions,
    };
    if (editing) {
      const { error } = await updateRole(
        `/api/provider/roles/${editing.id}`,
        payload
      );
      if (error) {
        Alert.alert("Error", error);
        return;
      }
    } else {
      const { error } = await createRole(payload);
      if (error) {
        Alert.alert("Error", error);
        return;
      }
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowForm(false);
    refresh();
  }

  function handleDelete(role: Role) {
    if (!canManageTeam) return;
    if (role.member_count && role.member_count > 0) {
      Alert.alert(
        "Cannot Delete",
        `This role is assigned to ${role.member_count} team member(s). Reassign them first.`
      );
      return;
    }
    Alert.alert("Delete Role", `Delete "${role.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const { error } = await deleteRole(
            `/api/provider/roles/${role.id}`
          );
          if (error) Alert.alert("Error", error);
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
        title="Team Roles"
        showBack
        subtitle={canManageTeam ? "Manage roles & permissions" : "Role templates (read-only)"}
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
          Only owners or users with Manage team can create, edit, duplicate, or delete roles.
        </Text>
      ) : null}

      {roles && roles.length > 0 && (
        <View style={twStyle("mb-3 flex-row")}>
          <View style={[twStyle("flex-1"), { marginRight: 8 }]}>
            <StatCard
              title="Roles"
              value={String(roles.length)}
              icon="shield-outline"
              iconColor="#6366f1"
              iconBg="bg-indigo-50"
              compact
            />
          </View>
          <View style={[twStyle("flex-1"), { marginRight: 8 }]}>
            <StatCard
              title="Members"
              value={String(totalMembers)}
              icon="people-outline"
              iconColor="#22c55e"
              iconBg="bg-green-50"
              compact
            />
          </View>
          <View style={twStyle("flex-1")}>
            <StatCard
              title="Avg Perms"
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
            placeholder="Search roles..."
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
          title={search ? "No matches" : "No custom roles"}
          description={
            search
              ? "Try a different search"
              : "Create roles to manage team permissions"
          }
        />
      ) : (
        <FlatList
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
                    { text: "Cancel", style: "cancel" },
                    { text: "Edit", onPress: () => openEdit(role) },
                    {
                      text: "Duplicate",
                      onPress: () => duplicateRole(role),
                    },
                    {
                      text: "Delete",
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
                    <View style={twStyle("ml-3 flex-1")}>
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
                  <View style={[twStyle("flex-row items-center"), { marginRight: 4 }]}>
                    <Ionicons name="key-outline" size={12} color="#6366f1" />
                    <Text style={twStyle("text-xs text-indigo-600")}>
                      {permCount}/{ALL_PERMISSIONS.length} permissions
                    </Text>
                  </View>
                  {role.member_count !== undefined && (
                    <View style={[twStyle("flex-row items-center"), { marginRight: 12 }]}>
                      <Ionicons
                        name="people-outline"
                        size={12}
                        color="#6b7280"
                      />
                      <Text style={twStyle("text-xs text-gray-500")}>
                        {role.member_count} member
                        {role.member_count !== 1 ? "s" : ""}
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
        title={editing ? "Edit Role" : "New Role"}
      >
        <View>
          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
            Role Name *
          </Text>
          <TextInput
            style={twStyle("mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
            value={form.name}
            onChangeText={(t) => setForm((p) => ({ ...p, name: t }))}
            placeholder="e.g. Senior Stylist"
            placeholderTextColor="#9ca3af"
          />
          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
            Description
          </Text>
          <TextInput
            style={twStyle("mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
            value={form.description}
            onChangeText={(t) =>
              setForm((p) => ({ ...p, description: t }))
            }
            placeholder="Optional description"
            placeholderTextColor="#9ca3af"
          />

          <View style={twStyle("mb-2 flex-row items-center justify-between")}>
            <Text style={twStyle("text-xs font-semibold uppercase text-gray-400")}>
              Permissions ({formEnabledCount}/{ALL_PERMISSIONS.length})
            </Text>
            <View style={twStyle("flex-row")}>
              <TouchableOpacity style={{ marginRight: 8 }} onPress={selectAllPermissions}>
                <Text style={twStyle("text-[10px] font-medium text-indigo-600")}>
                  Select All
                </Text>
              </TouchableOpacity>
              <Text style={[twStyle("text-[10px] text-gray-300"), { marginRight: 8 }]}>|</Text>
              <TouchableOpacity onPress={clearAllPermissions}>
                <Text style={twStyle("text-[10px] font-medium text-gray-400")}>
                  Clear All
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
                key={group.title}
                style={twStyle("mb-3 overflow-hidden rounded-xl border border-gray-100 bg-white")}
              >
                <TouchableOpacity
                  style={twStyle("flex-row items-center justify-between bg-gray-50 px-4 py-2.5")}
                  onPress={() => toggleGroupAll(groupKeys)}
                >
                  <Text style={twStyle("text-xs font-semibold text-gray-600")}>
                    {group.title}
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
                        name={perm.icon as any}
                        style={{ marginRight: 8 }}
                        size={14}
                        color={
                          form.permissions[perm.key]
                            ? "#6366f1"
                            : "#9ca3af"
                        }
                      />
                      <Text style={twStyle("text-sm text-gray-700")}>
                        {perm.label}
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
              label={editing ? "Update Role" : "Create Role"}
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
