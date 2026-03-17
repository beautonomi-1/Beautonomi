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
    const { error } = await updatePerms(
      `/api/provider/staff/${id}/permissions`,
      { permissions: local }
    );
    if (error) {
      Alert.alert("Could not save", error);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await refresh();
  }, [id, local, updatePerms, refresh]);

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
                  />
                </View>
              ))}
            </View>
          </View>
        ))}
        <ActionButton
          label="Save permissions"
          onPress={handleSave}
          loading={saving}
          fullWidth
        />
      </ScrollView>
    </ScreenContainer>
  );
}
