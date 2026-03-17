import { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  StatusBar,
  StyleSheet,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { haptic } from "@/lib/haptics";
import { useAuth } from "@/providers/AuthProvider";
import { useNotifications } from "@/providers/NotificationsContext";
import { useSelectedAddress } from "@/providers/SelectedAddressProvider";
import { useLocation } from "@/hooks/useLocation";
import { useAddresses } from "@/hooks/useAddresses";
import { useResponsive } from "@/hooks/useResponsive";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { useHomeData } from "@/features/home/useHomeData";
import { useGlobalCategories, getCategoryIcon } from "@/features/home/useGlobalCategories";
import { ProviderCard } from "@/components/ProviderCard";
import { AddressPicker } from "@/components/AddressPicker";
import { SaveAddressModal, type SaveAddressPayload } from "@/components/SaveAddressModal";
import type { AddressPickerSelection } from "@/components/AddressPicker";
import { api } from "@/lib/api-client";
import { InlineSearch } from "@/components/InlineSearch";
import { FadeIn } from "@/components/FadeIn";
import type { PublicProviderCard } from "@/types/api";
import {
  TAB_CONTENT_PADDING_BOTTOM,
  HOME_SECTION_MARGIN_BOTTOM,
  HOME_SECTION_HEADER_MARGIN_BOTTOM,
  HOME_SECTION_HEADER_MARGIN_TOP,
  HOME_SECTION_TITLE_FONT_SIZE,
} from "@/constants/layout";
import { Colors } from "@/constants/colors";
import { HomeSkeleton } from "@/components/Skeleton";

const GAP = 16;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  contentWrapper: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  contentWrapperTablet: {
    maxWidth: 640,
    alignSelf: "center",
    width: "100%",
  },
  addressBar: {
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  addressBarInner: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  addressBarPill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primary,
    borderRadius: 9999,
    paddingVertical: 10,
    paddingHorizontal: 20,
    maxWidth: 400,
    minWidth: 0,
    flex: 1,
  },
  addressBarButton: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    minWidth: 0,
  },
  addressBarIconMargin: { marginRight: 8 },
  addressBarText: {
    color: "white",
    fontWeight: "500",
    fontSize: 16,
    flexShrink: 1,
  },
  addressBarChevron: { marginLeft: 8 },
  navRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  navLeftGroup: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    minWidth: 80,
  },
  navLogo: {
    width: 28,
    height: 28,
    borderRadius: 6,
  },
  navCenterGroup: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 0,
  },
  navTab: {
    alignItems: "center",
    paddingBottom: 4,
    flexDirection: "row",
    marginRight: 24,
  },
  navTabActive: {
    borderBottomWidth: 2,
    borderBottomColor: Colors.primary,
  },
  navTabExplore: { marginRight: 24 },
  navTabLabel: { marginLeft: 8 },
  navTabLabelExplore: { marginLeft: 6 },
  navNewBadge: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: "center",
    marginLeft: 6,
  },
  navNewBadgeText: { fontSize: 8, color: Colors.white, fontWeight: "700" },
  navCenterSpacer: {
    flex: 1,
    minWidth: 0,
  },
  navRightGroup: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    position: "relative",
  },
  navSearchMargin: { marginRight: 16 },
  categoryRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
    flexDirection: "row",
  },
  categoryScroll: { flexGrow: 0 },
  categoryScrollContent: {
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
  },
  mainScroll: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  mainScrollContent: {
    paddingBottom: TAB_CONTENT_PADDING_BOTTOM,
    paddingTop: 16,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: HOME_SECTION_HEADER_MARGIN_BOTTOM,
    paddingHorizontal: 16,
  },
  sectionHeaderFirst: { marginTop: 16 },
  sectionHeaderRest: { marginTop: HOME_SECTION_HEADER_MARGIN_TOP },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  sectionTitleStarMargin: { marginLeft: 4 },
  viewMoreRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  viewMoreText: {
    fontSize: 12,
    fontWeight: "500",
    color: Colors.gray[900],
    textDecorationLine: "underline",
  },
  viewMoreIcon: { marginLeft: 4 },
  sectionContainer: { marginBottom: HOME_SECTION_MARGIN_BOTTOM },
  horizontalCardsContent: {
    paddingHorizontal: 16,
    flexDirection: "row",
  },
  cardWrapper: { marginRight: GAP },
  errorBox: {
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 12,
    padding: 16,
    margin: 16,
  },
  errorText: { color: "#B91C1C", marginBottom: 12 },
  retryButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
  },
  retryText: { color: Colors.white, fontWeight: "600" },
});

