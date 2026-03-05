import { View, Text } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { AnimatedPressable } from "@/components/AnimatedPressable";
import type { PublicProviderCard } from "@/types/api";
import { Colors, Shadows } from "@/constants/colors";

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

  return (
    <AnimatedPressable
      scaleValue={0.97}
      onPress={() => router.push({ pathname: "/(app)/partner-profile", params: { slug: provider.slug } })}
      className="rounded-2xl overflow-hidden bg-white"
      style={Shadows.card}
      accessibilityRole="button"
      accessibilityLabel={`${provider.business_name}, rated ${provider.rating > 0 ? provider.rating.toFixed(1) : "0.0"} stars, ${provider.review_count || 0} reviews`}
      accessibilityHint="Opens the provider profile page"
    >
      <View className={compact ? "h-32" : "h-44"}>
        <Image
          source={{ uri: thumbnailUrl }}
          style={{ width: "100%", height: "100%" }}
          contentFit="cover"
          transition={300}
          placeholder={{ blurhash: "L6PZfSi_.AyE_3t7t7R**0o#DgR4" }}
          cachePolicy="memory-disk"
          accessibilityLabel={`${provider.business_name} listing photo`}
        />
        <View className="absolute top-2 left-2 flex-col gap-1">{
          [
            showTopRatedBadge && <View key="top" className="bg-primary px-2 py-1 rounded-full"><Text className="text-white text-[10px] font-medium">Top Rated</Text></View>,
            showHottestBadge && <View key="hot" className="bg-orange-600 px-2 py-1 rounded-full"><Text className="text-white text-[10px] font-medium">Hottest</Text></View>,
            showNearestBadge && <View key="near" className="bg-blue-600 px-2 py-1 rounded-full"><Text className="text-white text-[10px] font-medium">Nearest</Text></View>,
            showUpcomingBadge && <View key="up" className="bg-purple-600 px-2 py-1 rounded-full"><Text className="text-white text-[10px] font-medium">Rising Star</Text></View>,
            provider.business_type === "freelancer" && <View key="free" className="bg-orange-500 px-2 py-1 rounded-full"><Text className="text-white text-[10px] font-medium">Freelancer</Text></View>,
            provider.supports_house_calls && <View key="house" className="bg-green-500 px-2 py-1 rounded-full"><Text className="text-white text-[10px] font-medium">House Calls</Text></View>,
            provider.supports_salon && <View key="salon" className="bg-purple-500 px-2 py-1 rounded-full"><Text className="text-white text-[10px] font-medium">At Salon</Text></View>,
            provider.current_badge && <View key="badge" className="px-2 py-1 rounded-full" style={{ backgroundColor: provider.current_badge.color ?? "#6366f1" }}><Text className="text-white text-[10px] font-medium">{provider.current_badge.name}</Text></View>,
            provider.is_sponsored && <View key="spon" className="bg-amber-600 px-2 py-1 rounded-full"><Text className="text-white text-[10px] font-medium">Sponsored</Text></View>,
          ].filter(Boolean)
        }</View>
        <View
          className="absolute top-2 right-2 bg-white rounded-full p-1.5"
          style={Shadows.cardSubtle}
        >
          <Ionicons name="heart" size={14} color={Colors.primary} />
        </View>
        <View className="absolute bottom-2 left-2" accessibilityElementsHidden>
          <View className="w-10 h-10 rounded-full border-2 border-white overflow-hidden bg-gray-200">{
            avatarUrl ? (
              <Image
                source={{ uri: avatarUrl }}
                style={{ width: 40, height: 40 }}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
            ) : (
              <View className="w-full h-full items-center justify-center bg-gray-300">
                <Text className="text-white font-semibold text-xs">{providerInitial}</Text>
              </View>
            )
          }</View>
        </View>
      </View>
      <View className="p-3">
        <View className="flex-row items-center gap-1">
          <Text className="font-semibold text-sm text-gray-900 flex-1" numberOfLines={1}>{provider.business_name}</Text>{
            provider.is_verified && (
              <View className="w-4 h-4 rounded-full bg-amber-500 items-center justify-center">
                <Ionicons name="checkmark" size={10} color="white" />
              </View>
            )
          }
        </View>
        <View className="flex-row items-center gap-1 mt-1">
          <Ionicons name="star" size={12} color="#EAB308" />
          <Text className="text-xs font-medium text-gray-700">{provider.rating > 0 ? provider.rating.toFixed(1) : "0.0"}</Text>
          <Text className="text-xs text-gray-500">({formatCount(provider.review_count || 0)})</Text>
        </View>{
          provider.description && provider.description.trim() ? (
            <Text className="text-[10px] text-gray-600 mt-1.5 leading-relaxed" numberOfLines={2}>{formatDescription(provider.description)}</Text>
          ) : null
        }{
          provider.distance_km != null ? (
            <Text className="text-xs text-gray-500 mt-1">{provider.distance_km.toFixed(0)} KM Away</Text>
          ) : null
        }
      </View>
    </AnimatedPressable>
  );
}
