/**
 * Staff permissions – list staff and open permission editor.
 */
import { useState, useCallback } from "react";
import { View, Text, TouchableOpacity, FlatList } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useApi } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Avatar } from "@/components/ui/Avatar";
import { twStyle } from "@/lib/twStyle";
import { verticalFlatListPerf } from "@/lib/flatListPerformance";

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

const ROLE_LABEL: Record<string, string> = {
  provider_owner: "Owner",
  provider_manager: "Manager",
  provider_staff: "Staff",
};

export default function StaffPermissionsListScreen() {
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
        <LoadingState message="Loading staff..." />
      </ScreenContainer>
    );
  }

  if (staffError && !staffList) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Staff permissions" showBack subtitle="Edit per-staff access" />
        <ErrorState message={staffError} onRetry={refresh} />
      </ScreenContainer>
    );
  }

  const list = staffList ?? [];

  return (
    <ScreenContainer refreshing={refreshing} onRefresh={handleRefresh}>
      <ScreenHeader
        title="Staff permissions"
        showBack
        subtitle={canManageTeam ? "Edit per-staff access" : "View permissions (read-only)"}
      />
      {!canManageTeam ? (
        <Text style={twStyle("mb-3 px-1 text-xs text-gray-500")}>
          You can only open your own permissions. Ask an owner/manager with Manage team to update access.
        </Text>
      ) : null}
      {list.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title="No staff"
          description="Add team members in Team settings first."
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
              <View style={twStyle("ml-3 flex-1")}>
                <Text style={twStyle("font-medium text-gray-900")}>{item.name}</Text>
                <Text style={twStyle("text-xs text-gray-500")}>
                  {item.role ? ROLE_LABEL[item.role] ?? item.role : "Staff"}
                  {item.is_admin ? " • Admin" : ""}
                </Text>
              </View>
              <Ionicons
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
