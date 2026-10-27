/**
 * Edit permissions for one staff member.
 * GET /api/provider/staff/[id]/permissions
 * PATCH /api/provider/staff/[id]/permissions
 */
import { useState, useCallback, useEffect, useMemo } from "react";
import { View, Text, Switch, ScrollView, Alert, TouchableOpacity } from "react-native";
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
  permissions: Record<string, boolean | string>;
  role_id?: string | null;
  role_name?: string | null;
}
interface TeamAccessPayload {
  staff_id: string | null;
  is_business_owner?: boolean;
  can_manage_team: boolean;
}
interface StaffSettingsPayload {
  role?: string;
  is_admin?: boolean;
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
      { id: "manage_finance", labelKey: "manageFinance" },
      { id: "manage_payroll", labelKey: "managePayroll" },
      { id: "view_own_earnings", labelKey: "viewOwnEarnings" },
      { id: "manage_marketing", labelKey: "manageMarketing" },
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
  const [calendarScope, setCalendarScope] = useState<"own" | "all">("own");
  const [attachedRoleId, setAttachedRoleId] = useState<string | null>(null);
  const [attachedRoleName, setAttachedRoleName] = useState<string | null>(null);
  const { data: access } = useApi<TeamAccessPayload>("/api/provider/team-access");
  const canManageTeam =
    access?.is_business_owner === true || access?.can_manage_team === true;
  const { data: staffSettings } = useApi<StaffSettingsPayload>(
    id ? `/api/provider/staff/${id}/settings` : "",
    { enabled: !!id },
  );
  const memberFullAccess =
    staffSettings?.role === "provider_owner" || staffSettings?.is_admin === true;
  const isSelf = Boolean(id && access?.staff_id === id);
  const canEdit = canManageTeam && !memberFullAccess;
  const readOnlyReason = memberFullAccess
    ? pe("fullAccessMemberHint")
    : !canManageTeam && isSelf
      ? pe("readOnlySelf")
      : !canManageTeam
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
      const raw = data.permissions as Record<string, boolean | string>;
      setCalendarScope(raw.calendar_scope === "all" ? "all" : "own");
      const booleans = { ...defaultPermissions };
      for (const [k, v] of Object.entries(raw)) {
        if (k === "calendar_scope") continue;
        if (typeof v === "boolean") booleans[k] = v;
      }
      setLocal(booleans);
      setAttachedRoleId(data.role_id ?? null);
      setAttachedRoleName(data.role_name ?? null);
    }
  }, [data, defaultPermissions]);

  const handleSave = useCallback(async () => {
    if (!id) return;
    if (!canEdit) {
      Alert.alert(pe("readOnlyTitle"), readOnlyReason ?? pe("readOnlyFallback"));
      return;
    }
    const saveNow = async () => {
      const { error } = await updatePerms(
        `/api/provider/staff/${id}/permissions`,
        { permissions: local, calendar_scope: calendarScope },
      );
      if (error) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert(pe("couldNotSave"), error);
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await refresh();
      Alert.alert(pe("updatedTitle"), pe("updatedBody"));
    };
    if (attachedRoleId && attachedRoleName) {
      Alert.alert(
        pe("detachRoleTitle"),
        pe("detachRoleBody", { role: attachedRoleName }),
        [
          { text: pe("cancel"), style: "cancel" },
          { text: pe("continueSave"), onPress: () => void saveNow() },
        ],
      );
      return;
    }
    await saveNow();
  }, [
    id,
    local,
    calendarScope,
    updatePerms,
    refresh,
    canEdit,
    readOnlyReason,
    attachedRoleId,
    attachedRoleName,
    pe,
  ]);

  function setPermission(key: string, value: boolean) {
    if (!canEdit) return;
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
        {memberFullAccess ? (
          <Text style={twStyle("mb-4 text-sm text-gray-600")}>{pe("fullAccessMemberHint")}</Text>
        ) : null}
        <View style={twStyle("mb-6")}>
          <SectionHeader title={pe("calendarScopeLabel")} />
          <View style={twStyle("flex-row rounded-xl border border-gray-200 bg-gray-50 p-1")}>
            {(["own", "all"] as const).map((scope) => (
              <TouchableOpacity
                key={scope}
                style={twStyle(
                  `flex-1 rounded-lg py-2.5 ${calendarScope === scope ? "bg-white shadow-sm" : ""}`,
                )}
                onPress={() => canEdit && setCalendarScope(scope)}
                disabled={!canEdit}
              >
                <Text
                  style={twStyle(
                    `text-center text-xs font-medium ${calendarScope === scope ? "text-indigo-600" : "text-gray-500"}`,
                  )}
                >
                  {pe(scope === "own" ? "calendarScopeOwn" : "calendarScopeAll")}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
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
        {readOnlyReason && !memberFullAccess ? (
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
