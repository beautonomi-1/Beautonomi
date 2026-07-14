import { useCallback, useEffect, useRef, useState, memo, useMemo } from "react";
import { useFocusEffect } from "expo-router";
import { NotificationsDropdown } from "@/components/NotificationsDropdown";
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
import { useSelectedAddress, hasValidServiceCoordinates } from "@/providers/SelectedAddressProvider";
import { useLocation } from "@/hooks/useLocation";
import { useAddresses } from "@/hooks/useAddresses";
import { useResponsive } from "@/hooks/useResponsive";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { trackHomeView } from "@/lib/analytics";
import { useHomeData } from "@/features/home/useHomeData";
import { useGlobalCategories, getCategoryIcon, getGlobalCategoryImageUri } from "@/features/home/useGlobalCategories";
import { ProviderCard } from "@/components/ProviderCard";
import { AddressPicker } from "@/components/AddressPicker";
import { InstallAppBanner } from "@/components/InstallAppBanner";
import { IdentityVerificationBanner } from "@/components/IdentityVerificationBanner";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { BeautonomiWordmark } from "@/components/BeautonomiWordmark";
import { SaveAddressModal, type SaveAddressPayload } from "@/components/SaveAddressModal";
import type { AddressPickerSelection } from "@/components/AddressPicker";
import { api } from "@/lib/api-client";
import { FadeIn } from "@/components/FadeIn";
import { useTranslation } from "@beautonomi/i18n";
import type { PublicProviderCard } from "@/types/api";
import {
  HOME_SECTION_MARGIN_BOTTOM,
  HOME_SECTION_HEADER_MARGIN_BOTTOM,
  HOME_SECTION_HEADER_MARGIN_TOP,
  HOME_SECTION_TITLE_FONT_SIZE,
} from "@/constants/layout";
import { Colors } from "@/constants/colors";
import { HomeSkeleton } from "@/components/Skeleton";
import { useTabContentPaddingBottom } from "@/hooks/useTabContentPaddingBottom";

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
    position: "relative",
    minHeight: 52,
  },
  navLeftGroup: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    zIndex: 1,
  },
  // Centered in the row; horizontal insets reserve space for logo (left) and toolbar
  // (right) so labels never render under the icon column on narrow phones.
  navCenterGroup: {
    position: "absolute",
    top: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "box-none",
  },
  navTab: {
    alignItems: "center",
    flexDirection: "column",
    paddingBottom: 4,
  },
  navTabActive: {
    borderBottomWidth: 2,
    borderBottomColor: Colors.primary,
  },
  navTabExplore: {},
  navTabLabel: { marginTop: 3, fontSize: 11 },
  navTabLabelExplore: { marginTop: 3, fontSize: 11 },
  navCenterSpacer: {
    flex: 1,
    minWidth: 0,
  },
  navRightGroup: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    zIndex: 1,
    gap: 8,
  },
  navIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.gray[50],
    alignItems: "center",
    justifyContent: "center",
  },
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
  categoryLoadingText: {
    fontSize: 13,
    color: Colors.gray[500],
    paddingHorizontal: 4,
  },
  categoryErrorRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
    gap: 8,
  },
  categoryErrorText: {
    fontSize: 13,
    color: "#B91C1C",
    flexShrink: 1,
  },
  categoryRetryButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.primary,
  },
  categoryRetryText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: "600",
  },
  mainScroll: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  mainScrollContent: {
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

const SectionHeader = memo(function SectionHeader({
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
});

const ProviderSection = memo(function ProviderSection({
  title,
  providers,
  badge,
  cardWidth,
  contentPadding,
  isFirst,
  onViewMore,
  feedOriginLat,
  feedOriginLng,
  sponsoredListingLabel,
}: {
  title: string;
  providers: PublicProviderCard[];
  badge: "topRated" | "sponsored" | "hottest" | "nearest" | "upcoming";
  cardWidth: number;
  contentPadding: number;
  isFirst?: boolean;
  onViewMore?: () => void;
  feedOriginLat?: number | null;
  feedOriginLng?: number | null;
  sponsoredListingLabel?: string;
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
              sponsoredListingLabel={sponsoredListingLabel}
              feedOriginLat={feedOriginLat}
              feedOriginLng={feedOriginLng}
            />
          </View>
        ))}
      </ScrollView>
    </View>
  );
});

