/**
 * Team notifications — list staff and open per-member notification settings (web parity:
 * GET/PATCH /api/provider/staff/[id]/notifications).
 */
import { useState, useCallback, useMemo } from "react";
import { View, Text, TouchableOpacity, FlatList } from "react-native";
import { useRouter } from "expo-router";
import { useApi } from "@/hooks/useApi";
import { useProvider } from "@/providers/ProviderContext";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Avatar } from "@/components/ui/Avatar";
import { twStyle } from "@/lib/twStyle";
import { verticalFlatListPerf } from "@/lib/flatListPerformance";
import { useTranslation } from "@beautonomi/i18n";
import { DirectionalIcon } from "@/components/ui/DirectionalIcon";

interface StaffMember {
  id: string;
  name: string;
  email?: string | null;
  role?: string;
  is_admin?: boolean;
}

export default function TeamStaffNotificationsListScreen() {
  const { t } = useTranslation();
  const tn = (key: string, opts?: Record<string, unknown>) => t(`provider.mobile.screens.teamStaffNotifications.${key}`, opts) as string;
  const roleLabel = (role?: string) => {
    if (role === "provider_owner") return tn("roleOwner");
    if (role === "provider_manager") return tn("roleManager");
    if (role === "provider_staff") return tn("roleStaff");
    return role || tn("roleStaff");
  };
  const router = useRouter();
  const { provider, selectedLocationId } = useProvider();
  const [refreshing, setRefreshing] = useState(false);

  const staffUrl = useMemo(() => {
    return selectedLocationId
      ? `/api/provider/staff?location_id=${encodeURIComponent(selectedLocationId)}`
      : "/api/provider/staff";
  }, [selectedLocationId]);

  const { data: staffRaw, loading, error: staffError, refresh } = useApi<
    StaffMember[] | { data?: StaffMember[] }
  >(staffUrl);

  const headerSubtitle = useMemo(() => {
    if (!selectedLocationId || !provider?.locations?.length) return tn("subtitle");
    const loc = provider.locations.find((locRow) => locRow.id === selectedLocationId);
    return loc?.name ? tn("subtitleWithLocation", { location: loc.name }) : tn("subtitle");
  }, [selectedLocationId, provider?.locations, t]);

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
        <LoadingState message={tn("loading")} />
      </ScreenContainer>
    );
  }

  if (staffError && !staffRaw) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title={tn("title")} showBack subtitle={headerSubtitle} />
        <ErrorState message={staffError} onRetry={refresh} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer refreshing={refreshing} onRefresh={handleRefresh}>
      <ScreenHeader title={tn("title")} showBack subtitle={headerSubtitle} />
      {staffList.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title={tn("emptyTitle")}
          description={tn("emptyDescription")}
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
              <View style={twStyle("ms-3 flex-1")}>
                <Text style={twStyle("font-medium text-gray-900")}>{item.name}</Text>
                <Text style={twStyle("text-xs text-gray-500")}>
                  {roleLabel(item.role)}
                  {item.is_admin ? tn("adminSuffix") : ""}
                </Text>
              </View>
              <DirectionalIcon name="chevron-forward" size={18} color="#9ca3af" />
            </TouchableOpacity>
          )}
        />
      )}
    </ScreenContainer>
  );
}
