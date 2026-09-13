/**
 * Locations list – GET /api/provider/locations. Add → locations/add, tap row → locations/[id].
 */
import { useCallback, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, RefreshControl } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTranslation } from "@beautonomi/i18n";
import { useApi } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Colors } from "@/constants/colors";
import { DirectionalIcon } from "@/components/ui/DirectionalIcon";

type LocationItem = {
  id: string;
  name: string;
  address_line1?: string;
  city?: string;
  country?: string;
  is_primary?: boolean;
  is_active?: boolean;
};

export default function LocationsScreen() {
  const { t } = useTranslation();
  const ls = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(`provider.mobile.screens.locations.${key}`, opts) as string,
    [t],
  );
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const { data, loading, error, refresh } = useApi<LocationItem[]>(
    "/api/provider/locations?include_inactive=true"
  );

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const locations: LocationItem[] = Array.isArray(data) ? data : [];

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title={ls("title")} onBack={() => router.back()} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 48 }}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title={ls("title")} onBack={() => router.back()} />
        <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 16 }}>
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader
        title={ls("title")}
        subtitle={ls("subtitle")}
        onBack={() => router.back()}
        rightAction={
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/(app)/(tabs)/more/locations/add" as never);
            }}
            style={{ borderRadius: 9999, backgroundColor: Colors.gray[100], padding: 8 }}
            accessibilityLabel={ls("addLocationA11y")}
            accessibilityRole="button"
          >
            <Ionicons name="add" size={22} color="#374151" />
          </TouchableOpacity>
        }
      />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" />}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ paddingHorizontal: 16 }}>
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/(app)/(tabs)/more/settings/distance-settings" as never);
            }}
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 16, borderWidth: 1, borderColor: "#bae6fd", backgroundColor: "#f0f9ff", padding: 16, marginBottom: 16 }}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={ls("distanceA11y")}
          >
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#7dd3fc", marginEnd: 12 }}>
                <Ionicons name="navigate-outline" size={20} color="#0369a1" />
              </View>
              <View>
                <Text style={{ fontSize: 15, fontWeight: "600", color: Colors.gray[900] }}>{ls("distanceTitle")}</Text>
                <Text style={{ fontSize: 13, color: Colors.gray[500], marginTop: 2 }}>{ls("distanceSubtitle")}</Text>
              </View>
            </View>
            <DirectionalIcon name="chevron-forward" size={20} color="#0ea5e9" />
          </TouchableOpacity>
          {locations.length === 0 ? (
            <View style={{ paddingVertical: 48, alignItems: "center" }}>
              <View style={{ width: 64, height: 64, alignItems: "center", justifyContent: "center", borderRadius: 32, backgroundColor: "#ccfbf1", marginBottom: 16 }}>
                <Ionicons name="location-outline" size={32} color="#0d9488" />
              </View>
              <Text style={{ textAlign: "center", color: Colors.gray[600] }}>{ls("emptyTitle")}</Text>
              <Text style={{ marginTop: 8, textAlign: "center", fontSize: 14, color: Colors.gray[500], marginBottom: 24 }}>
                {ls("emptyBody")}
              </Text>
              <TouchableOpacity
                onPress={() => router.push("/(app)/(tabs)/more/locations/add" as never)}
                style={{ borderRadius: 12, backgroundColor: "#0d9488", paddingHorizontal: 24, paddingVertical: 12 }}
                activeOpacity={0.8}
              >
                <Text style={{ fontWeight: "600", color: Colors.white }}>{ls("addLocation")}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              {locations.map((loc, idx) => (
                <TouchableOpacity
                  key={loc.id}
                  style={[ { borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, padding: 16 }, idx > 0 && { marginTop: 12 } ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push(`/(app)/(tabs)/more/locations/${loc.id}` as never);
                  }}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={ls("locationA11y", { name: loc.name, city: loc.city ?? "", country: loc.country ?? "" })}
                >
                  <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <Text style={{ fontSize: 16, fontWeight: "600", color: Colors.gray[900], marginEnd: 8 }}>{loc.name}</Text>
                        {loc.is_primary && (
                          <View style={{ borderRadius: 4, backgroundColor: "#ccfbf1", paddingHorizontal: 8, paddingVertical: 2 }}>
                            <Text style={{ fontSize: 12, fontWeight: "500", color: "#115e59" }}>{ls("primary")}</Text>
                          </View>
                        )}
                        {loc.is_active === false && (
                          <View style={{ borderRadius: 4, backgroundColor: "#fef3c7", paddingHorizontal: 8, paddingVertical: 2, marginStart: 6 }}>
                            <Text style={{ fontSize: 12, fontWeight: "500", color: "#92400e" }}>{ls("inactive")}</Text>
                          </View>
                        )}
                      </View>
                      {(loc.address_line1 || loc.city || loc.country) && (
                        <Text style={{ marginTop: 4, fontSize: 14, color: Colors.gray[500] }} numberOfLines={2}>
                          {[loc.address_line1, loc.city, loc.country].filter(Boolean).join(", ")}
                        </Text>
                      )}
                    </View>
                    <DirectionalIcon name="chevron-forward" size={20} color="#9ca3af" />
                  </View>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                onPress={() => router.push("/(app)/(tabs)/more/locations/add" as never)}
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 16, borderWidth: 1, borderStyle: "dashed", borderColor: Colors.gray[300], paddingVertical: 16 }}
                activeOpacity={0.7}
              >
                <Ionicons name="add-circle-outline" size={22} color="#0d9488" />
                <Text style={{ marginStart: 8, fontWeight: "500", color: "#0f766e" }}>{ls("addAnother")}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
