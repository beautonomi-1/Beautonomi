import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "@beautonomi/i18n";
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
import { twStyle } from "@/lib/twStyle";

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

function useAvailablePermissions(ts: (key: string) => string): Permission[] {
  return [
  { key: "view_calendar", label: ts("permission_view_calendar"), description: ts("permission_view_calendar_desc") },
  { key: "manage_bookings", label: ts("permission_manage_bookings"), description: ts("permission_manage_bookings_desc") },
  { key: "view_clients", label: ts("permission_view_clients"), description: ts("permission_view_clients_desc") },
  { key: "manage_clients", label: ts("permission_manage_clients"), description: ts("permission_manage_clients_desc") },
  { key: "view_finances", label: ts("permission_view_finances"), description: ts("permission_view_finances_desc") },
  { key: "manage_payments", label: ts("permission_manage_payments"), description: ts("permission_manage_payments_desc") },
  { key: "manage_services", label: ts("permission_manage_services"), description: ts("permission_manage_services_desc") },
  { key: "manage_products", label: ts("permission_manage_products"), description: ts("permission_manage_products_desc") },
  { key: "view_reports", label: ts("permission_view_reports"), description: ts("permission_view_reports_desc") },
  { key: "manage_staff", label: ts("permission_manage_staff"), description: ts("permission_manage_staff_desc") },
  { key: "manage_settings", label: ts("permission_manage_settings"), description: ts("permission_manage_settings_desc") },
  { key: "manage_marketing", label: ts("permission_manage_marketing"), description: ts("permission_manage_marketing_desc") },
  ];
}

const EMPTY_ROLE_FORM: RoleForm = {
  name: "",
  description: "",
  permissions: [],
};

