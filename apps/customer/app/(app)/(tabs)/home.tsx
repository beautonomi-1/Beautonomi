import { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { haptic } from "@/lib/haptics";
import { useAuth } from "@/providers/AuthProvider";
import { useSelectedAddress } from "@/providers/SelectedAddressProvider";
import { useLocation } from "@/hooks/useLocation";
import { useResponsive } from "@/hooks/useResponsive";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { useHomeData } from "@/features/home/useHomeData";
import { useGlobalCategories, getCategoryIcon } from "@/features/home/useGlobalCategories";
import { ProviderCard } from "@/components/ProviderCard";
import { AddressPicker } from "@/components/AddressPicker";
import { InlineSearch } from "@/components/InlineSearch";
import { FadeIn } from "@/components/FadeIn";
import type { PublicProviderCard } from "@/types/api";
import { SCREEN_PADDING, TAB_CONTENT_PADDING_BOTTOM } from "@/constants/layout";
import { Colors } from "@/constants/colors";
import { HomeSkeleton } from "@/components/Skeleton";

const GAP = 16;

function SectionHeader({ title, onViewMore }: { title: string; onViewMore?: () => void }) {
  return (
    <View className="flex-row justify-between items-center mb-3 mt-6 first:mt-0 px-4">
      <View className="flex-row items-center gap-1">
        <Text className="text-xl font-normal text-gray-900">{title}</Text>{
          title === "Top Rated" ? (
            <View className="flex-row">
              <Text className="text-yellow-400 text-xs">★★★</Text>
            </View>
          ) : null
        }
      </View>{
        onViewMore ? (
          <TouchableOpacity
            onPress={onViewMore}
            className="flex-row items-center"
            accessibilityRole="button"
            accessibilityLabel={`View more ${title}`}
            accessibilityHint={`Shows all providers in the ${title} section`}
          >
            <Text className="text-xs font-medium text-gray-900 underline">View More</Text>
            <Ionicons name="arrow-forward" size={12} color="black" />
          </TouchableOpacity>
        ) : null
      }
    </View>
  );
}

function ProviderSection({
  title,
  providers,
  badge,
  cardWidth,
}: {
  title: string;
  providers: PublicProviderCard[];
  badge: "topRated" | "hottest" | "nearest" | "upcoming";
  cardWidth: number;
}) {
  if (providers.length === 0) return null;

  return (
    <View className="mb-6">
      <SectionHeader title={title} onViewMore={() => {}} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: SCREEN_PADDING, gap: GAP }}
        accessibilityRole="list"
        accessibilityLabel={`${title} providers`}
      >
        {providers.slice(0, 8).map((p) => (
          <View key={p.id} style={{ width: cardWidth }}>
            <ProviderCard
              provider={p}
              showTopRatedBadge={badge === "topRated"}
              showHottestBadge={badge === "hottest"}
              showNearestBadge={badge === "nearest"}
              showUpcomingBadge={badge === "upcoming"}
            />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function CategoryPill({
  label,
  icon,
  active = false,
  onPress,
}: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  active?: boolean;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      className={`flex-row items-center px-4 py-2 rounded-full mr-3 ${active ? "border-b-2 border-primary" : ""}`}
      accessibilityRole="button"
      accessibilityLabel={`${label} category`}
      accessibilityState={{ selected: active }}
      accessibilityHint={`Filter providers by ${label} category`}
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={16}
          color={active ? Colors.primary : Colors.gray[500]}
          style={{ marginRight: 6 }}
        />
      ) : null}
      <Text className={`text-sm ${active ? "text-primary font-medium" : "text-gray-600"}`}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  useScreenTracking("Home");
  const { user } = useAuth();
  const { coords, loading: locationLoading } = useLocation();
  const { selectedAddress, setSelectedAddress } = useSelectedAddress();
  const { cardWidth, contentPadding } = useResponsive();
  const [activeCategory, setActiveCategory] = useState("All");

  const { categories: globalCategories } = useGlobalCategories();

  const [addressPickerVisible, setAddressPickerVisible] = useState(false);

  const effectiveLat = selectedAddress?.latitude ?? coords?.latitude;
  const effectiveLng = selectedAddress?.longitude ?? coords?.longitude;

  const { data, loading, refreshing, error, refetch } = useHomeData(
    effectiveLat,
    effectiveLng,
    activeCategory
  );

  const handleCategoryPress = useCallback((cat: string) => {
    if (cat !== activeCategory) {
      haptic.light();
      setActiveCategory(cat);
    }
  }, [activeCategory]);

  const handleUseCurrentLocation = useCallback(() => {
    setSelectedAddress(null);
  }, []);

  const addressLabel = selectedAddress?.displayName ?? (coords ? "Current location" : "Select address");

  if (loading && !data) {
    return (
      <View className="flex-1 bg-white">
        <HomeSkeleton />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-white">
      <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />

      <SafeAreaView edges={["top"]} style={{ backgroundColor: Colors.primary }}>
        <View className="px-4 py-3 flex-row items-center justify-between">
          <TouchableOpacity
            className="flex-row items-center gap-2 flex-1"
            onPress={() => setAddressPickerVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Select address"
            accessibilityHint="Opens address selector to choose your location"
          >
            <Ionicons name="location" size={20} color="white" />
            <Text className="text-white font-medium text-base flex-shrink" numberOfLines={1}>
              {addressLabel}
            </Text>
            <Ionicons name="chevron-down" size={16} color="white" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <View className="flex-row justify-between items-center px-4 py-3 border-b border-gray-100">
        <View className="flex-row gap-6 items-center">
          <TouchableOpacity
            className="items-center border-b-2 border-primary pb-1 flex-row gap-2"
            accessibilityRole="button"
            accessibilityLabel="Home tab"
            accessibilityState={{ selected: true }}
          >
            <Ionicons name="home" size={18} color={Colors.primary} />
            <Text className="text-primary font-medium">Home</Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="items-center pb-1 flex-row gap-2"
            onPress={() => router.push("/(app)/(tabs)/explore")}
            accessibilityRole="button"
            accessibilityLabel="Explore tab"
            accessibilityHint="Navigate to the Explore feed"
            accessibilityState={{ selected: false }}
          >
            <Ionicons name="compass-outline" size={18} color={Colors.gray[500]} />
            <Text className="text-gray-500 font-medium">Explore</Text>
            <View className="bg-primary px-1 rounded-sm">
              <Text className="text-[8px] text-white font-bold">NEW</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            className="items-center pb-1 flex-row gap-2"
            onPress={() => router.push("/shop" as any)}
            accessibilityRole="button"
            accessibilityLabel="Shop tab"
            accessibilityHint="Browse products"
            accessibilityState={{ selected: false }}
          >
            <Ionicons name="bag-outline" size={18} color={Colors.gray[500]} />
            <Text className="text-gray-500 font-medium">Shop</Text>
          </TouchableOpacity>
        </View>
        <View className="flex-row gap-4 items-center">
          <InlineSearch />
          <TouchableOpacity
            onPress={() => router.push("/(app)/(tabs)/profile")}
            accessibilityRole="button"
            accessibilityLabel="Profile"
            accessibilityHint="Navigate to your profile"
          >
            <Ionicons name="person-outline" size={24} color="#333" />
          </TouchableOpacity>
        </View>
      </View>

      <View className="py-3 border-b border-gray-100">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16 }}
          accessibilityRole="list"
          accessibilityLabel="Category filters"
        >
          <CategoryPill
            label="All"
            active={activeCategory === "All"}
            icon="apps-outline"
            onPress={() => handleCategoryPress("All")}
          />
          {globalCategories.map((cat) => (
            <CategoryPill
              key={cat.id}
              label={cat.name}
              active={activeCategory === cat.name}
              icon={getCategoryIcon(cat.slug) as keyof typeof Ionicons.glyphMap}
              onPress={() => handleCategoryPress(cat.name)}
            />
          ))}
        </ScrollView>
      </View>

      <ScrollView
        className="flex-1 bg-white"
        contentContainerStyle={{
          paddingBottom: TAB_CONTENT_PADDING_BOTTOM,
        }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refetch} tintColor={Colors.primary} />
        }
      >{
        error ? (
          <View className="bg-red-50 border border-red-200 rounded-xl p-4 m-4">
            <Text className="text-red-700 mb-3">{error}</Text>
            <TouchableOpacity
              onPress={() => refetch()}
              className="bg-primary py-2.5 rounded-xl items-center"
              accessibilityRole="button"
              accessibilityLabel="Retry loading providers"
              accessibilityHint="Attempts to reload the provider list"
            >
              <Text className="text-white font-semibold">Retry</Text>
            </TouchableOpacity>
          </View>
        ) : null
      }{
        data ? (
          <FadeIn delay={100} duration={400}>
            <View className="pt-4">
              <ProviderSection title="Top Rated" providers={data.topRated || []} badge="topRated" cardWidth={cardWidth} />
              <ProviderSection title="Nearest Providers" providers={data.nearest || []} badge="nearest" cardWidth={cardWidth} />
              <ProviderSection title="Hottest Picks" providers={data.hottest || []} badge="hottest" cardWidth={cardWidth} />
              <ProviderSection title="Upcoming Talent" providers={data.upcoming || []} badge="upcoming" cardWidth={cardWidth} />{
                data.browseByCity && data.browseByCity.length > 0 ? (
                  <View className="mb-6">
                    <SectionHeader title="Browse by City" />
                    {data.browseByCity.map((cityGroup) => (
                      <View key={cityGroup.city} className="mb-4">
                        <Text className="text-base font-medium text-gray-700 mb-2 px-4">{cityGroup.city}</Text>
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={{ paddingHorizontal: SCREEN_PADDING, gap: GAP }}
                          accessibilityRole="list"
                          accessibilityLabel={`Providers in ${cityGroup.city}`}
                        >
                          {(cityGroup.providers || []).slice(0, 4).map((p) => (
                            <View key={p.id} style={{ width: cardWidth }}>
                              <ProviderCard provider={p} />
                            </View>
                          ))}
                        </ScrollView>
                      </View>
                    ))}
                  </View>
                ) : null
              }
            </View>
          </FadeIn>
        ) : null
      }</ScrollView>

      <AddressPicker
        visible={addressPickerVisible}
        onClose={() => setAddressPickerVisible(false)}
        onSelect={setSelectedAddress}
        onUseCurrentLocation={handleUseCurrentLocation}
      />
    </View>
  );
}
