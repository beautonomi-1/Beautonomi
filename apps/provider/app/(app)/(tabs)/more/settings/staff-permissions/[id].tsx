/**
 * Edit permissions for one staff member.
 * GET /api/provider/staff/[id]/permissions
 * PATCH /api/provider/staff/[id]/permissions
 */
import { useState, useCallback, useEffect, useMemo } from "react";
import { View, Text, Switch, ScrollView, Alert } from "react-native";
import { useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { useTranslation } from "@beautonomi/i18n";
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
  is_business_owner?: boolean;
  can_manage_team: boolean;
}

/** All permissions grouped by category to match web. Order and keys align with backend StaffPermissions. */
const PERMISSION_CATEGORIES: {
  titleKey: string;
  permissions: { id: string; labelKey: string }[];
}[] = [
  {
    titleKey: "catCalendar",
    permissions: [
      { id: "view_calendar", labelKey: "viewCalendar" },
      { id: "create_appointments", labelKey: "createAppointments" },
      { id: "edit_appointments", labelKey: "editAppointments" },
      { id: "cancel_appointments", labelKey: "cancelAppointments" },
      { id: "delete_appointments", labelKey: "deleteAppointments" },
    ],
  },
  {
    titleKey: "catSales",
    permissions: [
      { id: "view_sales", labelKey: "viewSales" },
      { id: "create_sales", labelKey: "createSales" },
      { id: "process_payments", labelKey: "processPayments" },
      { id: "view_reports", labelKey: "viewReports" },
    ],
  },
  {
    titleKey: "catServices",
    permissions: [
      { id: "view_services", labelKey: "viewServices" },
      { id: "edit_services", labelKey: "editServices" },
      { id: "view_products", labelKey: "viewProducts" },
      { id: "edit_products", labelKey: "editProducts" },
    ],
  },
  {
    titleKey: "catTeam",
    permissions: [
      { id: "view_team", labelKey: "viewTeam" },
      { id: "manage_team", labelKey: "manageTeam" },
    ],
  },
  {
    titleKey: "catSettings",
    permissions: [
      { id: "view_settings", labelKey: "viewSettings" },
      { id: "edit_settings", labelKey: "editSettings" },
    ],
  },
  {
    titleKey: "catClients",
    permissions: [
      { id: "view_clients", labelKey: "viewClients" },
      { id: "edit_clients", labelKey: "editClients" },
    ],
  },
  {
    titleKey: "catReviews",
    permissions: [
      { id: "view_reviews", labelKey: "viewReviews" },
      { id: "edit_reviews", labelKey: "editReviews" },
      { id: "view_client_ratings", labelKey: "viewClientRatings" },
      { id: "rate_clients", labelKey: "rateClients" },
    ],
  },
  {
    titleKey: "catMessages",
    permissions: [
      { id: "view_messages", labelKey: "viewMessages" },
      { id: "send_messages", labelKey: "sendMessages" },
    ],
  },
  {
    titleKey: "catExplore",
    permissions: [{ id: "create_explore_posts", labelKey: "createExplorePosts" }],
  },
];

/** Flat list of all permission ids in display order (for default state merge). */
const ALL_PERMISSION_IDS = PERMISSION_CATEGORIES.flatMap((c) =>
  c.permissions.map((p) => p.id)
);

export default function StaffPermissionEditScreen() {
  const { t } = useTranslation();
  const pe = (key: string) => t(`provider.mobile.screens.staffPermissionsEdit.${key}`) as string;
  const { id } = useLocalSearchParams<{ id: string }>();
  const [local, setLocal] = useState<Record<string, boolean>>({});
  const { data: access } = useApi<TeamAccessPayload>("/api/provider/team-access");
  const canManageTeam =
    access?.is_business_owner === true || access?.can_manage_team === true;
  const isSelf = Boolean(id && access?.staff_id === id);
  const canEdit = canManageTeam;
  const readOnlyReason = !canEdit && isSelf
    ? pe("readOnlySelf")
    : !canEdit
      ? pe("readOnlyOther")
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
      Alert.alert(pe("readOnlyTitle"), readOnlyReason ?? pe("readOnlyFallback"));
      return;
    }
    const { error } = await updatePerms(
      `/api/provider/staff/${id}/permissions`,
      { permissions: local }
    );
    if (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(pe("couldNotSave"), error);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await refresh();
    // §Provider-audit 2026-04: previously this screen only fired a haptic on
    // success, so staff owners pressing Save saw no visible confirmation and
    // repeatedly re-tapped. Surface a short confirmation alert mirroring the
    // feedback pattern used across the provider app.
    Alert.alert(pe("updatedTitle"), pe("updatedBody"));
  }, [id, local, updatePerms, refresh, canEdit, readOnlyReason, t]);

  function setPermission(key: string, value: boolean) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLocal((p) => ({ ...p, [key]: value }));
  }

  if (!id) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title={pe("title")} showBack />
        <LoadingState message={pe("noStaffSelected")} />
      </ScreenContainer>
    );
  }

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <LoadingState message={pe("loading")} />
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title={pe("title")} showBack />
        <ErrorState message={error} onRetry={refresh} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader
        title={pe("title")}
        showBack
        subtitle={pe("subtitle")}
      />
      <ScrollView
        style={twStyle("flex-1")}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={twStyle("pb-8")}
      >
        {PERMISSION_CATEGORIES.map((group) => (
          <View key={group.titleKey} style={twStyle("mb-6")}>
            <SectionHeader title={pe(group.titleKey)} />
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
                    {pe(perm.labelKey)}
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
          label={canEdit ? pe("save") : pe("readOnlyCta")}
          onPress={handleSave}
          loading={saving}
          fullWidth
          disabled={!canEdit}
        />
      </ScrollView>
    </ScreenContainer>
  );
}
