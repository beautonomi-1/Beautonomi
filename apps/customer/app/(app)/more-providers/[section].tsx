import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, ActivityIndicator, Platform } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useSelectedAddress, hasValidServiceCoordinates } from "@/providers/SelectedAddressProvider";
import { useLocation } from "@/hooks/useLocation";
import { useResponsive } from "@/hooks/useResponsive";
import { useHomeData } from "@/features/home/useHomeData";
import { ProviderCard } from "@/components/ProviderCard";
import { Colors } from "@/constants/colors";
import { STACK_CONTENT_PADDING_BOTTOM } from "@/constants/layout";
import { api } from "@/lib/api-client";
import type { PublicProviderCard } from "@/types/api";

const SECTION_TITLES: Record<string, string> = {
  "top-rated": "Top Rated",
  sponsored: "Sponsored",
  nearest: "Nearest Providers",
  hottest: "Hottest Picks",
  upcoming: "Upcoming Talent",
};

const VALID_SECTIONS = new Set(["top-rated", "sponsored", "nearest", "hottest", "upcoming"]);
const PAGE_SIZE = 20;

function hasUsableCoords(latitude?: number | null, longitude?: number | null): boolean {
  return hasValidServiceCoordinates({ latitude, longitude });
}

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
  const { selectedAddress } = useSelectedAddress();
  const shouldUseGps = !hasValidServiceCoordinates(selectedAddress);
  const { coords } = useLocation({ enabled: shouldUseGps });
  const { contentPadding, contentMaxWidth, isTablet } = useResponsive();
  const effectiveLat = selectedAddress?.latitude ?? coords?.latitude;
  const effectiveLng = selectedAddress?.longitude ?? coords?.longitude;

  const { data, loading, refreshing, error, refetch } = useHomeData(effectiveLat, effectiveLng);
  const [pagedProviders, setPagedProviders] = useState<PublicProviderCard[]>([]);
  const [allSponsored, setAllSponsored] = useState<PublicProviderCard[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [hasLoadedPage, setHasLoadedPage] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const providers = hasLoadedPage || !data ? pagedProviders : getProviders(data, section);
  const adsDisclosureLabel = useMemo(
    () => (String(data?.ads_disclosure_label ?? "Sponsored").trim() || "Sponsored"),
    [data?.ads_disclosure_label],
  );
  const title = section === "sponsored" ? adsDisclosureLabel : (SECTION_TITLES[section] ?? "Providers");
  const badge = getBadge(section);
  const constraint = (isTablet || Platform.OS === "web") ? { maxWidth: contentMaxWidth, alignSelf: "center" as const, width: "100%" as const } : {};

  const loadSectionPage = useCallback(
    async (nextPage: number, append: boolean) => {
      if (!VALID_SECTIONS.has(section)) return;
      setPageError(null);
      if (section === "sponsored") {
        const params = new URLSearchParams();
        if (hasUsableCoords(effectiveLat, effectiveLng)) {
          params.set("lat", String(effectiveLat));
          params.set("lng", String(effectiveLng));
        }
        const res = await api.get<{ sponsored?: PublicProviderCard[]; data?: { sponsored?: PublicProviderCard[] } }>(
          `/api/public/home${params.toString() ? `?${params.toString()}` : ""}`,
        );
        const raw = (res.data as any)?.sponsored ?? (res.data as any)?.data?.sponsored ?? [];
        const sponsored = Array.isArray(raw) ? raw : [];
        setAllSponsored(sponsored);
        setPagedProviders(sponsored.slice(0, nextPage * PAGE_SIZE));
        setHasMore(sponsored.length > nextPage * PAGE_SIZE);
        setPage(nextPage);
        setHasLoadedPage(true);
        return;
      }

      const params = new URLSearchParams();
      params.set("page", String(nextPage));
      params.set("limit", String(PAGE_SIZE));
      params.set(
        "sort_by",
        section === "top-rated" ? "rating" : section === "nearest" ? "distance" : section === "upcoming" ? "newest" : "relevance",
      );
      if (section === "top-rated") params.set("rating_min", "1");
      if (hasUsableCoords(effectiveLat, effectiveLng)) {
        params.set("lat", String(effectiveLat));
        params.set("lng", String(effectiveLng));
      }
      const res = await api.get<{ providers?: PublicProviderCard[]; has_more?: boolean; data?: { providers?: PublicProviderCard[]; has_more?: boolean } }>(
        `/api/public/search?${params.toString()}`,
      );
      const payload = (res.data as any)?.data ?? res.data ?? {};
      const nextProviders = Array.isArray(payload.providers) ? payload.providers : [];
      setPagedProviders((prev) => (append ? [...prev, ...nextProviders] : nextProviders));
      setHasMore(Boolean(payload.has_more));
      setPage(nextPage);
      setHasLoadedPage(true);
    },
    [effectiveLat, effectiveLng, section],
  );

  useEffect(() => {
    setPagedProviders([]);
    setAllSponsored([]);
    setPage(1);
    setHasMore(false);
    setHasLoadedPage(false);
    if (!VALID_SECTIONS.has(section)) return;
    loadSectionPage(1, false).catch((e) => {
      setPageError(e instanceof Error ? e.message : "Could not load providers.");
      setHasLoadedPage(true);
    });
  }, [loadSectionPage, section]);

  const handleLoadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      if (section === "sponsored" && allSponsored.length > 0) {
        const nextPage = page + 1;
        setPagedProviders(allSponsored.slice(0, nextPage * PAGE_SIZE));
        setHasMore(allSponsored.length > nextPage * PAGE_SIZE);
        setPage(nextPage);
      } else {
        await loadSectionPage(page + 1, true);
      }
    } catch (e) {
      setPageError(e instanceof Error ? e.message : "Could not load more providers.");
    } finally {
      setLoadingMore(false);
    }
  }, [allSponsored, loadSectionPage, page, section]);

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
      ) : error || pageError ? (
        <View style={{ flex: 1, padding: 24, justifyContent: "center" }}>
          <Text style={{ color: Colors.gray[700], marginBottom: 12 }}>{pageError || error}</Text>
          <TouchableOpacity
            onPress={() => {
              setPageError(null);
              void loadSectionPage(1, false);
              refetch();
            }}
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
                    sponsoredListingLabel={section === "sponsored" ? adsDisclosureLabel : undefined}
                  />
                </View>
              ))}
              {hasMore ? (
                <TouchableOpacity
                  onPress={handleLoadMore}
                  disabled={loadingMore}
                  style={{ marginTop: 20, alignSelf: "center", backgroundColor: Colors.primary, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 999 }}
                >
                  <Text style={{ color: Colors.white, fontWeight: "700" }}>
                    {loadingMore ? "Loading..." : "Load more providers"}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          )}
        </ScrollView>
      )}
    </>
  );
}
