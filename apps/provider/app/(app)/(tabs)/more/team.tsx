import { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useApi } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";

type StaffMember = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  is_active: boolean;
};

export default function TeamScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ add?: string }>();
  const [refreshing, setRefreshing] = useState(false);
  const { data, loading, error, refresh } = useApi<StaffMember[] | { data?: StaffMember[] }>(
    "/api/provider/staff"
  );

  const staff: StaffMember[] = Array.isArray(data) ? data : (data as { data?: StaffMember[] })?.data ?? [];

  // "Add team member" from Staff Schedules links to Team?add=1 → open add flow (team-list)
  useEffect(() => {
    if (params.add === "1") {
      router.replace("/(app)/(tabs)/more/team-list" as never);
    }
  }, [params.add, router]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Team" onBack={() => router.back()} />
        <View className="flex-1 items-center justify-center py-12">
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Team" onBack={() => router.back()} />
        <View className="flex-1 justify-center px-4">
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader
        title="Team & scheduling"
        subtitle="Staff, shifts & time clock"
        onBack={() => router.back()}
        rightAction={
          <TouchableOpacity
            onPress={() => router.push("/(app)/(tabs)/more/team-list" as never)}
            className="flex-row items-center rounded-xl bg-teal-600 px-4 py-2"
            accessibilityLabel="Add team member"
            accessibilityRole="button"
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text className="ml-1.5 text-sm font-semibold text-white">Add member</Text>
          </TouchableOpacity>
        }
      />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {staff.length === 0 ? (
          <View className="py-12 px-4 items-center">
            <Ionicons name="people-circle-outline" size={48} color="#9ca3af" />
            <Text className="mt-4 text-center text-gray-600">No team members yet</Text>
            <Text className="mt-2 text-center text-sm text-gray-500 mb-4">
              Add your first team member in the app
            </Text>
            <TouchableOpacity
              onPress={() => router.push("/(app)/(tabs)/more/team-list" as never)}
              className="rounded-xl bg-teal-600 px-6 py-3"
              activeOpacity={0.8}
            >
              <Text className="font-semibold text-white">Add team member</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View className="pb-4">
            {staff.map((member) => (
              <TouchableOpacity
                key={member.id}
                onPress={() => router.push("/(app)/(tabs)/more/team-list" as never)}
                className="mb-3 flex-row items-center rounded-xl border border-gray-200 bg-white p-4"
                activeOpacity={0.7}
              >
                <View className="h-10 w-10 items-center justify-center rounded-full bg-gray-200">
                  <Text className="text-sm font-semibold text-gray-700">
                    {(member.name || "?").charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View className="ml-3 flex-1">
                  <Text className="font-semibold text-gray-900">{member.name}</Text>
                  <Text className="text-sm text-gray-500" numberOfLines={1}>
                    {member.email}
                  </Text>
                  {!member.is_active && (
                    <View className="mt-1 self-start rounded bg-gray-200 px-2 py-0.5">
                      <Text className="text-xs text-gray-600">Inactive</Text>
                    </View>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
