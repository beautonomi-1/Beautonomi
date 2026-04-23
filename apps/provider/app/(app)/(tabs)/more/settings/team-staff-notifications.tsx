/**
 * Team notifications — list staff and open per-member notification settings (web parity:
 * GET/PATCH /api/provider/staff/[id]/notifications).
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

const ROLE_LABEL: Record<string, string> = {
  provider_owner: "Owner",
  provider_manager: "Manager",
  provider_staff: "Staff",
};

export default function TeamStaffNotificationsListScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const { data: staffRaw, loading, error: staffError, refresh } = useApi<StaffMember[] | { data?: StaffMember[] }>(
    "/api/provider/staff"
  );

  const staffList: StaffMember[] = Array.isArray(staffRaw)
    ? staffRaw
    : (staffRaw as { data?: StaffMember[] })?.data ?? [];

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  if (loading && !staffRaw) {
    return (
      <ScreenContainer scrollable={false}>
        <LoadingState message="Loading team..." />
      </ScreenContainer>
    );
  }

  if (staffError && !staffRaw) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Team notifications" showBack subtitle="Per-member preferences" />
        <ErrorState message={staffError} onRetry={refresh} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer refreshing={refreshing} onRefresh={handleRefresh}>
      <ScreenHeader title="Team notifications" showBack subtitle="Email, SMS & scheduling alerts per person" />
      {staffList.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title="No team members"
          description="Add staff in Team first, then configure their notifications here."
        />
      ) : (
        <FlatList
          {...verticalFlatListPerf}
          data={staffList}
          keyExtractor={(s: StaffMember) => s.id}
          contentContainerStyle={{ paddingBottom: 120 }}
          renderItem={({ item }: { item: StaffMember }) => (
            <TouchableOpacity
              style={twStyle("mb-2 flex-row items-center rounded-xl border border-gray-100 bg-white p-4")}
              onPress={() =>
                router.push(`/(app)/(tabs)/more/settings/staff-notifications/${item.id}` as never)
              }
            >
              <Avatar name={item.name} size="md" />
              <View style={twStyle("ml-3 flex-1")}>
                <Text style={twStyle("font-medium text-gray-900")}>{item.name}</Text>
                <Text style={twStyle("text-xs text-gray-500")}>
                  {item.role ? ROLE_LABEL[item.role] ?? item.role : "Staff"}
                  {item.is_admin ? " • Admin" : ""}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
            </TouchableOpacity>
          )}
        />
      )}
    </ScreenContainer>
  );
}
