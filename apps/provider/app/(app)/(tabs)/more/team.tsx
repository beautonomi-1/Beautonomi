import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useApi } from "@/hooks/useApi";
import { useProvider } from "@/providers/ProviderContext";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { StatCard } from "@/components/ui/StatCard";
import { Avatar } from "@/components/ui/Avatar";
import { Colors } from "@/constants/colors";
import { getWebProviderBaseUrl } from "@/lib/web-url";
import { pushInAppBrowser } from "@/lib/in-app-web";
import { shouldUseAppleIap } from "@/lib/iap/platform";

type StaffMember = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  avatar_url?: string | null;
  role: string;
  is_active: boolean;
};

type TeamAccessPayload = {
  is_business_owner?: boolean;
  can_manage_team: boolean;
};

export default function TeamScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ add?: string }>();
  const { provider, selectedLocationId } = useProvider();
  const [refreshing, setRefreshing] = useState(false);

  const isFreelancer = provider?.business_type === "freelancer";

  const staffUrl = useMemo(() => {
    return selectedLocationId
      ? `/api/provider/staff?location_id=${encodeURIComponent(selectedLocationId)}`
      : "/api/provider/staff";
  }, [selectedLocationId]);

  const { data: teamAccess, loading: teamAccessLoading } =
    useApi<TeamAccessPayload>("/api/provider/team-access");
  const canManageTeam =
    teamAccess?.is_business_owner === true || teamAccess?.can_manage_team === true;

  const { data, loading, error, refresh } = useApi<
    StaffMember[] | { data?: StaffMember[] }
  >(staffUrl);

  const staff: StaffMember[] = useMemo(
    () =>
      Array.isArray(data)
        ? data
        : (data as { data?: StaffMember[] } | null | undefined)?.data ?? [],
    [data],
  );

  const totalCount = staff.length;
  const activeCount = staff.filter((s) => s.is_active).length;
  const serviceProvidersCount = staff.filter(
    (s) => s.role === "provider_staff" || s.role === "provider_manager",
  ).length;
  const onShiftCount = activeCount;

  const avgRating = useMemo<number | null>(() => {
    if (!staff.length) return null;
    const rated = staff.filter(
      (s) => (s as { average_rating?: number | null }).average_rating != null,
    );
    if (rated.length === 0) return null;
    return (
      rated.reduce(
        (sum, s) =>
          sum + ((s as { average_rating?: number }).average_rating ?? 0),
        0,
      ) / rated.length
    );
  }, [staff]);

  const previewStaff = useMemo(() => staff.slice(0, 4), [staff]);

  // Staff schedules & deep links: Team?add=1 → team-list with add sheet (same as hub Add member)
  useEffect(() => {
    if (params.add === "1") {
      router.replace({
        pathname: "/(app)/(tabs)/more/team-list",
        params: { add: "1" },
      } as never);
    }
  }, [params.add, router]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const openManageAll = useCallback(() => {
    router.push("/(app)/(tabs)/more/team-list" as never);
  }, [router]);

  const quickActions = [
    {
      label: "Staff schedules",
      subtitle: "Weekly shifts by team member",
      icon: "calendar-outline" as const,
      color: "#4f46e5",
      bg: "#e0e7ff",
      route: "/(app)/(tabs)/more/staff-schedule",
    },
    {
      label: "Days off",
      subtitle: "Leave, sick days, holidays",
      icon: "sunny-outline" as const,
      color: "#d97706",
      bg: "#fef3c7",
      route: "/(app)/(tabs)/more/days-off",
    },
    {
      label: "Schedule locks",
      subtitle: "Lunch, meetings, blocked time",
      icon: "ban-outline" as const,
      color: "#dc2626",
      bg: "#fee2e2",
      route: "/(app)/(tabs)/more/time-blocks",
    },
    {
      label: "Time clock",
      subtitle: "Clock in/out and time cards",
      icon: "time-outline" as const,
      color: "#0d9488",
      bg: "#ccfbf1",
      route: "/(app)/(tabs)/more/time-clock",
    },
    {
      label: "Permissions",
      subtitle: "Roles and access controls",
      icon: "lock-open-outline" as const,
      color: "#4f46e5",
      bg: "#eef2ff",
      route: "/(app)/(tabs)/more/settings/staff-permissions",
    },
    {
      label: "Commissions",
      subtitle: "Pay rules and staff earnings",
      icon: "cash-outline" as const,
      color: "#16a34a",
      bg: "#dcfce7",
      route: "/(app)/(tabs)/more/settings/team-commissions",
    },
    {
      label: "Staff notifications",
      subtitle: "Email, push, booking alerts",
      icon: "notifications-outline" as const,
      color: "#d97706",
      bg: "#fef3c7",
      route: "/(app)/(tabs)/more/settings/team-staff-notifications",
    },
    {
      label: "Time off types",
      subtitle: "Leave categories and reasons",
      icon: "pricetags-outline" as const,
      color: "#9333ea",
      bg: "#f3e8ff",
      route: "/(app)/(tabs)/more/settings/time-off-types",
    },
  ];

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Team" onBack={() => router.back()} />
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            paddingVertical: 48,
          }}
        >
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
        subtitle={
          isFreelancer
            ? "Your profile and service settings"
            : "Staff, shifts & time clock"
        }
        onBack={() => router.back()}
        rightAction={
          canManageTeam && !isFreelancer ? (
            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: "/(app)/(tabs)/more/team-list",
                  params: { add: "1" },
                } as never)
              }
              style={{
                flexDirection: "row",
                alignItems: "center",
                borderRadius: 12,
                backgroundColor: "#0d9488",
                paddingHorizontal: 14,
                paddingVertical: 8,
              }}
              accessibilityLabel="Add team member"
              accessibilityRole="button"
            >
              <Ionicons name="add" size={18} color="#fff" />
              <Text
                style={{
                  marginLeft: 6,
                  fontSize: 14,
                  fontWeight: "600",
                  color: Colors.white,
                }}
              >
                Add member
              </Text>
            </TouchableOpacity>
          ) : undefined
        }
      />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {!teamAccessLoading && !canManageTeam ? (
          <View
            style={{
              marginBottom: 12,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: "#fde68a",
              backgroundColor: "#fffbeb",
              paddingHorizontal: 12,
              paddingVertical: 10,
            }}
          >
            <Text style={{ fontSize: 14, color: "#78350f" }}>
              You have read-only team access. Ask an owner or manager with Manage team to add or
              edit members.
            </Text>
          </View>
        ) : null}

        {isFreelancer ? (
          <View
            style={{
              marginBottom: 12,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: "rgba(255, 0, 119, 0.2)",
              backgroundColor: "rgba(255, 0, 119, 0.05)",
              padding: 12,
            }}
          >
            <Text style={{ fontSize: 14, color: Colors.gray[700] }}>
              <Text style={{ fontWeight: "600", color: Colors.primary }}>
                You’re set up as a freelancer.
              </Text>{" "}
              To add team members and unlock advanced features, upgrade to a salon.
            </Text>
            <TouchableOpacity
              onPress={() => {
                if (shouldUseAppleIap()) {
                  router.push("/(app)/(tabs)/more/settings/subscription" as never);
                  return;
                }
                const base = getWebProviderBaseUrl().replace(/\/$/, "");
                pushInAppBrowser(
                  router,
                  `${base}/provider/settings/upgrade-to-salon`,
                  "Upgrade",
                );
              }}
              style={{
                marginTop: 10,
                alignSelf: "flex-start",
                borderRadius: 8,
                backgroundColor: Colors.primary,
                paddingHorizontal: 16,
                paddingVertical: 10,
              }}
              accessibilityLabel="Upgrade to salon"
              accessibilityRole="button"
            >
              <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.white }}>
                Upgrade to salon
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Stats — match provider web team members summary */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 12, paddingBottom: 4, paddingRight: 4 }}
          style={{ marginBottom: 16 }}
        >
          <View style={{ width: 128 }}>
            <StatCard title="Total" value={String(totalCount)} icon="people-outline" compact />
          </View>
          <View style={{ width: 128 }}>
            <StatCard
              title="Active"
              value={String(activeCount)}
              icon="checkmark-circle-outline"
              iconColor="#22c55e"
              iconBg="#dcfce7"
              compact
            />
          </View>
          <View style={{ width: 148 }}>
            <StatCard
              title="Service providers"
              value={String(serviceProvidersCount)}
              icon="briefcase-outline"
              iconColor="#9333ea"
              iconBg="#f3e8ff"
              compact
            />
          </View>
          <View style={{ width: 128 }}>
            <StatCard
              title="On shift"
              value={String(onShiftCount)}
              icon="time-outline"
              iconColor={Colors.primary}
              iconBg={Colors.primaryLight}
              compact
            />
          </View>
          <View style={{ width: 128 }}>
            <StatCard
              title="Avg rating"
              value={avgRating == null ? "—" : avgRating.toFixed(1)}
              icon="star-outline"
              iconColor="#f59e0b"
              iconBg="#ffedd5"
              compact
            />
          </View>
        </ScrollView>

        <TouchableOpacity
          onPress={openManageAll}
          style={{
            marginBottom: 16,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 12,
            backgroundColor: Colors.gray[900],
            paddingVertical: 14,
            paddingHorizontal: 16,
          }}
          activeOpacity={0.85}
          accessibilityLabel="View and manage all team members"
          accessibilityRole="button"
        >
          <Ionicons name="people" size={20} color="#fff" />
          <Text
            style={{
              marginLeft: 8,
              fontSize: 16,
              fontWeight: "600",
              color: Colors.white,
            }}
          >
            View & manage all members
          </Text>
          <Ionicons
            name="chevron-forward"
            size={18}
            color="#fff"
            style={{ marginLeft: 6 }}
          />
        </TouchableOpacity>

        <Text
          style={{
            marginBottom: 8,
            fontSize: 12,
            fontWeight: "600",
            letterSpacing: 0.5,
            color: Colors.gray[400],
            textTransform: "uppercase",
          }}
        >
          Scheduling & controls
        </Text>
        <View style={{ marginBottom: 16, flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          {quickActions.map((item) => (
            <TouchableOpacity
              key={item.label}
              onPress={() => router.push(item.route as never)}
              style={{
                width: "48%",
                minHeight: 132,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: Colors.gray[200],
                backgroundColor: Colors.white,
                padding: 14,
              }}
              activeOpacity={0.75}
              accessibilityLabel={item.label}
              accessibilityRole="button"
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 20,
                  backgroundColor: item.bg,
                }}
              >
                <Ionicons name={item.icon} size={22} color={item.color} />
              </View>
              <Text style={{ marginTop: 10, fontWeight: "700", color: Colors.gray[900] }}>
                {item.label}
              </Text>
              <Text style={{ marginTop: 4, fontSize: 12, lineHeight: 16, color: Colors.gray[500] }}>
                {item.subtitle}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text
          style={{
            marginBottom: 8,
            fontSize: 12,
            fontWeight: "600",
            letterSpacing: 0.5,
            color: Colors.gray[400],
            textTransform: "uppercase",
          }}
        >
          {selectedLocationId ? "At this location" : "Team preview"}
        </Text>
        {staff.length === 0 ? (
          <View style={{ paddingVertical: 24, paddingHorizontal: 8, alignItems: "center" }}>
            <Ionicons name="people-circle-outline" size={48} color="#9ca3af" />
            <Text style={{ marginTop: 16, textAlign: "center", color: Colors.gray[600] }}>
              No team members {selectedLocationId ? "for this location" : "yet"}
            </Text>
            <Text
              style={{
                marginTop: 8,
                textAlign: "center",
                fontSize: 14,
                color: Colors.gray[500],
                marginBottom: 16,
              }}
            >
              {canManageTeam && !isFreelancer
                ? "Add staff from the full team screen."
                : "Open team to view details when you have access."}
            </Text>
            {canManageTeam && !isFreelancer ? (
              <TouchableOpacity
                onPress={openManageAll}
                style={{
                  borderRadius: 12,
                  backgroundColor: "#0d9488",
                  paddingHorizontal: 24,
                  paddingVertical: 12,
                }}
                activeOpacity={0.8}
              >
                <Text style={{ fontWeight: "600", color: Colors.white }}>Open team list</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : (
          <View style={{ paddingBottom: 16 }}>
            {previewStaff.map((member) => (
              <TouchableOpacity
                key={member.id}
                onPress={() =>
                  router.push(`/(app)/(tabs)/more/team-member/${member.id}` as never)
                }
                style={{
                  marginBottom: 12,
                  flexDirection: "row",
                  alignItems: "center",
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: Colors.gray[200],
                  backgroundColor: Colors.white,
                  padding: 16,
                }}
                activeOpacity={0.7}
              >
                <Avatar name={member.name} imageUrl={member.avatar_url ?? undefined} size="md" />
                <View style={{ marginLeft: 12, flex: 1 }}>
                  <Text style={{ fontWeight: "600", color: Colors.gray[900] }}>{member.name}</Text>
                  <Text style={{ fontSize: 14, color: Colors.gray[500] }} numberOfLines={1}>
                    {member.email}
                  </Text>
                  {!member.is_active && (
                    <View
                      style={{
                        marginTop: 4,
                        alignSelf: "flex-start",
                        borderRadius: 4,
                        backgroundColor: Colors.gray[200],
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                      }}
                    >
                      <Text style={{ fontSize: 12, color: Colors.gray[600] }}>Inactive</Text>
                    </View>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
              </TouchableOpacity>
            ))}
            {staff.length > previewStaff.length ? (
              <TouchableOpacity
                onPress={openManageAll}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  paddingVertical: 12,
                }}
              >
                <Text style={{ fontSize: 15, fontWeight: "600", color: "#0d9488" }}>
                  See all {staff.length} members
                </Text>
                <Ionicons name="chevron-forward" size={18} color="#0d9488" style={{ marginLeft: 4 }} />
              </TouchableOpacity>
            ) : null}
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