function SectionHeader({
  title,
  onViewMore,
  contentPadding,
  isFirst,
}: {
  title: string;
  onViewMore?: () => void;
  contentPadding: number;
  isFirst?: boolean;
}) {
  return (
    <View
      style={[
        styles.sectionHeaderRow,
        { paddingHorizontal: contentPadding },
        isFirst ? styles.sectionHeaderFirst : styles.sectionHeaderRest,
      ]}
    >
      <View style={styles.sectionTitleRow}>
        <Text style={{ fontSize: HOME_SECTION_TITLE_FONT_SIZE, fontWeight: "400", color: Colors.gray[900] }}>
          {title}
        </Text>
        {title === "Top Rated" ? (
          <View style={styles.sectionTitleStarMargin}>
            <Text style={{ color: "#FACC15", fontSize: 12 }}>★★★</Text>
          </View>
        ) : null}
      </View>
      {onViewMore ? (
        <TouchableOpacity
          onPress={onViewMore}
          style={styles.viewMoreRow}
          accessibilityRole="button"
          accessibilityLabel={`View more ${title}`}
          accessibilityHint={`Shows all providers in the ${title} section`}
        >
          <Text style={styles.viewMoreText}>View More</Text>
          <Ionicons name="arrow-forward" size={12} color="black" style={styles.viewMoreIcon} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function ProviderSection({
  title,
  providers,
  badge,
  cardWidth,
  contentPadding,
  isFirst,
  onViewMore,
}: {
  title: string;
  providers: PublicProviderCard[];
  badge: "topRated" | "sponsored" | "hottest" | "nearest" | "upcoming";
  cardWidth: number;
  contentPadding: number;
  isFirst?: boolean;
  onViewMore?: () => void;
}) {
  if (providers.length === 0) return null;

  return (
    <View style={styles.sectionContainer}>
      <SectionHeader
        title={title}
        onViewMore={onViewMore}
        contentPadding={contentPadding}
        isFirst={isFirst}
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.horizontalCardsContent, { paddingHorizontal: contentPadding }]}
        accessibilityRole="list"
        accessibilityLabel={`${title} providers`}
      >
        {providers.slice(0, 8).map((p) => (
          <View key={p.id} style={[styles.cardWrapper, { width: cardWidth }]}>
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
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 9999,
        marginRight: 12,
        borderBottomWidth: active ? 2 : 0,
        borderBottomColor: active ? Colors.primary : "transparent",
      }}
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
      <Text
        style={{
          fontSize: 14,
          color: active ? Colors.primary : Colors.gray[600],
          fontWeight: active ? "500" : "400",
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  useScreenTracking("Home");
  const { user } = useAuth();
  const { unreadCount } = useNotifications();
  const { coords, loading: locationLoading } = useLocation();
  const { selectedAddress, setSelectedAddress } = useSelectedAddress();
  const { addresses, reload: reloadAddresses } = useAddresses(!!user);
  const { cardWidth, contentPadding, contentMaxWidth, isTablet } = useResponsive();
  const [activeCategory, setActiveCategory] = useState("All");
  const [saveAddressModalVisible, setSaveAddressModalVisible] = useState(false);
  const [pendingAddressSelection, setPendingAddressSelection] = useState<AddressPickerSelection | null>(null);
  const contentWrapperDynamic = isTablet
    ? [styles.contentWrapper, { maxWidth: contentMaxWidth, alignSelf: "center" as const, width: "100%" as const }]
    : styles.contentWrapper;

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
  }, [setSelectedAddress]);

  const handleAddressPickerSelect = useCallback(
    (selection: AddressPickerSelection) => {
      if (selection.addressId) {
        setSelectedAddress({
          label: selection.label,
          latitude: selection.latitude,
          longitude: selection.longitude,
          displayName: selection.displayName,
        });
        setAddressPickerVisible(false);
      } else {
        setPendingAddressSelection(selection);
        setAddressPickerVisible(false);
        setSaveAddressModalVisible(true);
      }
    },
    [setSelectedAddress],
  );

  const handleSaveAndUse = useCallback(
    async (payload: SaveAddressPayload) => {
      const res = await api.post<{ id: string; address_line1: string; city: string; latitude?: number; longitude?: number }>("/api/me/addresses", payload);
      if (res.error) {
        throw new Error(res.error.message ?? "Failed to save address");
      }
      const created = res.data;
      setSelectedAddress({
        label: payload.label,
        latitude: payload.latitude,
        longitude: payload.longitude,
        displayName: [created?.address_line1, created?.city].filter(Boolean).join(", ") || `${payload.address_line1}, ${payload.city}`,
      });
      await reloadAddresses();
    },
    [setSelectedAddress, reloadAddresses],
  );

  const handleSaveAndUseWithError = useCallback(
    async (payload: SaveAddressPayload) => {
      try {
        await handleSaveAndUse(payload);
      } catch (e) {
        Alert.alert("Couldn't save address", e instanceof Error ? e.message : "Please try again.");
        throw e;
      }
    },
    [handleSaveAndUse],
  );

  const handleJustUse = useCallback(() => {
    if (pendingAddressSelection) {
      setSelectedAddress({
        label: pendingAddressSelection.label,
        latitude: pendingAddressSelection.latitude,
        longitude: pendingAddressSelection.longitude,
        displayName: pendingAddressSelection.displayName,
      });
    }
    setPendingAddressSelection(null);
  }, [pendingAddressSelection, setSelectedAddress]);

  const addressLabel =
    selectedAddress?.displayName ??
    (locationLoading ? "Detecting location…" : coords ? "Current location" : "Select address");

  if (loading && !data) {
    return (
      <View style={styles.root}>
        <HomeSkeleton />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.white} />

      <View style={contentWrapperDynamic}>
        <SafeAreaView edges={["top"]} style={styles.addressBar}>
          <View style={[styles.addressBarInner, { paddingHorizontal: contentPadding }]}>
            <View style={styles.addressBarPill}>
              <TouchableOpacity
                style={styles.addressBarButton}
                onPress={() => setAddressPickerVisible(true)}
                accessibilityRole="button"
                accessibilityLabel="Select address"
                accessibilityHint="Opens address selector to choose your location"
              >
                <Ionicons name="location" size={20} color="white" style={styles.addressBarIconMargin} />
                <Text style={styles.addressBarText} numberOfLines={2} ellipsizeMode="tail">
                  {addressLabel}
                </Text>
                <Ionicons name="chevron-down" size={16} color="white" style={styles.addressBarChevron} />
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>

        <View style={[styles.navRow, { paddingHorizontal: contentPadding }]}>
          <View style={styles.navLeftGroup}>
            <TouchableOpacity
              onPress={() => router.push("/(app)/(tabs)/home")}
              accessibilityRole="image"
              accessibilityLabel="Beautonomi logo"
              style={{ padding: 4 }}
            >
              <Image source={require("../../../assets/favicon.png")} style={styles.navLogo} />
            </TouchableOpacity>
          </View>
          <View style={styles.navCenterGroup}>
            <TouchableOpacity
              style={[styles.navTab, styles.navTabActive]}
              accessibilityRole="button"
              accessibilityLabel="Home tab"
              accessibilityState={{ selected: true }}
            >
              <Ionicons name="home" size={18} color={Colors.primary} />
              <Text style={[styles.navTabLabel, { color: Colors.primary, fontWeight: "500" }]}>Home</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.navTab, styles.navTabExplore]}
              onPress={() => router.push("/(app)/(tabs)/explore")}
              accessibilityRole="button"
              accessibilityLabel="Explore tab"
              accessibilityHint="Navigate to the Explore feed"
              accessibilityState={{ selected: false }}
            >
              <Ionicons name="compass-outline" size={18} color={Colors.gray[500]} />
              <Text style={[styles.navTabLabelExplore, { color: Colors.gray[500], fontWeight: "500" }]}>
                Explore
              </Text>
              <View style={styles.navNewBadge}>
                <Text style={styles.navNewBadgeText}>NEW</Text>
              </View>
            </TouchableOpacity>
          </View>
          <View style={styles.navRightGroup}>
            <View style={styles.navSearchMargin}>
              <InlineSearch />
            </View>
            <TouchableOpacity
              onPress={() => {
                haptic.selection();
                router.push("/(app)/account-settings/wishlists");
              }}
              accessibilityRole="button"
              accessibilityLabel="Wishlist"
              accessibilityHint="Open saved providers and wishlists"
              style={styles.navSearchMargin}
            >
              <Ionicons name="heart-outline" size={24} color="#333" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push("/(app)/notifications")}
              accessibilityRole="button"
              accessibilityLabel="Notifications"
              accessibilityHint="Open notifications"
              style={{ position: "relative" }}
            >
              <Ionicons name="notifications-outline" size={24} color="#333" />
              {unreadCount > 0 ? (
                <View
                  style={{
                    position: "absolute",
                    top: -4,
                    right: -4,
                    minWidth: 18,
                    height: 18,
                    borderRadius: 9,
                    backgroundColor: Colors.primary,
                    alignItems: "center",
                    justifyContent: "center",
                    paddingHorizontal: 4,
                  }}
                >
                  <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </Text>
                </View>
              ) : null}
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.categoryRow}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[styles.categoryScrollContent, { paddingHorizontal: contentPadding }]}
            style={styles.categoryScroll}
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
          style={styles.mainScroll}
          contentContainerStyle={styles.mainScrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refetch} tintColor={Colors.primary} />
          }
        >
          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>
                {error === "Failed to fetch"
                  ? "Can't connect. Check your internet and try again."
                  : error}
              </Text>
              <TouchableOpacity
                onPress={() => refetch()}
                style={styles.retryButton}
                accessibilityRole="button"
                accessibilityLabel="Retry loading providers"
                accessibilityHint="Attempts to reload the provider list"
              >
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {data ? (
            <FadeIn delay={100} duration={400}>
              <View>
                <ProviderSection
                  title="Top Rated"
                  providers={data.topRated || []}
                  badge="topRated"
                  cardWidth={cardWidth}
                  contentPadding={contentPadding}
                  isFirst
                  onViewMore={() => router.push("/(app)/more-providers/top-rated")}
                />
                <ProviderSection
                  title="Sponsored"
                  providers={data.sponsored || []}
                  badge="sponsored"
                  cardWidth={cardWidth}
                  contentPadding={contentPadding}
                  onViewMore={() => router.push("/(app)/more-providers/sponsored")}
                />
                <ProviderSection
                  title="Nearest Providers"
                  providers={data.nearest || []}
                  badge="nearest"
                  cardWidth={cardWidth}
                  contentPadding={contentPadding}
                  onViewMore={() => router.push("/(app)/more-providers/nearest")}
                />
                <ProviderSection
                  title="Hottest Picks"
                  providers={data.hottest || []}
                  badge="hottest"
                  cardWidth={cardWidth}
                  contentPadding={contentPadding}
                  onViewMore={() => router.push("/(app)/more-providers/hottest")}
                />
                <ProviderSection
                  title="Upcoming Talent"
                  providers={data.upcoming || []}
                  badge="upcoming"
                  cardWidth={cardWidth}
                  contentPadding={contentPadding}
                  onViewMore={() => router.push("/(app)/more-providers/upcoming")}
                />
              </View>
            </FadeIn>
          ) : null}
        </ScrollView>
      </View>

      <AddressPicker
        visible={addressPickerVisible}
        onClose={() => setAddressPickerVisible(false)}
        onSelect={handleAddressPickerSelect}
        onUseCurrentLocation={handleUseCurrentLocation}
      />

      <SaveAddressModal
        visible={saveAddressModalVisible}
        onClose={() => {
          setSaveAddressModalVisible(false);
          setPendingAddressSelection(null);
        }}
        selection={pendingAddressSelection}
        addressCount={addresses.length}
        onSaveAndUse={handleSaveAndUseWithError}
        onJustUse={handleJustUse}
      />
    </View>
  );
}
