import { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useApi } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Colors } from "@/constants/colors";

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
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 48 }}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Team" onBack={() => router.back()} />
        <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 16 }}>
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
            style={{ flexDirection: "row", alignItems: "center", borderRadius: 12, backgroundColor: "#0d9488", paddingHorizontal: 16, paddingVertical: 8 }}
            accessibilityLabel="Add team member"
            accessibilityRole="button"
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={{ marginLeft: 6, fontSize: 14, fontWeight: "600", color: Colors.white }}>Add member</Text>
          </TouchableOpacity>
        }
      />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {staff.length === 0 ? (
          <View style={{ paddingVertical: 48, paddingHorizontal: 16, alignItems: "center" }}>
            <Ionicons name="people-circle-outline" size={48} color="#9ca3af" />
            <Text style={{ marginTop: 16, textAlign: "center", color: Colors.gray[600] }}>No team members yet</Text>
            <Text style={{ marginTop: 8, textAlign: "center", fontSize: 14, color: Colors.gray[500], marginBottom: 16 }}>
              Add your first team member in the app
            </Text>
            <TouchableOpacity
              onPress={() => router.push("/(app)/(tabs)/more/team-list" as never)}
              style={{ borderRadius: 12, backgroundColor: "#0d9488", paddingHorizontal: 24, paddingVertical: 12 }}
              activeOpacity={0.8}
            >
              <Text style={{ fontWeight: "600", color: Colors.white }}>Add team member</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ paddingBottom: 16 }}>
            {staff.map((member) => (
              <TouchableOpacity
                key={member.id}
                onPress={() => router.push("/(app)/(tabs)/more/team-list" as never)}
                style={{ marginBottom: 12, flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, padding: 16 }}
                activeOpacity={0.7}
              >
                <View style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 20, backgroundColor: Colors.gray[200] }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[700] }}>
                    {(member.name || "?").charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={{ marginLeft: 12, flex: 1 }}>
                  <Text style={{ fontWeight: "600", color: Colors.gray[900] }}>{member.name}</Text>
                  <Text style={{ fontSize: 14, color: Colors.gray[500] }} numberOfLines={1}>
                    {member.email}
                  </Text>
                  {!member.is_active && (
                    <View style={{ marginTop: 4, alignSelf: "flex-start", borderRadius: 4, backgroundColor: Colors.gray[200], paddingHorizontal: 8, paddingVertical: 2 }}>
                      <Text style={{ fontSize: 12, color: Colors.gray[600] }}>Inactive</Text>
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
