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

export default function StaffPermissionsListScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const { data: staffList, loading, error: staffError, refresh } = useApi<StaffMember[]>(
    "/api/provider/staff"
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
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
        subtitle="Edit per-staff access"
      />
      {list.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title="No staff"
          description="Add team members in Team settings first."
        />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(s: StaffMember) => s.id}
          contentContainerStyle={{ paddingBottom: 120 }}
          renderItem={({ item }: { item: StaffMember }) => (
            <TouchableOpacity
              style={twStyle("mb-2 flex-row items-center rounded-xl border border-gray-100 bg-white p-4")}
              onPress={() =>
                router.push(
                  `/(app)/(tabs)/more/settings/staff-permissions/${item.id}` as any
                )
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
      <View style={twStyle("h-8")} />
    </ScreenContainer>
  );
}
