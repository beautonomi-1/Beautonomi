/**
 * Edit permissions for one staff member.
 * GET/PATCH /api/provider/staff/[id]/permissions
 */
import { useState, useCallback, useEffect } from "react";
import { View, Text, Switch, ScrollView } from "react-native";
import { useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ActionButton } from "@/components/ui/ActionButton";
import { LoadingState } from "@/components/ui/LoadingState";

interface PermissionsResponse {
  permissions: Record<string, boolean>;
}

const PERMISSION_LABELS: Record<string, string> = {
  view_calendar: "View calendar",
  create_appointments: "Create appointments",
  edit_appointments: "Edit appointments",
  cancel_appointments: "Cancel appointments",
  delete_appointments: "Delete appointments",
  view_sales: "View sales",
  create_sales: "Create sales",
  process_payments: "Process payments",
  view_reports: "View reports",
  view_services: "View services",
  edit_services: "Edit services",
  view_products: "View products",
  edit_products: "Edit products",
  view_team: "View team",
  manage_team: "Manage team",
  view_settings: "View settings",
  edit_settings: "Edit settings",
  view_clients: "View clients",
  edit_clients: "Edit clients",
};

export default function StaffPermissionEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [local, setLocal] = useState<Record<string, boolean>>({});
  const { data, loading, refresh } = useApi<PermissionsResponse>(
    id ? `/api/provider/staff/${id}/permissions` : "",
    { enabled: !!id }
  );
  const { execute: updatePerms, loading: saving } = useApiMutation("patch");

  useEffect(() => {
    if (data?.permissions) setLocal(data.permissions);
  }, [data]);

  const handleSave = useCallback(async () => {
    const { error } = await updatePerms(
      `/api/provider/staff/${id}/permissions`,
      { permissions: local }
    );
    if (!error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refresh();
    }
  }, [id, local, updatePerms, refresh]);

  function setPermission(key: string, value: boolean) {
    setLocal((p) => ({ ...p, [key]: value }));
  }

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <LoadingState message="Loading permissions..." />
      </ScreenContainer>
    );
  }

  const keys = Object.keys(PERMISSION_LABELS);

  return (
    <ScreenContainer>
      <ScreenHeader title="Permissions" showBack />
      <SectionHeader title="Access" />
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        <View className="mb-4 rounded-2xl border border-gray-100 bg-white">
          {keys.map((key, i) => (
            <View
              key={key}
              className={`flex-row items-center justify-between px-4 py-3.5 ${
                i < keys.length - 1 ? "border-b border-gray-50" : ""
              }`}
            >
              <Text className="text-sm text-gray-700">
                {PERMISSION_LABELS[key] ?? key}
              </Text>
              <Switch
                value={local[key] ?? false}
                onValueChange={(v) => setPermission(key, v)}
                trackColor={{ false: "#d1d5db", true: "#6366f1" }}
              />
            </View>
          ))}
        </View>
        <ActionButton
          label="Save permissions"
          onPress={handleSave}
          loading={saving}
          fullWidth
        />
        <View className="h-8" />
      </ScrollView>
    </ScreenContainer>
  );
}
