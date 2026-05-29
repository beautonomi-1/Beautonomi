import React from "react";
import { View, Text } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { AnimatedPressable } from "@/components/AnimatedPressable";
import type { PublicProviderCard } from "@/types/api";
import { Colors, Shadows } from "@/constants/colors";
import { api } from "@/lib/api-client";
import { formatProviderDescriptionForCard } from "@beautonomi/utils";

interface ProviderCardProps {
  provider: PublicProviderCard;
  showTopRatedBadge?: boolean;
  showHottestBadge?: boolean;
  showNearestBadge?: boolean;
  showUpcomingBadge?: boolean;
  /** Badge copy when `provider.is_sponsored` (from `/api/public/home` `ads_disclosure_label`). */
  sponsoredListingLabel?: string;
  compact?: boolean;
  /** Same coords used for home feed distance — keeps profile distance consistent when opening from a card */
  feedOriginLat?: number | null;
  feedOriginLng?: number | null;
}

const PLACEHOLDER = "https://placehold.co/400x300/f5f5f5/999?text=Beauty";

export const ProviderCard = React.memo(function ProviderCard({
  provider,
  showTopRatedBadge = false,
  showHottestBadge = false,
  showNearestBadge = false,
  showUpcomingBadge = false,
  sponsoredListingLabel = "Sponsored",
  compact = false,
  feedOriginLat,
  feedOriginLng,
}: ProviderCardProps) {
  const thumbnailUrl = provider.thumbnail_url || PLACEHOLDER;
  const avatarUrl = provider.avatar_url || provider.thumbnail_url || PLACEHOLDER;
  const formatCount = (c: number) => (c >= 1000 ? `${(c / 1000).toFixed(1)}k` : String(c));
  const providerInitial = provider.business_name.charAt(0).toUpperCase();
  const cardDescription = formatProviderDescriptionForCard(provider.description);

  const handlePress = () => {
    if (provider.is_sponsored && provider.campaign_id && provider.id) {
      api.post("/api/public/ads/event", {
        event_type: "click",
        campaign_id: provider.campaign_id,
        provider_id: provider.id,
        idempotency_key: `click:${provider.campaign_id}:${provider.id}:${Date.now()}`,
      }).catch(() => {});
    }
    const params: {
      slug: string;
      campaign_id?: string;
      provider_id?: string;
      lat?: string;
      lng?: string;
    } = { slug: provider.slug };
    if (!params.slug && provider.id) {
      params.slug = provider.id;
      params.provider_id = provider.id;
    }
    if (provider.is_sponsored && provider.campaign_id && provider.id) {
      params.campaign_id = provider.campaign_id;
      params.provider_id = provider.id;
    }
    if (
      feedOriginLat != null &&
      feedOriginLng != null &&
      Number.isFinite(feedOriginLat) &&
      Number.isFinite(feedOriginLng)
    ) {
      params.lat = String(feedOriginLat);
      params.lng = String(feedOriginLng);
    }
    router.push({ pathname: "/(app)/partner-profile", params });
  };

  const badgeTextStyle = { color: Colors.white, fontSize: 11, fontWeight: "600" as const };
  const MAX_VISIBLE_BADGES = 3;

  // Build ordered badge list: sponsored/ad disclosure FIRST (transparency), then earned tier
  // badge, then contextual section badge (Top Rated/Hottest/etc.), then capability badges.
  // This ensures ad disclosure is never buried.
  const allBadges: Array<{ key: string; bg: string; label: string; iconUri?: string }> = [];
  if (provider.is_sponsored) {
    allBadges.push({ key: "spon", bg: "#D97706", label: sponsoredListingLabel });
  }
  if (provider.current_badge) {
    allBadges.push({
      key: "badge",
      bg: provider.current_badge.color ?? "#6366f1",
      label: provider.current_badge.name,
      iconUri: provider.current_badge.icon_url ?? undefined,
    });
  }
  if (showTopRatedBadge) allBadges.push({ key: "top", bg: Colors.primary, label: "Top Rated" });
  if (showHottestBadge) allBadges.push({ key: "hot", bg: "#EA580C", label: "Hottest" });
  if (showNearestBadge) allBadges.push({ key: "near", bg: "#2563EB", label: "Nearest" });
  if (showUpcomingBadge) allBadges.push({ key: "up", bg: "#9333EA", label: "Rising Star" });
  if (provider.business_type === "freelancer") allBadges.push({ key: "free", bg: "#F97316", label: "Freelancer" });
  if (provider.supports_house_calls) allBadges.push({ key: "house", bg: "#22C55E", label: "House Calls" });
  if (provider.supports_salon) allBadges.push({ key: "salon", bg: "#A855F7", label: "At Salon" });

  const visibleBadges = allBadges.slice(0, MAX_VISIBLE_BADGES);
  const overflowCount = allBadges.length - MAX_VISIBLE_BADGES;

  return (
    <AnimatedPressable
      scaleValue={0.97}
      onPress={handlePress}
      style={[{ borderRadius: 24, overflow: "hidden", backgroundColor: Colors.white }, Shadows.card]}
      accessibilityRole="button"
      accessibilityLabel={`${provider.business_name}, rated ${provider.rating > 0 ? provider.rating.toFixed(1) : "0.0"} stars, ${provider.review_count || 0} reviews`}
      accessibilityHint="Opens the provider profile page"
    >
      <View style={{ width: "100%", aspectRatio: compact ? 16 / 9 : 16 / 9, overflow: "hidden" }}>
        <Image
          source={{ uri: thumbnailUrl }}
          style={{ width: "100%", height: "100%" }}
          contentFit="cover"
          transition={300}
          placeholder={{ blurhash: "L6PZfSi_.AyE_3t7t7R**0o#DgR4" }}
          cachePolicy="memory-disk"
          accessibilityLabel={`${provider.business_name} listing photo`}
        />
        <View style={{ position: "absolute", top: 8, left: 8, flexDirection: "column", gap: 4 }}>
          {visibleBadges.map((b, idx) => (
            <View
              key={b.key}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 9999,
                backgroundColor: b.bg,
                marginTop: idx === 0 ? 0 : 0,
              }}
            >
              {b.iconUri ? (
                <Image
                  source={{ uri: b.iconUri }}
                  style={{ width: 10, height: 10, marginRight: 4 }}
                  contentFit="contain"
                />
              ) : null}
              <Text style={badgeTextStyle}>{b.label}</Text>
            </View>
          ))}
          {overflowCount > 0 && (
            <View
              style={{
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 9999,
                backgroundColor: "rgba(0,0,0,0.55)",
              }}
            >
              <Text style={badgeTextStyle}>+{overflowCount} more</Text>
            </View>
          )}
        </View>
        <View style={[{ position: "absolute", top: 8, right: 8, backgroundColor: Colors.white, borderRadius: 9999, padding: 6 }, Shadows.cardSubtle]}>
          <Ionicons name="heart" size={14} color={Colors.primary} />
        </View>
        <View style={{ position: "absolute", bottom: 8, left: 8 }} accessibilityElementsHidden>
          <View style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: Colors.white, overflow: "hidden", backgroundColor: Colors.gray[200] }}>
            {avatarUrl ? (
              <Image
                source={{ uri: avatarUrl }}
                style={{ width: 40, height: 40 }}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
            ) : (
              <View style={{ width: "100%", height: "100%", alignItems: "center", justifyContent: "center", backgroundColor: Colors.gray[300] }}>
                <Text style={{ color: Colors.white, fontWeight: "600", fontSize: 12 }}>{providerInitial}</Text>
              </View>
            )}
          </View>
        </View>
      </View>
      <View style={{ padding: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text style={{ fontWeight: "600", fontSize: 14, color: Colors.gray[900], flex: 1 }} numberOfLines={1}>{provider.business_name}</Text>
          {provider.is_verified && (
            <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: "#F59E0B", alignItems: "center", justifyContent: "center", marginLeft: 4 }}>
              <Ionicons name="checkmark" size={10} color="white" />
            </View>
          )}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}>
          <Ionicons name="star" size={12} color="#EAB308" />
          <Text style={{ fontSize: 12, fontWeight: "500", color: Colors.gray[700], marginLeft: 4 }}>{provider.rating > 0 ? provider.rating.toFixed(1) : "0.0"}</Text>
          <Text style={{ fontSize: 12, color: Colors.gray[500], marginLeft: 4 }}>({formatCount(provider.review_count || 0)})</Text>
        </View>
        {cardDescription ? (
          <Text style={{ fontSize: 10, color: Colors.gray[600], marginTop: 6, lineHeight: 14, flexShrink: 1 }} numberOfLines={2}>{cardDescription}</Text>
        ) : null}
        {provider.distance_km != null ? (
          <Text style={{ fontSize: 12, color: Colors.gray[500], marginTop: 4 }}>{provider.distance_km.toFixed(0)} KM Away</Text>
        ) : null}
      </View>
    </AnimatedPressable>
  );
});
