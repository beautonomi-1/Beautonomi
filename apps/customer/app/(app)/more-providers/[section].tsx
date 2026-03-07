import { View, Text, ScrollView, RefreshControl, TouchableOpacity, ActivityIndicator, Platform } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useSelectedAddress } from "@/providers/SelectedAddressProvider";
import { useLocation } from "@/hooks/useLocation";
import { useResponsive } from "@/hooks/useResponsive";
import { useHomeData } from "@/features/home/useHomeData";
import { ProviderCard } from "@/components/ProviderCard";
import { Colors } from "@/constants/colors";
import { STACK_CONTENT_PADDING_BOTTOM } from "@/constants/layout";
import type { PublicProviderCard } from "@/types/api";

const SECTION_TITLES: Record<string, string> = {
  "top-rated": "Top Rated",
  sponsored: "Sponsored",
  nearest: "Nearest Providers",
  hottest: "Hottest Picks",
  upcoming: "Upcoming Talent",
};

const VALID_SECTIONS = new Set(["top-rated", "sponsored", "nearest", "hottest", "upcoming"]);

function getProviders(data: ReturnType<typeof useHomeData>["data"], section: string): PublicProviderCard[] {
  if (!data) return [];
  switch (section) {
    case "top-rated":
      return data.topRated ?? [];
    case "sponsored":
      return data.sponsored ?? [];
    case "nearest":
      return data.nearest ?? [];
    case "hottest":
      return data.hottest ?? [];
    case "upcoming":
      return data.upcoming ?? [];
    default:
      return [];
  }
}

function getBadge(section: string): "topRated" | "sponsored" | "nearest" | "hottest" | "upcoming" {
  if (section === "top-rated") return "topRated";
  if (section === "sponsored") return "sponsored";
  if (section === "nearest") return "nearest";
  if (section === "hottest") return "hottest";
  if (section === "upcoming") return "upcoming";
  return "topRated";
}

export default function MoreProvidersScreen() {
  const { section: sectionParam } = useLocalSearchParams<{ section: string }>();
  const section = (sectionParam ?? "top-rated").toLowerCase().replace(/\s+/g, "-");
  const { coords } = useLocation();
  const { selectedAddress } = useSelectedAddress();
  const { contentPadding, contentMaxWidth, isTablet } = useResponsive();
  const effectiveLat = selectedAddress?.latitude ?? coords?.latitude;
  const effectiveLng = selectedAddress?.longitude ?? coords?.longitude;

  const { data, loading, refreshing, error, refetch } = useHomeData(effectiveLat, effectiveLng);
  const providers = getProviders(data, section);
  const title = SECTION_TITLES[section] ?? "Providers";
  const badge = getBadge(section);
  const constraint = (isTablet || Platform.OS === "web") ? { maxWidth: contentMaxWidth, alignSelf: "center" as const, width: "100%" as const } : {};

  if (!VALID_SECTIONS.has(section)) {
    return (
      <>
        <Stack.Screen options={{ title: "Providers", headerBackTitle: "Back" }} />
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24 }}>
          <Text style={{ fontSize: 16, color: Colors.gray[600] }}>Invalid section.</Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title, headerBackTitle: "Back" }} />
      {loading && !data ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : error ? (
        <View style={{ flex: 1, padding: 24, justifyContent: "center" }}>
          <Text style={{ color: Colors.gray[700], marginBottom: 12 }}>{error}</Text>
          <TouchableOpacity
            onPress={() => refetch()}
            style={{ backgroundColor: Colors.primary, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12, alignSelf: "flex-start" }}
          >
            <Text style={{ color: Colors.white, fontWeight: "600" }}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1, backgroundColor: Colors.white }}
          contentContainerStyle={{
            padding: contentPadding,
            paddingBottom: STACK_CONTENT_PADDING_BOTTOM,
            ...constraint,
          }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refetch} tintColor={Colors.primary} />}
        >
          {providers.length === 0 ? (
            <View style={{ paddingVertical: 48, alignItems: "center" }}>
              <Text style={{ fontSize: 16, color: Colors.gray[500] }}>No providers in this section yet.</Text>
            </View>
          ) : (
            <View>
              {providers.map((p, idx) => (
                <View key={p.id} style={{ width: "100%", marginTop: idx === 0 ? 0 : 16 }}>
                  <ProviderCard
                    provider={p}
                    showTopRatedBadge={badge === "topRated"}
                    showHottestBadge={badge === "hottest"}
                    showNearestBadge={badge === "nearest"}
                    showUpcomingBadge={badge === "upcoming"}
                  />
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </>
  );
}
