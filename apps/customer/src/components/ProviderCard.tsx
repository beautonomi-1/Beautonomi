import { View, Text } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { AnimatedPressable } from "@/components/AnimatedPressable";
import type { PublicProviderCard } from "@/types/api";
import { Colors, Shadows } from "@/constants/colors";
import { api } from "@/lib/api-client";

interface ProviderCardProps {
  provider: PublicProviderCard;
  showTopRatedBadge?: boolean;
  showHottestBadge?: boolean;
  showNearestBadge?: boolean;
  showUpcomingBadge?: boolean;
  compact?: boolean;
}

const PLACEHOLDER = "https://placehold.co/400x300/f5f5f5/999?text=Beauty";

export function ProviderCard({
  provider,
  showTopRatedBadge = false,
  showHottestBadge = false,
  showNearestBadge = false,
  showUpcomingBadge = false,
  compact = false,
}: ProviderCardProps) {
  const thumbnailUrl = provider.thumbnail_url || PLACEHOLDER;
  const avatarUrl = provider.avatar_url || provider.thumbnail_url || PLACEHOLDER;
  const formatCount = (c: number) => (c >= 1000 ? `${(c / 1000).toFixed(1)}k` : String(c));
  const formatDescription = (desc: string) => {
    if (!desc) return "";
    const trimmed = desc.trim();
    if (trimmed.length === 0) return "";
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
  };
  const providerInitial = provider.business_name.charAt(0).toUpperCase();

  const handlePress = () => {
    if (provider.is_sponsored && provider.campaign_id && provider.id) {
      api.post("/api/public/ads/event", {
        event_type: "click",
        campaign_id: provider.campaign_id,
        provider_id: provider.id,
        idempotency_key: `click:${provider.campaign_id}:${provider.id}:${Date.now()}`,
      }).catch(() => {});
    }
    const params: { slug: string; campaign_id?: string; provider_id?: string } = { slug: provider.slug };
    if (provider.is_sponsored && provider.campaign_id && provider.id) {
      params.campaign_id = provider.campaign_id;
      params.provider_id = provider.id;
    }
    router.push({ pathname: "/(app)/partner-profile", params });
  };

  const badgeStyle = { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 9999, marginTop: 4 };
  const badgeStyleFirst = { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 9999 };
  const badgeTextStyle = { color: Colors.white, fontSize: 10, fontWeight: "500" as const };

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
        <View style={{ position: "absolute", top: 8, left: 8, flexDirection: "column" }}>
          {[
            showTopRatedBadge && <View key="top" style={[badgeStyleFirst, { backgroundColor: Colors.primary }]}><Text style={badgeTextStyle}>Top Rated</Text></View>,
            showHottestBadge && <View key="hot" style={[badgeStyle, { backgroundColor: "#EA580C" }]}><Text style={badgeTextStyle}>Hottest</Text></View>,
            showNearestBadge && <View key="near" style={[badgeStyle, { backgroundColor: "#2563EB" }]}><Text style={badgeTextStyle}>Nearest</Text></View>,
            showUpcomingBadge && <View key="up" style={[badgeStyle, { backgroundColor: "#9333EA" }]}><Text style={badgeTextStyle}>Rising Star</Text></View>,
            provider.business_type === "freelancer" && <View key="free" style={[badgeStyle, { backgroundColor: "#F97316" }]}><Text style={badgeTextStyle}>Freelancer</Text></View>,
            provider.supports_house_calls && <View key="house" style={[badgeStyle, { backgroundColor: "#22C55E" }]}><Text style={badgeTextStyle}>House Calls</Text></View>,
            provider.supports_salon && <View key="salon" style={[badgeStyle, { backgroundColor: "#A855F7" }]}><Text style={badgeTextStyle}>At Salon</Text></View>,
            provider.current_badge && <View key="badge" style={[badgeStyle, { backgroundColor: provider.current_badge.color ?? "#6366f1" }]}><Text style={badgeTextStyle}>{provider.current_badge.name}</Text></View>,
            provider.is_sponsored && <View key="spon" style={[badgeStyle, { backgroundColor: "#D97706" }]}><Text style={badgeTextStyle}>Sponsored</Text></View>,
          ].filter(Boolean)}
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
        {provider.description && provider.description.trim() ? (
          <Text style={{ fontSize: 10, color: Colors.gray[600], marginTop: 6, lineHeight: 14, flexShrink: 1 }} numberOfLines={2}>{formatDescription(provider.description)}</Text>
        ) : null}
        {provider.distance_km != null ? (
          <Text style={{ fontSize: 12, color: Colors.gray[500], marginTop: 4 }}>{provider.distance_km.toFixed(0)} KM Away</Text>
        ) : null}
      </View>
    </AnimatedPressable>
  );
}