/* ─── screen ─── */
export default function TeamSettingsScreen() {
  const { t } = useTranslation();
  const ts = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(`provider.mobile.screens.teamSettings.${key}`, opts) as string,
    [t],
  );
  const AVAILABLE_PERMISSIONS = useAvailablePermissions(ts);
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
      Alert.alert(ts("validationError"), ts("roleNameRequired"));
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
        Alert.alert(ts("errorTitle"), error);
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(ts("updatedTitle"), ts("roleUpdated"));
    } else {
      const { error } = await createRole(payload);
      if (error) {
        Alert.alert(ts("errorTitle"), error);
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(ts("createdTitle"), ts("roleCreated"));
    }
    setRoleSheetVisible(false);
    refreshRoles();
  }

  function handleDeleteRole(role: Role) {
    Alert.alert(
      ts("deleteRoleTitle"),
      ts("deleteRoleBody", { name: capitalizeFirst(role.name) }),
      [
        { text: ts("cancel"), style: "cancel" },
        {
          text: ts("delete"),
          style: "destructive",
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            const { error } = await deleteRole(
              `/api/provider/settings/team/roles/${role.id}`,
            );
            if (error) Alert.alert(ts("errorTitle"), error);
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
      Alert.alert(ts("errorTitle"), error);
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
        <ScreenHeader title={ts("title")} showBack />
        <LoadingState />
      </ScreenContainer>
    );
  }

  const fetchError = rolesLoading ? null : (roles === null ? ts("loadFailed") : null);
  if (fetchError && !roles) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title={ts("title")} showBack />
        <ErrorState message={ts("loadFailed")} onRetry={() => { refreshRoles(); refreshComm(); }} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader
        title={ts("title")}
        showBack
        subtitle={ts("subtitle")}
      />

      {/* ─── Roles ─── */}
      <SectionHeader
        title={ts("roles")}
        actionLabel={ts("addRole")}
        onAction={openAddRoleSheet}
      />
      <View style={twStyle("rounded-2xl border border-gray-100 bg-white")}>
        {(roles ?? []).length === 0 ? (
          <View style={twStyle("items-center px-4 py-8")}>
            <Text style={twStyle("text-sm text-gray-400")}>
              {ts("noRoles")}
            </Text>
          </View>
        ) : (
          (roles ?? []).map((role, i, arr) => (
            <View
              key={role.id}
              style={twStyle(`flex-row items-center px-4 py-3.5 ${i < arr.length - 1 ? "border-b border-gray-50" : ""}`)}
              accessibilityLabel={`Role ${capitalizeFirst(role.name)}`}
            >
              <View style={twStyle("min-h-[36px] min-w-[36px] items-center justify-center rounded-lg bg-indigo-50")}>
                <Ionicons name="shield-outline" size={18} color="#6366f1" />
              </View>
              <View style={twStyle("ms-3 flex-1")}>
                <Text style={twStyle("text-sm font-medium text-gray-900")}>
                  {capitalizeFirst(role.name)}
                </Text>
                <Text style={twStyle("text-xs text-gray-500")}>
                  {role.description || `${role.permissions_count ?? role.permissions?.length ?? 0} permissions`}
                </Text>
              </View>

              <TouchableOpacity
                style={twStyle("me-2 p-2")}
                onPress={() => openEditRoleSheet(role)}
                hitSlop={8}
                accessibilityLabel={`Edit ${role.name} role`}
                accessibilityRole="button"
              >
                <Ionicons name="create-outline" size={16} color="#6b7280" />
              </TouchableOpacity>
              <TouchableOpacity
                style={twStyle("p-2")}
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
      <SectionHeader title={ts("staffCommissions")} />
      <View style={twStyle("rounded-2xl border border-gray-100 bg-white")}>
        {!staffCommissions || staffCommissions.length === 0 ? (
          <View style={twStyle("items-center px-4 py-8")}>
            <Text style={twStyle("text-sm text-gray-400")}>
              {ts("noStaff")}
            </Text>
          </View>
        ) : (
          staffCommissions.map((member, i, arr) => {
            const isEditing = editingStaffId === member.staffId;
            return (
              <View
                key={member.staffId}
                style={twStyle(`px-4 py-3.5 ${i < arr.length - 1 ? "border-b border-gray-50" : ""}`)}
                accessibilityLabel={`Commission for ${member.name}`}
              >
                <View style={twStyle("flex-row items-center justify-between")}>
                  <View style={twStyle("flex-1")}>
                    <Text style={twStyle("text-sm font-medium text-gray-900")}>
                      {member.name}
                    </Text>
                    <Text style={twStyle("text-xs text-gray-500")}>
                      {capitalizeFirst(member.role?.replace("provider_", "") || ts("staffRoleFallback"))}
                    </Text>
                  </View>

                  {isEditing ? (
                    <View style={twStyle("flex-row items-center")}>
                      <TextInput
                        style={[twStyle("w-20 rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-center text-sm text-gray-900"), { marginEnd: 8 }]}
                        value={commEdits[member.staffId] ?? "0"}
                        onChangeText={(v) => {
                          setCommEdits((prev) => ({ ...prev, [member.staffId]: v }));
                          setCommHasChanges(true);
                        }}
                        keyboardType="decimal-pad"
                        accessibilityLabel={`Commission % for ${member.name}`}
                        autoFocus
                      />
                      <Text style={twStyle("text-sm text-gray-400")}>%</Text>
                      <TouchableOpacity
                        style={twStyle("ms-1 rounded-lg bg-indigo-600 px-3 py-2")}
                        onPress={() => handleSaveStaffCommission(member.staffId)}
                        disabled={savingComm}
                        accessibilityLabel={`Save commission for ${member.name}`}
                        accessibilityRole="button"
                      >
                        <Ionicons name="checkmark" size={16} color="#fff" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={twStyle("rounded-lg bg-gray-100 px-3 py-2")}
                        onPress={() => {
                          setEditingStaffId(null);
                          setCommEdits((prev) => ({
                            ...prev,
                            [member.staffId]: (member.commissionPercentage ?? 0).toString(),
                          }));
                        }}
                        accessibilityLabel={ts("cancelEditingA11y")}
                        accessibilityRole="button"
                      >
                        <Ionicons name="close" size={16} color="#6b7280" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={twStyle("flex-row items-center rounded-lg bg-gray-50 px-3 py-2")}
                      onPress={() => setEditingStaffId(member.staffId)}
                      accessibilityLabel={`Edit commission for ${member.name}`}
                      accessibilityRole="button"
                    >
                      <Text style={twStyle("me-1 text-sm font-semibold text-indigo-600")}>
                        {member.commissionPercentage ?? 0}%
                      </Text>
                      <Ionicons name="create-outline" size={14} color="#6366f1" />
                    </TouchableOpacity>
                  )}
                </View>

                {member.tiers && member.tiers.length > 0 && (
                  <View style={twStyle("mt-2 rounded-lg bg-gray-50 p-2")}>
                    <Text style={twStyle("mb-1 text-xs font-medium text-gray-500")}>
                      {ts("commissionTiers")}
                    </Text>
                    {member.tiers.map((tier, ti) => (
                      <Text key={tier.id ?? ti} style={twStyle("text-xs text-gray-600")}>
                        {ts("tierAboveRevenue", {
                          amount: tier.minRevenue,
                          rate: tier.commissionRate,
                        })}
                      </Text>
                    ))}
                  </View>
                )}
              </View>
            );
          })
        )}
      </View>

      <View style={twStyle("h-8")} />

      {/* ─── Role Add/Edit Bottom Sheet ─── */}
      <BottomSheet
        visible={roleSheetVisible}
        onClose={() => setRoleSheetVisible(false)}
        title={editingRoleId ? ts("roleSheetEditTitle") : ts("roleSheetAddTitle")}
        snapHeight="full"
      >
        {/* Name */}
        <View style={twStyle("mb-4")}>
          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
            {ts("roleNameFieldLabel")} <Text style={twStyle("text-red-500")}>*</Text>
          </Text>
          <TextInput
            style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900")}
            value={roleForm.name}
            onChangeText={(v) =>
              setRoleForm((prev) => ({ ...prev, name: v }))
            }
            placeholder={ts("roleNameExamplePlaceholder")}
            placeholderTextColor="#9ca3af"
            accessibilityLabel={ts("roleNameA11y")}
          />
        </View>

        {/* Description */}
        <View style={twStyle("mb-4")}>
          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
            {ts("descriptionLabel")}
          </Text>
          <TextInput
            style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900")}
            value={roleForm.description}
            onChangeText={(v) =>
              setRoleForm((prev) => ({ ...prev, description: v }))
            }
            placeholder={ts("roleDescInputPlaceholder")}
            placeholderTextColor="#9ca3af"
            multiline
            accessibilityLabel={ts("roleDescA11y")}
          />
        </View>

        {/* Permissions */}
        <Text style={twStyle("mb-3 text-sm font-semibold text-gray-900")}>
          {ts("permissionsSection")}
        </Text>
        {AVAILABLE_PERMISSIONS.map((perm) => {
          const checked = roleForm.permissions.includes(perm.key);
          return (
            <TouchableOpacity
              key={perm.key}
              style={twStyle("mb-2 flex-row items-center rounded-xl bg-gray-50 px-4 py-3")}
              onPress={() => togglePermission(perm.key)}
              accessibilityLabel={ts("permissionA11y", {
                label: perm.label,
                state: checked ? ts("permissionEnabled") : ts("permissionDisabled"),
              })}
              accessibilityRole="checkbox"
            >
              <View
                style={twStyle(`me-3 h-5 w-5 items-center justify-center rounded ${checked ? "bg-indigo-600" : "border border-gray-300 bg-white"}`)}
              >
                {checked && (
                  <Ionicons name="checkmark" size={14} color="#fff" />
                )}
              </View>
              <View style={twStyle("flex-1")}>
                <Text style={twStyle("text-sm font-medium text-gray-800")}>
                  {perm.label}
                </Text>
                {perm.description && (
                  <Text style={twStyle("text-xs text-gray-400")}>
                    {perm.description}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          );
        })}

        <View style={twStyle("mt-4")}>
          <ActionButton
            label={
              isSavingRole
                ? ts("saving")
                : editingRoleId
                  ? ts("updateRoleButton")
                  : ts("addRoleButton")
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
