import { useState, useEffect } from "react";
import * as Haptics from "expo-haptics";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useApi, useApiPost, useApiMutation } from "@/hooks/useApi";
import { useResponsive } from "@/hooks/useResponsive";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ActionButton } from "@/components/ui/ActionButton";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { capitalizeFirst } from "@/lib/format";

/* ─── types ─── */
interface Permission {
  key: string;
  label: string;
  description?: string;
}

interface Role {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  permissions_count: number;
}

interface StaffCommission {
  staffId: string;
  name: string;
  email: string;
  role: string;
  commissionPercentage: number;
  tiers: { id: string; minRevenue: number; commissionRate: number; tierOrder: number }[];
}

interface RoleForm {
  name: string;
  description: string;
  permissions: string[];
}

const AVAILABLE_PERMISSIONS: Permission[] = [
  { key: "view_calendar", label: "View Calendar", description: "See the appointment calendar" },
  { key: "manage_bookings", label: "Manage Bookings", description: "Create, edit, and cancel bookings" },
  { key: "view_clients", label: "View Clients", description: "Access client list and profiles" },
  { key: "manage_clients", label: "Manage Clients", description: "Add and edit client records" },
  { key: "view_finances", label: "View Finances", description: "See revenue and payment data" },
  { key: "manage_payments", label: "Manage Payments", description: "Process payments and refunds" },
  { key: "manage_services", label: "Manage Services", description: "Add and edit services and pricing" },
  { key: "manage_products", label: "Manage Products", description: "Manage product inventory" },
  { key: "view_reports", label: "View Reports", description: "Access business reports" },
  { key: "manage_staff", label: "Manage Staff", description: "Add, edit, and remove staff members" },
  { key: "manage_settings", label: "Manage Settings", description: "Modify business settings" },
  { key: "manage_marketing", label: "Manage Marketing", description: "Access marketing and promos" },
];

const EMPTY_ROLE_FORM: RoleForm = {
  name: "",
  description: "",
  permissions: [],
};

