/**
 * Staff permissions – list staff and open permission editor.
 */
import { useState, useCallback } from "react";
import { View, Text, TouchableOpacity, FlatList } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "@beautonomi/i18n";
import { useApi } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Avatar } from "@/components/ui/Avatar";
import { twStyle } from "@/lib/twStyle";
import { verticalFlatListPerf } from "@/lib/flatListPerformance";
import { DirectionalIcon } from "@/components/ui/DirectionalIcon";

interface StaffMember {
  id: string;
  name: string;
  email?: string | null;
  role?: string;
  is_admin?: boolean;
}
interface TeamAccessPayload {
  staff_id: string | null;
  is_business_owner?: boolean;
  can_manage_team: boolean;
}

export default function StaffPermissionsListScreen() {
  const { t } = useTranslation();
  const sp = (key: string) => t(`provider.mobile.screens.staffPermissions.${key}`) as string;
  const roleLabel = (role?: string) => {
    if (role === "provider_owner") return sp("roleOwner");
    if (role === "provider_manager") return sp("roleManager");
    if (role === "provider_staff") return sp("roleStaff");
    return role || sp("roleStaff");
  };
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const { data: access } = useApi<TeamAccessPayload>("/api/provider/team-access");
  const canManageTeam =
    access?.is_business_owner === true || access?.can_manage_team === true;
  const ownStaffId = access?.staff_id ?? null;
  const { data: staffList, loading, error: staffError, refresh } = useApi<StaffMember[]>(
    "/api/provider/staff"
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  if (loading && !staffList) {
    return (
      <ScreenContainer scrollable={false}>
        <LoadingState message={sp("loading")} />
      </ScreenContainer>
    );
  }

  if (staffError && !staffList) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title={sp("title")} showBack subtitle={sp("subtitleEdit")} />
        <ErrorState message={staffError} onRetry={refresh} />
      </ScreenContainer>
    );
  }

  const list = staffList ?? [];

  return (
    <ScreenContainer refreshing={refreshing} onRefresh={handleRefresh}>
      <ScreenHeader
        title={sp("title")}
        showBack
        subtitle={canManageTeam ? sp("subtitleEdit") : sp("subtitleReadOnly")}
      />
      {!canManageTeam ? (
        <Text style={twStyle("mb-3 px-1 text-xs text-gray-500")}>
          {sp("readOnlyHint")}
        </Text>
      ) : null}
      {list.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title={sp("emptyTitle")}
          description={sp("emptyDescription")}
        />
      ) : (
        <FlatList
          {...verticalFlatListPerf}
          data={list}
          keyExtractor={(s: StaffMember) => s.id}
          contentContainerStyle={{ paddingBottom: 120 }}
          renderItem={({ item }: { item: StaffMember }) => (
            <TouchableOpacity
              style={twStyle("mb-2 flex-row items-center rounded-xl border border-gray-100 bg-white p-4")}
              onPress={() => {
                if (!canManageTeam && ownStaffId !== item.id) return;
                router.push(
                  `/(app)/(tabs)/more/settings/staff-permissions/${item.id}` as never
                );
              }}
              disabled={!canManageTeam && ownStaffId !== item.id}
            >
              <Avatar name={item.name} size="md" />
              <View style={twStyle("ms-3 flex-1")}>
                <Text style={twStyle("font-medium text-gray-900")}>{item.name}</Text>
                <Text style={twStyle("text-xs text-gray-500")}>
                  {roleLabel(item.role)}
                  {item.is_admin ? sp("adminSuffix") : ""}
                </Text>
              </View>
              <DirectionalIcon
                name="chevron-forward"
                size={18}
                color={!canManageTeam && ownStaffId !== item.id ? "#d1d5db" : "#9ca3af"}
              />
            </TouchableOpacity>
          )}
        />
      )}
      <View style={twStyle("h-8")} />
    </ScreenContainer>
  );
}
