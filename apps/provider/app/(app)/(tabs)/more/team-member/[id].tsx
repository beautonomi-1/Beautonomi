/**
 * Staff member detail – profile, quick actions (permissions, locations, schedule, etc.).
 * GET /api/provider/staff/[id], PATCH for edit.
 */
import { useState, useCallback } from "react";
import { View, Text, TouchableOpacity, ScrollView, Alert, RefreshControl } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Avatar } from "@/components/ui/Avatar";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { capitalizeFirst } from "@/lib/format";
import { twStyle } from "@/lib/twStyle";

interface StaffMember {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  avatar_url?: string | null;
  role: string;
  is_active: boolean;
  mobileReady?: boolean;
}

const LINK_ITEMS: { label: string; icon: keyof typeof Ionicons.glyphMap; route: string; useId?: boolean }[] = [
  { label: "Permissions", icon: "lock-open-outline", route: "/(app)/(tabs)/more/settings/staff-permissions", useId: true },
  { label: "Locations", icon: "location-outline", route: "/(app)/(tabs)/more/locations" },
  { label: "Schedule", icon: "calendar-outline", route: "/(app)/(tabs)/more/staff-schedule" },
  { label: "Days off", icon: "sunny-outline", route: "/(app)/(tabs)/more/days-off" },
  { label: "Commission", icon: "cash-outline", route: "/(app)/(tabs)/more/settings/team-commissions" },
];

export default function TeamMemberDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const { data: member, loading, error, refresh } = useApi<StaffMember>(
    id ? `/api/provider/staff/${id}` : "",
    { enabled: !!id }
  );
  const { execute: updateStaff, loading: saving } = useApiMutation("patch");

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const handleToggleActive = useCallback(() => {
    if (!member) return;
    const newActive = !member.is_active;
    Alert.alert(
      newActive ? "Activate" : "Deactivate",
      newActive
        ? `Activate ${member.name}? They will appear in the team and can be assigned.`
        : `Deactivate ${member.name}? They will be hidden from the team and booking.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: newActive ? "Activate" : "Deactivate",
          onPress: async () => {
            const { error: err } = await updateStaff(`/api/provider/staff/${id}`, { is_active: newActive });
            if (err) Alert.alert("Error", err);
            else refresh();
          },
        },
      ]
    );
  }, [member, id, updateStaff, refresh]);

  if (loading && !member) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Team member" showBack />
        <LoadingState message="Loading..." />
      </ScreenContainer>
    );
  }

  if (error && !member) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Team member" showBack />
        <ErrorState message={error} onRetry={refresh} />
      </ScreenContainer>
    );
  }

  if (!member) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Team member" showBack />
        <View style={twStyle("flex-1 items-center justify-center p-6")}>
          <Text style={twStyle("text-gray-500")}>Member not found</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader
        title={member.name}
        showBack
        subtitle={capitalizeFirst(member.role)}
      />
      <ScrollView
        style={twStyle("flex-1")}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={twStyle("items-center px-4 pt-4 pb-6")}>
          <Avatar name={member.name} imageUrl={member.avatar_url ?? undefined} size="xl" />
          <View style={twStyle("mt-2 flex-row items-center")}>
            <View
              style={twStyle(`h-2.5 w-2.5 rounded-full ${member.is_active ? "bg-green-500" : "bg-gray-400"}`)}
            />
            <Text style={twStyle("ml-2 text-sm text-gray-600")}>
              {member.is_active ? "Active" : "Inactive"}
            </Text>
          </View>
        </View>

        <View style={twStyle("mx-4 mb-4 rounded-xl border border-gray-200 bg-white p-4")}>
          <Row label="Email" value={member.email} />
          {member.phone ? <Row label="Phone" value={member.phone} /> : null}
        </View>

        <View style={twStyle("mx-4 mb-4")}>
          <Text style={twStyle("mb-2 text-sm font-medium text-gray-500")}>Quick actions</Text>
          <View style={twStyle("rounded-xl border border-gray-200 bg-white")}>
            {LINK_ITEMS.map((item, i) => (
              <TouchableOpacity
                key={item.label}
                style={twStyle(
                  `flex-row items-center px-4 py-3.5 ${i < LINK_ITEMS.length - 1 ? "border-b border-gray-100" : ""}`
                )}
                onPress={() => {
                  if (item.useId && id) router.push(`${item.route}/${id}` as any);
                  else router.push(item.route as any);
                }}
              >
                <Ionicons name={item.icon} size={20} color="#6b7280" />
                <Text style={twStyle("ml-3 flex-1 text-base text-gray-900")}>{item.label}</Text>
                <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={twStyle("mx-4")}>
          <TouchableOpacity
            style={twStyle(
              `flex-row items-center justify-center rounded-xl border py-3.5 ${member.is_active ? "border-red-200 bg-red-50" : "border-green-200 bg-green-50"}`
            )}
            onPress={handleToggleActive}
            disabled={saving}
          >
            <Ionicons
              name={member.is_active ? "pause-circle-outline" : "play-circle-outline"}
              size={20}
              color={member.is_active ? "#dc2626" : "#16a34a"}
            />
            <Text
              style={twStyle(
                `ml-2 font-medium ${member.is_active ? "text-red-700" : "text-green-700"}`
              )}
            >
              {member.is_active ? "Deactivate member" : "Activate member"}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={twStyle("flex-row py-2")}>
      <Text style={twStyle("w-24 text-sm text-gray-500")}>{label}</Text>
      <Text style={twStyle("flex-1 text-sm text-gray-900")} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}