/* ─── screen ─── */
export default function TeamSettingsScreen() {
  useResponsive();
  const { data: roles, loading: rolesLoading, refresh: refreshRoles } =
    useApi<Role[]>("/api/provider/settings/team/roles");
  const { data: staffCommissions, loading: commLoading, refresh: refreshComm } =
    useApi<StaffCommission[]>("/api/provider/settings/team/commissions");

  const { execute: createRole, loading: creatingRole } = useApiPost<
    Record<string, unknown>,
    Role
  >("/api/provider/settings/team/roles");
  const { execute: updateRole, loading: updatingRole } =
    useApiMutation("patch");
  const { execute: deleteRole } = useApiMutation("delete");
  const { execute: saveCommission, loading: savingComm } =
    useApiMutation("patch");

  const loading = rolesLoading || commLoading;
  const isSavingRole = creatingRole || updatingRole;

  /* ─── role editing state ─── */
  const [roleSheetVisible, setRoleSheetVisible] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [roleForm, setRoleForm] = useState<RoleForm>(EMPTY_ROLE_FORM);

  /* ─── commission state (per-staff) ─── */
  const [commEdits, setCommEdits] = useState<Record<string, string>>({});
  const [, setCommHasChanges] = useState(false);
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);

  useEffect(() => {
    if (staffCommissions) {
      const edits: Record<string, string> = {};
      staffCommissions.forEach((s) => {
        edits[s.staffId] = (s.commissionPercentage ?? 0).toString();
      });
      setCommEdits(edits);
    }
  }, [staffCommissions]);

  /* ─── role handlers ─── */
  function openAddRoleSheet() {
    setEditingRoleId(null);
    setRoleForm(EMPTY_ROLE_FORM);
    setRoleSheetVisible(true);
  }

  function openEditRoleSheet(role: Role) {
    setEditingRoleId(role.id);
    setRoleForm({
      name: role.name,
      description: role.description ?? "",
      permissions: role.permissions ?? [],
    });
    setRoleSheetVisible(true);
  }

  function togglePermission(key: string) {
    setRoleForm((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(key)
        ? prev.permissions.filter((p) => p !== key)
        : [...prev.permissions, key],
    }));
  }

  async function handleSaveRole() {
    if (!roleForm.name.trim()) {
      Alert.alert("Validation Error", "Role name is required");
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const payload = {
      name: roleForm.name.trim(),
      description: roleForm.description.trim(),
      permissions: roleForm.permissions,
    };

    if (editingRoleId) {
      const { error } = await updateRole(
        `/api/provider/settings/team/roles/${editingRoleId}`,
        payload,
      );
      if (error) {
        Alert.alert("Error", error);
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Updated", "Role updated successfully.");
    } else {
      const { error } = await createRole(payload);
      if (error) {
        Alert.alert("Error", error);
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Created", "New role added.");
    }
    setRoleSheetVisible(false);
    refreshRoles();
  }

  function handleDeleteRole(role: Role) {
    Alert.alert(
      "Delete Role",
      `Are you sure you want to delete "${capitalizeFirst(role.name)}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            const { error } = await deleteRole(
              `/api/provider/settings/team/roles/${role.id}`,
            );
            if (error) Alert.alert("Error", error);
            else {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              refreshRoles();
            }
          },
        },
      ],
    );
  }

  /* ─── commission handlers (per-staff) ─── */
  async function handleSaveStaffCommission(staffId: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const percentage = parseFloat(commEdits[staffId] ?? "0") || 0;

    const { error } = await saveCommission(
      "/api/provider/settings/team/commissions",
      {
        staffId,
        commissionPercentage: percentage,
      },
    );
    if (error) {
      Alert.alert("Error", error);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditingStaffId(null);
      setCommHasChanges(false);
      refreshComm();
    }
  }

  /* ─── loading / error ─── */
  if (loading) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Team Settings" showBack />
        <LoadingState />
      </ScreenContainer>
    );
  }

  const fetchError = rolesLoading ? null : (roles === null ? "Failed to load team settings" : null);
  if (fetchError && !roles) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Team Settings" showBack />
        <ErrorState message="Failed to load team settings" onRetry={() => { refreshRoles(); refreshComm(); }} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader
        title="Team Settings"
        showBack
        subtitle="Roles, permissions & commission"
      />

      {/* ─── Roles ─── */}
      <SectionHeader
        title="Roles"
        actionLabel="Add Role"
        onAction={openAddRoleSheet}
      />
      <View className="rounded-2xl border border-gray-100 bg-white">
        {(roles ?? []).length === 0 ? (
          <View className="items-center px-4 py-8">
            <Text className="text-sm text-gray-400">
              No roles configured yet
            </Text>
          </View>
        ) : (
          (roles ?? []).map((role, i, arr) => (
            <View
              key={role.id}
              className={`flex-row items-center px-4 py-3.5 ${i < arr.length - 1 ? "border-b border-gray-50" : ""}`}
              accessibilityLabel={`Role ${capitalizeFirst(role.name)}`}
            >
              <View className="min-h-[36px] min-w-[36px] items-center justify-center rounded-lg bg-indigo-50">
                <Ionicons name="shield-outline" size={18} color="#6366f1" />
              </View>
              <View className="ml-3 flex-1">
                <Text className="text-sm font-medium text-gray-900">
                  {capitalizeFirst(role.name)}
                </Text>
                <Text className="text-xs text-gray-500">
                  {role.description || `${role.permissions_count ?? role.permissions?.length ?? 0} permissions`}
                </Text>
              </View>

              <TouchableOpacity
                className="mr-2 p-2"
                onPress={() => openEditRoleSheet(role)}
                hitSlop={8}
                accessibilityLabel={`Edit ${role.name} role`}
                accessibilityRole="button"
              >
                <Ionicons name="create-outline" size={16} color="#6b7280" />
              </TouchableOpacity>
              <TouchableOpacity
                className="p-2"
                onPress={() => handleDeleteRole(role)}
                hitSlop={8}
                accessibilityLabel={`Delete ${role.name} role`}
                accessibilityRole="button"
              >
                <Ionicons name="trash-outline" size={16} color="#ef4444" />
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>

      {/* ─── Staff Commissions ─── */}
      <SectionHeader title="Staff Commissions" />
      <View className="rounded-2xl border border-gray-100 bg-white">
        {!staffCommissions || staffCommissions.length === 0 ? (
          <View className="items-center px-4 py-8">
            <Text className="text-sm text-gray-400">
              No staff members found
            </Text>
          </View>
        ) : (
          staffCommissions.map((member, i, arr) => {
            const isEditing = editingStaffId === member.staffId;
            return (
              <View
                key={member.staffId}
                className={`px-4 py-3.5 ${i < arr.length - 1 ? "border-b border-gray-50" : ""}`}
                accessibilityLabel={`Commission for ${member.name}`}
              >
                <View className="flex-row items-center justify-between">
                  <View className="flex-1">
                    <Text className="text-sm font-medium text-gray-900">
                      {member.name}
                    </Text>
                    <Text className="text-xs text-gray-500">
                      {capitalizeFirst(member.role?.replace("provider_", "") || "staff")}
                    </Text>
                  </View>

                  {isEditing ? (
                    <View className="flex-row items-center gap-2">
                      <TextInput
                        className="w-20 rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-center text-sm text-gray-900"
                        value={commEdits[member.staffId] ?? "0"}
                        onChangeText={(v) => {
                          setCommEdits((prev) => ({ ...prev, [member.staffId]: v }));
                          setCommHasChanges(true);
                        }}
                        keyboardType="decimal-pad"
                        accessibilityLabel={`Commission % for ${member.name}`}
                        autoFocus
                      />
                      <Text className="text-sm text-gray-400">%</Text>
                      <TouchableOpacity
                        className="ml-1 rounded-lg bg-indigo-600 px-3 py-2"
                        onPress={() => handleSaveStaffCommission(member.staffId)}
                        disabled={savingComm}
                        accessibilityLabel={`Save commission for ${member.name}`}
                        accessibilityRole="button"
                      >
                        <Ionicons name="checkmark" size={16} color="#fff" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        className="rounded-lg bg-gray-100 px-3 py-2"
                        onPress={() => {
                          setEditingStaffId(null);
                          setCommEdits((prev) => ({
                            ...prev,
                            [member.staffId]: (member.commissionPercentage ?? 0).toString(),
                          }));
                        }}
                        accessibilityLabel="Cancel editing"
                        accessibilityRole="button"
                      >
                        <Ionicons name="close" size={16} color="#6b7280" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      className="flex-row items-center rounded-lg bg-gray-50 px-3 py-2"
                      onPress={() => setEditingStaffId(member.staffId)}
                      accessibilityLabel={`Edit commission for ${member.name}`}
                      accessibilityRole="button"
                    >
                      <Text className="mr-1 text-sm font-semibold text-indigo-600">
                        {member.commissionPercentage ?? 0}%
                      </Text>
                      <Ionicons name="create-outline" size={14} color="#6366f1" />
                    </TouchableOpacity>
                  )}
                </View>

                {member.tiers && member.tiers.length > 0 && (
                  <View className="mt-2 rounded-lg bg-gray-50 p-2">
                    <Text className="mb-1 text-xs font-medium text-gray-500">
                      Commission Tiers
                    </Text>
                    {member.tiers.map((tier, ti) => (
                      <Text key={tier.id ?? ti} className="text-xs text-gray-600">
                        Above R{tier.minRevenue}: {tier.commissionRate}%
                      </Text>
                    ))}
                  </View>
                )}
              </View>
            );
          })
        )}
      </View>

      <View className="h-8" />

      {/* ─── Role Add/Edit Bottom Sheet ─── */}
      <BottomSheet
        visible={roleSheetVisible}
        onClose={() => setRoleSheetVisible(false)}
        title={editingRoleId ? "Edit Role" : "Add Role"}
        snapHeight="full"
      >
        {/* Name */}
        <View className="mb-4">
          <Text className="mb-1 text-sm font-medium text-gray-700">
            Role Name <Text className="text-red-500">*</Text>
          </Text>
          <TextInput
            className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900"
            value={roleForm.name}
            onChangeText={(v) =>
              setRoleForm((prev) => ({ ...prev, name: v }))
            }
            placeholder="e.g. Senior Stylist"
            placeholderTextColor="#9ca3af"
            accessibilityLabel="Role name"
          />
        </View>

        {/* Description */}
        <View className="mb-4">
          <Text className="mb-1 text-sm font-medium text-gray-700">
            Description
          </Text>
          <TextInput
            className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900"
            value={roleForm.description}
            onChangeText={(v) =>
              setRoleForm((prev) => ({ ...prev, description: v }))
            }
            placeholder="Role description (optional)"
            placeholderTextColor="#9ca3af"
            multiline
            accessibilityLabel="Role description"
          />
        </View>

        {/* Permissions */}
        <Text className="mb-3 text-sm font-semibold text-gray-900">
          Permissions
        </Text>
        {AVAILABLE_PERMISSIONS.map((perm) => {
          const checked = roleForm.permissions.includes(perm.key);
          return (
            <TouchableOpacity
              key={perm.key}
              className="mb-2 flex-row items-center rounded-xl bg-gray-50 px-4 py-3"
              onPress={() => togglePermission(perm.key)}
              accessibilityLabel={`${perm.label} permission ${checked ? "enabled" : "disabled"}`}
              accessibilityRole="checkbox"
            >
              <View
                className={`mr-3 h-5 w-5 items-center justify-center rounded ${checked ? "bg-indigo-600" : "border border-gray-300 bg-white"}`}
              >
                {checked && (
                  <Ionicons name="checkmark" size={14} color="#fff" />
                )}
              </View>
              <View className="flex-1">
                <Text className="text-sm font-medium text-gray-800">
                  {perm.label}
                </Text>
                {perm.description && (
                  <Text className="text-xs text-gray-400">
                    {perm.description}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          );
        })}

        <View className="mt-4">
          <ActionButton
            label={
              isSavingRole
                ? "Saving…"
                : editingRoleId
                  ? "Update Role"
                  : "Add Role"
            }
            onPress={handleSaveRole}
            loading={isSavingRole}
            fullWidth
          />
        </View>
      </BottomSheet>
    </ScreenContainer>
  );
}