const CategoryPill = memo(function CategoryPill({
  label,
  imageUri,
  ionIcon,
  active = false,
  onPress,
  imagePriority = "normal",
}: {
  label: string;
  /** Remote icon from API (`EXPO_PUBLIC_APP_URL` + `/images/...`) */
  imageUri?: string | null;
  ionIcon?: keyof typeof Ionicons.glyphMap;
  active?: boolean;
  onPress?: () => void;
  imagePriority?: "low" | "normal" | "high";
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
      {imageUri ? (
        <Image
          source={{ uri: imageUri }}
          style={{
            width: 18,
            height: 18,
            marginRight: 6,
            opacity: active ? 1 : 0.52,
          }}
          contentFit="contain"
          priority={imagePriority}
          accessibilityIgnoresInvertColors
        />
      ) : ionIcon ? (
        <Ionicons
          name={ionIcon}
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
});

export default function HomeScreen() {
  useScreenTracking("Home");
  const { t } = useTranslation();
  useEffect(() => {
    trackHomeView();
  }, []);
  const { user } = useAuth();
  const { unreadCount } = useNotifications();
  const { selectedAddress, setSelectedAddress, isLoading: selectedAddressLoading } = useSelectedAddress();
  const { addresses, reload: reloadAddresses } = useAddresses(!!user);
  const shouldUseGps = !selectedAddressLoading && !hasValidServiceCoordinates(selectedAddress);
  const { coords, loading: locationLoading } = useLocation({ enabled: shouldUseGps });
  const { width: windowWidth, cardWidth, contentPadding, contentMaxWidth, isTablet } = useResponsive();
  const tabScrollPaddingBottom = useTabContentPaddingBottom();
  const [activeCategory, setActiveCategory] = useState("All");
  const [saveAddressModalVisible, setSaveAddressModalVisible] = useState(false);
  const [pendingAddressSelection, setPendingAddressSelection] = useState<AddressPickerSelection | null>(null);
  const contentWrapperDynamic = isTablet
    ? [styles.contentWrapper, { maxWidth: contentMaxWidth, alignSelf: "center" as const, width: "100%" as const }]
    : styles.contentWrapper;

  const { categories: globalCategories, loading: categoriesLoading, error: categoriesError, reload: reloadCategories } = useGlobalCategories();

  const [addressPickerVisible, setAddressPickerVisible] = useState(false);
  const [notificationsDropdownVisible, setNotificationsDropdownVisible] = useState(false);
  const [navLeftWidth, setNavLeftWidth] = useState(0);
  const [navRightWidth, setNavRightWidth] = useState(0);

  const effectiveLat = selectedAddress?.latitude ?? coords?.latitude;
  const effectiveLng = selectedAddress?.longitude ?? coords?.longitude;

  const activeCategorySlug =
    activeCategory === "All"
      ? undefined
      : globalCategories.find((c) => c.name === activeCategory)?.slug ?? activeCategory.toLowerCase();

  /** Keeps Home / Explore centred with measured left/right header widths. */
  const navCenterInset = useMemo(() => {
    const sideReserve = Math.max(navLeftWidth, navRightWidth);
    return {
      left: contentPadding + sideReserve,
      right: contentPadding + sideReserve,
    };
  }, [contentPadding, navLeftWidth, navRightWidth]);

  const navTabPadH = windowWidth < 360 ? 6 : 10;

  const { data, loading, feedLoading, refreshing, error, refetch, silentRefetch } = useHomeData(
    effectiveLat,
    effectiveLng,
    activeCategorySlug
  );

  // When the Home tab regains focus, refresh the feed silently (no spinner,
  // no scroll reset) and skip the refresh if data was fetched very recently.
  const hasMountedRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (hasMountedRef.current) {
        silentRefetch();
      } else {
        hasMountedRef.current = true;
      }
    }, [silentRefetch])
  );

  // Tracks whether the entry animation has already played so focus-triggered
  // background refreshes don't re-animate the feed.
  const hasAnimatedRef = useRef(false);

  const adsDisclosureLabel = useMemo(
    () => (String(data?.ads_disclosure_label ?? "Sponsored").trim() || "Sponsored"),
    [data?.ads_disclosure_label],
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
        Alert.alert(
          t("customer.mobile.tabs.home.saveAddressFailed"),
          e instanceof Error ? e.message : t("customer.mobile.tabs.home.saveAddressTryAgain"),
        );
        throw e;
      }
    },
    [handleSaveAndUse, t],
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
    (shouldUseGps && locationLoading ? "Detecting location…" : coords ? "Current location" : "Select address");

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
      <NotificationsDropdown
        visible={notificationsDropdownVisible}
        onClose={() => setNotificationsDropdownVisible(false)}
      />

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

        <InstallAppBanner />

        <AnnouncementBanner />

        <IdentityVerificationBanner />

        <View style={[styles.navRow, { paddingHorizontal: contentPadding }]}>
          {/* Left: wordmark — prominent brand lockup (D1 §Customer-audit 2026-04) */}
          <View
            style={styles.navLeftGroup}
            onLayout={(e) => {
              const width = Math.ceil(e.nativeEvent.layout.width);
              if (width !== navLeftWidth) setNavLeftWidth(width);
            }}
          >
            <TouchableOpacity
              onPress={() => router.push("/(app)/(tabs)/home")}
              accessibilityRole="image"
              accessibilityLabel="Beautonomi home"
              style={{ paddingVertical: 6, paddingHorizontal: 4, marginLeft: -4, borderRadius: 12 }}
            >
              <BeautonomiWordmark size={28} showText={false} />
            </TouchableOpacity>
          </View>

          {/* Center: Home / Explore — inset so tabs never sit under the right toolbar */}
          <View style={[styles.navCenterGroup, navCenterInset]}>
            <TouchableOpacity
              style={[styles.navTab, styles.navTabActive, { paddingHorizontal: navTabPadH }]}
              accessibilityRole="button"
              accessibilityLabel="Home tab"
              accessibilityState={{ selected: true }}
            >
              <Ionicons name="home" size={20} color={Colors.primary} />
              <Text style={[styles.navTabLabel, { color: Colors.primary, fontWeight: "600" }]}>Home</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.navTab, { paddingHorizontal: navTabPadH }]}
              onPress={() => router.push("/(app)/(tabs)/explore")}
              accessibilityRole="button"
              accessibilityLabel="Explore tab"
              accessibilityHint="Navigate to the Explore feed"
              accessibilityState={{ selected: false }}
            >
              <Ionicons name="compass-outline" size={20} color={Colors.gray[500]} />
              <Text style={[styles.navTabLabelExplore, { color: Colors.gray[500], fontWeight: "500" }]}>
                Explore
              </Text>
            </TouchableOpacity>
          </View>

          {/* Right: wishlist · notifications (search is in the bottom tab bar) */}
          <View
            style={styles.navRightGroup}
            onLayout={(e) => {
              const width = Math.ceil(e.nativeEvent.layout.width);
              if (width !== navRightWidth) setNavRightWidth(width);
            }}
          >
            <TouchableOpacity
              onPress={() => {
                haptic.selection();
                router.push("/(app)/(tabs)/saved" as any);
              }}
              accessibilityRole="button"
              accessibilityLabel="Saved"
              accessibilityHint="Open saved providers, products, and posts"
              style={styles.navIconBtn}
            >
              <Ionicons name="heart-outline" size={22} color="#374151" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                haptic.selection();
                setNotificationsDropdownVisible(true);
              }}
              accessibilityRole="button"
              accessibilityLabel="Notifications"
              accessibilityHint="Show recent notifications"
              style={styles.navIconBtn}
            >
              <Ionicons name="notifications-outline" size={22} color="#374151" />
              {unreadCount > 0 ? (
                <View
                  style={{
                    position: "absolute",
                    top: 2,
                    right: 2,
                    minWidth: 16,
                    height: 16,
                    borderRadius: 8,
                    backgroundColor: Colors.primary,
                    alignItems: "center",
                    justifyContent: "center",
                    paddingHorizontal: 3,
                  }}
                >
                  <Text style={{ color: "#fff", fontSize: 9, fontWeight: "700" }}>
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
              ionIcon="apps-outline"
              onPress={() => handleCategoryPress("All")}
            />
            {categoriesLoading ? (
              <Text style={styles.categoryLoadingText}>Loading categories…</Text>
            ) : categoriesError && globalCategories.length === 0 ? (
              <View style={styles.categoryErrorRow}>
                <Text style={styles.categoryErrorText} numberOfLines={2}>
                  {categoriesError === "Failed to fetch"
                    ? "Can't load categories. Check your connection."
                    : categoriesError}
                </Text>
                <TouchableOpacity
                  onPress={() => void reloadCategories()}
                  style={styles.categoryRetryButton}
                  accessibilityRole="button"
                  accessibilityLabel="Retry loading categories"
                >
                  <Text style={styles.categoryRetryText}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : globalCategories.length === 0 ? (
              <Text style={styles.categoryLoadingText}>No categories available</Text>
            ) : (
              globalCategories.map((cat, idx) => {
                const remote = getGlobalCategoryImageUri(cat.icon ?? cat.icon_name);
                return (
                  <CategoryPill
                    key={cat.id}
                    label={cat.name}
                    active={activeCategory === cat.name}
                    imageUri={remote}
                    imagePriority={idx < 4 ? "high" : "normal"}
                    ionIcon={
                      remote
                        ? undefined
                        : (getCategoryIcon(cat.slug) as keyof typeof Ionicons.glyphMap)
                    }
                    onPress={() => handleCategoryPress(cat.name)}
                  />
                );
              })
            )}
          </ScrollView>
        </View>

        <ScrollView
          style={styles.mainScroll}
          contentContainerStyle={[styles.mainScrollContent, { paddingBottom: tabScrollPaddingBottom }]}
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
          {feedLoading ? (
            <View style={{ paddingTop: 8 }}>
              <HomeSkeleton />
            </View>
          ) : null}
          {!feedLoading && data ? (() => {
            const shouldAnimate = !hasAnimatedRef.current;
            if (shouldAnimate) hasAnimatedRef.current = true;
            const sections = (
              <View>
                <ProviderSection
                  title="Top Rated"
                  providers={data.topRated || []}
                  badge="topRated"
                  cardWidth={cardWidth}
                  contentPadding={contentPadding}
                  isFirst
                  feedOriginLat={effectiveLat}
                  feedOriginLng={effectiveLng}
                  onViewMore={() => router.push("/(app)/more-providers/top-rated")}
                />
                <ProviderSection
                  title={adsDisclosureLabel}
                  providers={data.sponsored || []}
                  badge="sponsored"
                  cardWidth={cardWidth}
                  contentPadding={contentPadding}
                  sponsoredListingLabel={adsDisclosureLabel}
                  feedOriginLat={effectiveLat}
                  feedOriginLng={effectiveLng}
                  onViewMore={() => router.push("/(app)/more-providers/sponsored")}
                />
                <ProviderSection
                  title="Nearest Providers"
                  providers={data.nearest || []}
                  badge="nearest"
                  cardWidth={cardWidth}
                  contentPadding={contentPadding}
                  feedOriginLat={effectiveLat}
                  feedOriginLng={effectiveLng}
                  onViewMore={() => router.push("/(app)/more-providers/nearest")}
                />
                <ProviderSection
                  title="Hottest Picks"
                  providers={data.hottest || []}
                  badge="hottest"
                  cardWidth={cardWidth}
                  contentPadding={contentPadding}
                  feedOriginLat={effectiveLat}
                  feedOriginLng={effectiveLng}
                  onViewMore={() => router.push("/(app)/more-providers/hottest")}
                />
                <ProviderSection
                  title="Upcoming Talent"
                  providers={data.upcoming || []}
                  badge="upcoming"
                  cardWidth={cardWidth}
                  contentPadding={contentPadding}
                  feedOriginLat={effectiveLat}
                  feedOriginLng={effectiveLng}
                  onViewMore={() => router.push("/(app)/more-providers/upcoming")}
                />
              </View>
            );
            return shouldAnimate ? (
              <FadeIn delay={100} duration={400}>{sections}</FadeIn>
            ) : sections;
          })() : null}
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
