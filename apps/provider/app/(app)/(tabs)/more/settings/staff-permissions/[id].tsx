/**
 * Edit permissions for one staff member.
 * GET /api/provider/staff/[id]/permissions
 * PATCH /api/provider/staff/[id]/permissions
 */
import { useState, useCallback, useEffect, useMemo } from "react";
import { View, Text, Switch, ScrollView, Alert } from "react-native";
import { useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ActionButton } from "@/components/ui/ActionButton";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { twStyle } from "@/lib/twStyle";

interface PermissionsResponse {
  permissions: Record<string, boolean>;
}
interface TeamAccessPayload {
  staff_id: string | null;
  can_manage_team: boolean;
}

/** All permissions grouped by category to match web. Order and keys align with backend StaffPermissions. */
const PERMISSION_CATEGORIES: {
  title: string;
  permissions: { id: string; label: string }[];
}[] = [
  {
    title: "Calendar & Appointments",
    permissions: [
      { id: "view_calendar", label: "View calendar" },
      { id: "create_appointments", label: "Create appointments" },
      { id: "edit_appointments", label: "Edit appointments" },
      { id: "cancel_appointments", label: "Cancel appointments" },
      { id: "delete_appointments", label: "Delete appointments" },
    ],
  },
  {
    title: "Sales & Payments",
    permissions: [
      { id: "view_sales", label: "View sales" },
      { id: "create_sales", label: "Create sales" },
      { id: "process_payments", label: "Process payments" },
      { id: "view_reports", label: "View reports" },
    ],
  },
  {
    title: "Services & Products",
    permissions: [
      { id: "view_services", label: "View services" },
      { id: "edit_services", label: "Edit services" },
      { id: "view_products", label: "View products" },
      { id: "edit_products", label: "Edit products" },
    ],
  },
  {
    title: "Team",
    permissions: [
      { id: "view_team", label: "View team" },
      { id: "manage_team", label: "Manage team" },
    ],
  },
  {
    title: "Settings",
    permissions: [
      { id: "view_settings", label: "View settings" },
      { id: "edit_settings", label: "Edit settings" },
    ],
  },
  {
    title: "Clients",
    permissions: [
      { id: "view_clients", label: "View clients" },
      { id: "edit_clients", label: "Edit clients" },
    ],
  },
  {
    title: "Reviews",
    permissions: [
      { id: "view_reviews", label: "View reviews" },
      { id: "edit_reviews", label: "Edit / respond to reviews" },
    ],
  },
  {
    title: "Messages",
    permissions: [
      { id: "view_messages", label: "View messages" },
      { id: "send_messages", label: "Send messages" },
    ],
  },
  {
    title: "Explore",
    permissions: [{ id: "create_explore_posts", label: "Create Explore posts" }],
  },
];

/** Flat list of all permission ids in display order (for default state merge). */
const ALL_PERMISSION_IDS = PERMISSION_CATEGORIES.flatMap((c) =>
  c.permissions.map((p) => p.id)
);

export default function StaffPermissionEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [local, setLocal] = useState<Record<string, boolean>>({});
  const { data: access } = useApi<TeamAccessPayload>("/api/provider/team-access");
  const canManageTeam = access?.can_manage_team === true;
  const isSelf = Boolean(id && access?.staff_id === id);
  const canEdit = canManageTeam;
  const readOnlyReason = !canEdit && isSelf
    ? "You can view your permissions here, but only owners/managers with Manage team can change them."
    : !canEdit
      ? "You do not have permission to edit this staff member's permissions."
      : null;
  const { data, loading, error, refresh } = useApi<PermissionsResponse>(
    id ? `/api/provider/staff/${id}/permissions` : "",
    { enabled: !!id }
  );
  const { execute: updatePerms, loading: saving } = useApiMutation("patch");

  const defaultPermissions = useMemo(
    () => Object.fromEntries(ALL_PERMISSION_IDS.map((k) => [k, false])),
    []
  );

  useEffect(() => {
    if (data?.permissions && typeof data.permissions === "object") {
      setLocal({ ...defaultPermissions, ...data.permissions });
    }
  }, [data, defaultPermissions]);

  const handleSave = useCallback(async () => {
    if (!id) return;
    if (!canEdit) {
      Alert.alert("Read only", readOnlyReason ?? "You do not have permission to edit permissions.");
      return;
    }
    const { error } = await updatePerms(
      `/api/provider/staff/${id}/permissions`,
      { permissions: local }
    );
    if (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Could not save", error);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await refresh();
    // §Provider-audit 2026-04: previously this screen only fired a haptic on
    // success, so staff owners pressing Save saw no visible confirmation and
    // repeatedly re-tapped. Surface a short confirmation alert mirroring the
    // feedback pattern used across the provider app.
    Alert.alert("Permissions updated", "Changes saved successfully.");
  }, [id, local, updatePerms, refresh, canEdit, readOnlyReason]);

  function setPermission(key: string, value: boolean) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLocal((p) => ({ ...p, [key]: value }));
  }

  if (!id) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Permissions" showBack />
        <LoadingState message="No staff selected" />
      </ScreenContainer>
    );
  }

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <LoadingState message="Loading permissions..." />
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Permissions" showBack />
        <ErrorState message={error} onRetry={refresh} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader
        title="Permissions"
        showBack
        subtitle="Toggle what this team member can access"
      />
      <ScrollView
        style={twStyle("flex-1")}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={twStyle("pb-8")}
      >
        {PERMISSION_CATEGORIES.map((group) => (
          <View key={group.title} style={twStyle("mb-6")}>
            <SectionHeader title={group.title} />
            <View
              style={twStyle(
                "rounded-2xl border border-gray-100 bg-white overflow-hidden"
              )}
            >
              {group.permissions.map((perm, i) => (
                <View
                  key={perm.id}
                  style={[
                    twStyle("flex-row items-center justify-between px-4 py-3.5"),
                    i < group.permissions.length - 1 && twStyle("border-b border-gray-50"),
                  ]}
                >
                  <Text
                    style={twStyle("text-sm text-gray-700 flex-1")}
                    numberOfLines={2}
                  >
                    {perm.label}
                  </Text>
                  <Switch
                    value={local[perm.id] ?? false}
                    onValueChange={(v) => setPermission(perm.id, v)}
                    trackColor={{ false: "#d1d5db", true: "#6366f1" }}
                    thumbColor="#fff"
                    disabled={!canEdit}
                  />
                </View>
              ))}
            </View>
          </View>
        ))}
        {readOnlyReason ? (
          <Text style={twStyle("mb-3 text-xs text-gray-500")}>{readOnlyReason}</Text>
        ) : null}
        <ActionButton
          label={canEdit ? "Save permissions" : "Permissions are read only"}
          onPress={handleSave}
          loading={saving}
          fullWidth
          disabled={!canEdit}
        />
      </ScrollView>
    </ScreenContainer>
  );
}
