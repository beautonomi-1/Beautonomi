import React, { useEffect, useCallback, useState, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Animated,
  Keyboard,
  Platform,
  Alert,
} from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { useResponsive } from "@/hooks/useResponsive";
import { useExploreFeed } from "@/features/explore/useExploreFeed";
import { useAuth } from "@/providers/AuthProvider";
import { api } from "@/lib/api-client";
import { haptic } from "@/lib/haptics";
import { pushCustomerLogin } from "@/lib/guest-browse-policy";
import { MasonryList } from "@/components/MasonryList";
import type { ExplorePost } from "@/types/api";
import { useTabContentPaddingBottom } from "@/hooks/useTabContentPaddingBottom";
import { Colors, Shadows } from "@/constants/colors";
import { Skeleton } from "@/components/Skeleton";
import { useTranslation } from "@beautonomi/i18n";
import { useSocialCapability, useSafetySettings } from "@/hooks/useSafetySettings";
import { useUserBlocks } from "@/hooks/useUserBlocks";
import { ContentReportSheet, type ContentReportTargetType } from "@/components/safety/ContentReportSheet";
import * as Clipboard from "expo-clipboard";
import { ensureForegroundLocationPermission } from "@/lib/native-permissions";
import { APP_URL } from "@/config/public-env";
import {
  copyExplorePostLink,
  isExploreVideoUrl,
  presentExplorePostShareActions,
  shareExplorePostLink,
  shareExplorePostMedia,
  type ExploreShareAction,
} from "@/lib/share-explore-post";

const GAP = 10;

const BEAUTY_CATEGORY_DEFS = [
  { key: "all", labelKey: "categoryForYou", icon: "sparkles" as const },
  { key: "trending", labelKey: "categoryTrending", icon: "trending-up" as const },
  { key: "nearby", labelKey: "categoryNearMe", icon: "location-outline" as const },
  { key: "hair", labelKey: "categoryHair", icon: "cut-outline" as const },
  { key: "nails", labelKey: "categoryNails", icon: "color-palette-outline" as const },
  { key: "makeup", labelKey: "categoryMakeup", icon: "brush-outline" as const },
  { key: "skincare", labelKey: "categorySkincare", icon: "leaf-outline" as const },
  { key: "lashes", labelKey: "categoryLashes", icon: "eye-outline" as const },
  { key: "barber", labelKey: "categoryBarber", icon: "cut-outline" as const },
  { key: "spa", labelKey: "categorySpa", icon: "water-outline" as const },
  { key: "body", labelKey: "categoryBody", icon: "body-outline" as const },
] as const;

function hashCode(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

const ASPECT_RATIOS = [0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3];

function getPostAspect(post: ExplorePost): number {
  return ASPECT_RATIOS[hashCode(post.id) % ASPECT_RATIOS.length];
}

/* ─── Pinterest-style Post Card ─── */
const PinCard = React.memo(function PinCard({
  post,
  onPress,
  cardWidth,
  onLike,
  onSave,
  onShare,
  onMore,
}: {
  post: ExplorePost;
  onPress: () => void;
  cardWidth: number;
  onLike: (post: ExplorePost) => void;
  onSave: (post: ExplorePost) => void;
  onShare: (post: ExplorePost) => void;
  onMore?: (post: ExplorePost) => void;
}) {
  const { t } = useTranslation();
  const img = post.media_urls?.[0] || "https://placehold.co/400x500/f5f5f5/999?text=Beauty";
  const isVideo = isExploreVideoUrl(img);
  const aspect = getPostAspect(post);
  const imgHeight = cardWidth * aspect;
  const providerInitial = (post.provider?.business_name || "B").charAt(0).toUpperCase();
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const heartAnim = useRef(new Animated.Value(0)).current;
  const lastTap = useRef(0);

  const useNativeDriver = Platform.OS !== "web";
  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.97,
      useNativeDriver,
      speed: 50,
      bounciness: 4,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver,
      speed: 50,
      bounciness: 4,
    }).start();
  };

  const handleDoubleTap = useCallback(() => {
    if (!post.is_liked) {
      onLike(post);
      Animated.sequence([
        Animated.spring(heartAnim, { toValue: 1, useNativeDriver, speed: 20, bounciness: 12 }),
        Animated.timing(heartAnim, { toValue: 0, duration: 600, useNativeDriver, delay: 400 }),
      ]).start();
    }
  }, [post, onLike, heartAnim, useNativeDriver]);

  const handlePress = useCallback(() => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      handleDoubleTap();
    } else {
      setTimeout(() => {
        if (Date.now() - lastTap.current >= 280) {
          onPress();
        }
      }, 300);
    }
    lastTap.current = now;
  }, [onPress, handleDoubleTap]);

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <View
        style={{
          borderRadius: 16,
          overflow: "hidden",
          backgroundColor: "#F3F4F6",
          ...Shadows.cardSubtle,
        }}
      >
        <Pressable
          onPress={handlePress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          accessibilityRole="button"
          accessibilityLabel={`Post by ${post.provider?.business_name || "Provider"}${post.caption ? `, ${post.caption}` : ""}`}
          style={{ width: cardWidth }}
        >
          {/* Image */}
          <View style={{ width: cardWidth, height: imgHeight }}>
            <Image
              source={{ uri: img }}
              style={{ width: cardWidth, height: imgHeight }}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={200}
            />

            {isVideo ? (
              <View
                style={{
                  position: "absolute",
                  top: 8,
                  left: 8,
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: "rgba(0,0,0,0.45)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="play" size={14} color="#fff" />
              </View>
            ) : null}

            {/* Double-tap heart animation */}
            <Animated.View
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                alignItems: "center",
                justifyContent: "center",
                opacity: heartAnim,
                transform: [{ scale: heartAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.2] }) }],
                pointerEvents: "none",
              }}
            >
              <Ionicons name="heart" size={56} color="#fff" />
            </Animated.View>

            {/* Gradient overlay at bottom of image */}
            <LinearGradient
              colors={["transparent", "rgba(0,0,0,0.45)"]}
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                height: imgHeight * 0.4,
              }}
            />

            {/* Provider badge (bottom-left on image) */}
            <View
              style={{
                position: "absolute",
                bottom: 8,
                left: 8,
                flexDirection: "row",
                alignItems: "center",
              }}
              pointerEvents="none"
            >
              <View
                style={{
                  width: 24,
                  height: 24,
                  marginRight: 6,
                  borderRadius: 12,
                  backgroundColor: Colors.primary,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 1.5,
                  borderColor: "rgba(255,255,255,0.8)",
                }}
              >
                <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>
                  {providerInitial}
                </Text>
              </View>
              <Text
                style={{
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: "600",
                  textShadowColor: "rgba(0,0,0,0.5)",
                  textShadowOffset: { width: 0, height: 1 },
                  textShadowRadius: 3,
                }}
                numberOfLines={1}
              >
                {post.provider?.business_name || "Provider"}
              </Text>
            </View>
          </View>

          {/* Content below image */}
          <View style={{ padding: 10 }}>
            {post.caption ? (
              <Text
                style={{ fontSize: 13, color: "#111827", lineHeight: 18, fontWeight: "500" }}
                numberOfLines={2}
              >
                {post.caption}
              </Text>
            ) : null}

            {/* Engagement row */}
            <View style={{ flexDirection: "row", alignItems: "center", marginTop: post.caption ? 6 : 0 }}>
              <TouchableOpacity
                onPress={() => { haptic.light(); onLike(post); }}
                style={{ flexDirection: "row", alignItems: "center", marginRight: 12 }}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              >
                <Ionicons
                  name={post.is_liked ? "heart" : "heart-outline"}
                  size={16}
                  color={post.is_liked ? Colors.primary : "#9CA3AF"}
                  style={{ marginRight: 3 }}
                />
                <Text style={{ fontSize: 12, color: post.is_liked ? Colors.primary : "#9CA3AF", fontWeight: "500" }}>
                  {post.like_count > 0 ? post.like_count : ""}
                </Text>
              </TouchableOpacity>
              {(post.comment_count ?? 0) > 0 ? (
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Ionicons name="chatbubble-outline" size={14} color="#9CA3AF" style={{ marginRight: 3 }} />
                  <Text style={{ fontSize: 12, color: "#9CA3AF" }}>{post.comment_count}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </Pressable>

        {/* Share + save + more — outside Pressable so taps don't navigate */}
        {onMore ? (
          <TouchableOpacity
            onPress={() => { haptic.light(); onMore(post); }}
            style={{
              position: "absolute",
              top: 8,
              left: 8,
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: "rgba(0,0,0,0.35)",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 10,
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
            accessibilityLabel={t("customer.explorePost.moreOptions")}
            accessibilityRole="button"
          >
            <Ionicons name="ellipsis-horizontal" size={16} color="#fff" />
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          onPress={() => { haptic.light(); onShare(post); }}
          style={{
            position: "absolute",
            top: 8,
            right: 48,
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: "rgba(0,0,0,0.35)",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10,
          }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.7}
          accessibilityLabel={t("customer.explorePost.share")}
          accessibilityRole="button"
        >
          <Ionicons name="paper-plane-outline" size={16} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => { haptic.light(); onSave(post); }}
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: post.is_saved ? Colors.primary : "rgba(0,0,0,0.35)",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10,
          }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.7}
          accessibilityLabel={post.is_saved ? "Unsave post" : "Save post"}
          accessibilityRole="button"
        >
          <Ionicons
            name={post.is_saved ? "bookmark" : "bookmark-outline"}
            size={16}
            color="#fff"
          />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
});

/* ─── Category Chip ─── */
function CategoryChip({
  label,
  icon,
  active,
  onPress,
  disabled,
  loading,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  active: boolean;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: active ? "#111827" : "#F3F4F6",
        marginRight: 8,
        opacity: disabled ? 0.6 : 1,
      }}
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Ionicons name={icon} size={14} color={active ? "#fff" : "#6B7280"} style={{ marginRight: 5 }} />
      <Text style={{ fontSize: 13, fontWeight: "600", color: active ? "#fff" : "#374151" }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

/* ─── Search Bar ─── */
function ExploreSearchBar({
  query,
  onChangeQuery,
  onSubmit,
  onClear,
}: {
  query: string;
  onChangeQuery: (t: string) => void;
  onSubmit: () => void;
  onClear: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#F3F4F6",
        borderRadius: 14,
        paddingHorizontal: 14,
        marginBottom: 12,
      }}
    >
      <Ionicons name="search-outline" size={18} color="#9CA3AF" />
      <TextInput
        style={{
          flex: 1,
          paddingVertical: Platform.OS === "ios" ? 12 : 10,
          paddingHorizontal: 10,
          fontSize: 15,
          color: "#111827",
        }}
        placeholder={t("customer.mobile.tabs.explore.searchPlaceholder")}
        placeholderTextColor="#9CA3AF"
        value={query}
        onChangeText={onChangeQuery}
        onSubmitEditing={onSubmit}
        returnKeyType="search"
        accessibilityLabel={t("customer.mobile.tabs.explore.searchAccessibilityLabel")}
        accessibilityRole="search"
      />
      {query.length > 0 ? (
        <TouchableOpacity onPress={onClear} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close-circle" size={18} color="#9CA3AF" />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

/* ─── Masonry Skeleton ─── */
function MasonrySkeleton({
  cardWidth,
  contentPadding,
}: {
  cardWidth: number;
  contentPadding: number;
}) {
  const heights = [1.1, 0.8, 0.9, 1.3, 0.7, 1.0];
  return (
    <View style={{ flexDirection: "row", paddingHorizontal: contentPadding, paddingTop: 8 }}>
      <View style={{ flex: 1, marginRight: GAP }}>
        {[0, 2, 4].map((i) => (
          <View key={i} style={{ borderRadius: 16, overflow: "hidden", backgroundColor: "#F3F4F6", marginBottom: i < 4 ? GAP : 0 }}>
            <Skeleton width={cardWidth} height={cardWidth * heights[i]} borderRadius={0} />
            <View style={{ padding: 10 }}>
              <Skeleton width="70%" height={12} />
              <Skeleton width="40%" height={10} style={{ marginTop: 6 }} />
            </View>
          </View>
        ))}
      </View>
      <View style={{ flex: 1 }}>
        {[1, 3, 5].map((i) => (
          <View key={i} style={{ borderRadius: 16, overflow: "hidden", backgroundColor: "#F3F4F6", marginBottom: i < 5 ? GAP : 0 }}>
            <Skeleton width={cardWidth} height={cardWidth * heights[i]} borderRadius={0} />
            <View style={{ padding: 10 }}>
              <Skeleton width="60%" height={12} />
              <Skeleton width="50%" height={10} style={{ marginTop: 6 }} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

/* ─── Empty State ─── */
function EmptyState({ category, hideSocialFeed }: { category: string; hideSocialFeed?: boolean }) {
  const { t } = useTranslation();
  if (hideSocialFeed) {
    return (
      <View style={{ paddingVertical: 60, alignItems: "center", paddingHorizontal: 32 }}>
        <View
          style={{
            width: 80,
            height: 80,
            borderRadius: 40,
            backgroundColor: Colors.gray[100],
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 20,
          }}
        >
          <Ionicons name="eye-off-outline" size={36} color={Colors.gray[500]} />
        </View>
        <Text style={{ fontSize: 18, fontWeight: "700", color: "#111827", marginBottom: 8, textAlign: "center" }}>
          {t("customer.mobile.tabs.explore.socialFeedHiddenTitle")}
        </Text>
        <Text style={{ fontSize: 14, color: "#6B7280", textAlign: "center", lineHeight: 22, marginBottom: 20 }}>
          {t("customer.mobile.tabs.explore.socialFeedHiddenBody")}
        </Text>
        <TouchableOpacity
          onPress={() => router.push("/(app)/account-settings/content-and-safety-controls")}
          style={{
            backgroundColor: Colors.primary,
            paddingHorizontal: 20,
            paddingVertical: 12,
            borderRadius: 12,
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "600" }}>{t("customer.accountSettings.contentSafetyTitle")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isFiltered = category !== "all";
  return (
    <View style={{ paddingVertical: 60, alignItems: "center", paddingHorizontal: 32 }}>
      <View
        style={{
          width: 80,
          height: 80,
          borderRadius: 40,
          backgroundColor: "rgba(255,0,119,0.06)",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 20,
        }}
      >
        <Ionicons
          name={isFiltered ? "search-outline" : "sparkles-outline"}
          size={36}
          color={Colors.primary}
        />
      </View>
      <Text style={{ fontSize: 18, fontWeight: "700", color: "#111827", marginBottom: 8, textAlign: "center" }}>
        {isFiltered
          ? t("customer.mobile.tabs.explore.emptyFilteredTitle")
          : t("customer.mobile.tabs.explore.emptyDefaultTitle")}
      </Text>
      <Text style={{ fontSize: 14, color: "#6B7280", textAlign: "center", lineHeight: 22 }}>
        {isFiltered
          ? t("customer.mobile.tabs.explore.emptyFilteredBody")
          : t("customer.mobile.tabs.explore.emptyDefaultBody")}
      </Text>
    </View>
  );
}

/* ═══════════════════════════════════════════
   Main Explore Screen
   ═══════════════════════════════════════════ */
export default function ExploreScreen() {
  useScreenTracking("Explore");
  const { t } = useTranslation();
  const tx = useCallback((key: string) => t(`customer.mobile.tabs.explore.${key}`), [t]);
  const { user } = useAuth();
  const { confirmBlockUser } = useUserBlocks();
  const { settings: safetySettings } = useSafetySettings();
  const socialInteractions = useSocialCapability("like_or_save");
  const hideSocialFeed = Boolean(user && safetySettings.hide_social_feed);
  const [reportTarget, setReportTarget] = useState<{
    type: ContentReportTargetType;
    id: string;
    title?: string;
  } | null>(null);
  const { width, columns, contentPadding, contentMaxWidth, isTablet } = useResponsive();
  const tabScrollPaddingBottom = useTabContentPaddingBottom();
  const contentWidth = Math.min(width, contentMaxWidth) - contentPadding * 2;
  const cardWidth = (contentWidth - (columns - 1) * GAP) / columns;
  const contentContainerStyle = isTablet
    ? { maxWidth: contentMaxWidth, alignSelf: "center" as const, width: "100%" as const }
    : {};

  const [activeCategory, setActiveCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [nearbyLoading, setNearbyLoading] = useState(false);

  const {
    posts,
    loading,
    refreshing,
    loadingMore,
    error,
    hasMore,
    refetch,
    loadMore,
    initialLoad,
    applyFilters,
    setPostSaved,
    setPostLiked,
    removePost,
  } = useExploreFeed();

  useEffect(() => {
    initialLoad();
  }, [initialLoad]);

  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerFilterUpdate = useCallback(
    (cat: string, search: string, nearMeCoords?: { lat: number; lng: number } | null) => {
      if (cat === "nearby" && nearMeCoords) {
        applyFilters({
          category: null,
          search: search.trim() || null,
          sort: "nearby",
          lat: nearMeCoords.lat,
          lng: nearMeCoords.lng,
          radius_km: 50,
        });
        return;
      }
      const sort: "chronological" | "trending" | "for_you" =
        cat === "trending"
          ? "trending"
          : cat === "all" && user
            ? "for_you"
            : "chronological";
      const category = cat === "all" || cat === "trending" || cat === "nearby" ? null : cat;
      applyFilters({
        category,
        search: search.trim() || null,
        sort,
      });
    },
    [applyFilters, user],
  );

  const handleLike = useCallback(
    async (post: ExplorePost) => {
      if (!user) {
        pushCustomerLogin(`/(app)/explore-post?id=${encodeURIComponent(post.id)}`);
        return;
      }
      if (!socialInteractions.allowed) {
        Alert.alert(t("customer.accountSettings.contentSafetyTitle"), t("customer.mobile.tabs.explore.socialInteractionsOff"));
        return;
      }
      haptic.light();
      const wasLiked = Boolean(post.is_liked);
      setPostLiked(post.id, !wasLiked, wasLiked ? -1 : 1);
      try {
        const res = wasLiked
          ? await api.delete(`/api/explore/events?post_id=${post.id}&event_type=like`)
          : await api.post("/api/explore/events", {
              post_id: post.id,
              event_type: "like",
              idempotency_key: `like-${post.id}-${user.id}-${Date.now()}`,
            });
        if (res.error) {
          setPostLiked(post.id, wasLiked, wasLiked ? 1 : -1);
        }
      } catch {
        setPostLiked(post.id, wasLiked, wasLiked ? 1 : -1);
      }
    },
    [user, setPostLiked, socialInteractions.allowed, t],
  );

  const handleSave = useCallback(
    async (post: ExplorePost) => {
      if (!user) {
        pushCustomerLogin(`/(app)/explore-post?id=${encodeURIComponent(post.id)}`);
        return;
      }
      if (!socialInteractions.allowed) {
        Alert.alert(t("customer.accountSettings.contentSafetyTitle"), t("customer.mobile.tabs.explore.socialInteractionsOff"));
        return;
      }
      haptic.light();
      const previous = post.is_saved;
      setPostSaved(post.id, !previous);
      try {
        const res = previous
          ? await api.delete(`/api/explore/saved?post_id=${post.id}`)
          : await api.post("/api/explore/saved", { post_id: post.id });
        if (res.error) {
          setPostSaved(post.id, !!previous);
        }
      } catch {
        setPostSaved(post.id, !!previous);
      }
    },
    [user, setPostSaved, socialInteractions.allowed, t],
  );

  const handleShare = useCallback(
    async (post: ExplorePost, action: ExploreShareAction) => {
      const input = {
        postId: post.id,
        caption: post.caption,
        providerName: post.provider?.business_name || "Beautonomi",
        providerSlug: post.provider?.slug,
        mediaUrls: post.media_urls,
        webBaseUrl: APP_URL,
        mediaIndex: 0,
      };
      if (action === "link") {
        await shareExplorePostLink(input);
      } else if (action === "media") {
        await shareExplorePostMedia(input);
      } else if (action === "copy") {
        await copyExplorePostLink(input);
        Alert.alert(t("customer.explorePost.linkCopied"));
      }
    },
    [t],
  );

  const openShareSheet = useCallback(
    (post: ExplorePost) => {
      void presentExplorePostShareActions(
        {
          postId: post.id,
          caption: post.caption,
          providerName: post.provider?.business_name || "Beautonomi",
          providerSlug: post.provider?.slug,
          mediaUrls: post.media_urls,
          webBaseUrl: APP_URL,
          mediaIndex: 0,
        },
        {
          sheetTitle: t("customer.explorePost.shareSheetTitle"),
          shareLink: t("customer.explorePost.shareLink"),
          shareMedia: t("customer.explorePost.sharePhoto"),
          shareMediaVideo: t("customer.explorePost.shareVideo"),
          copyLink: t("customer.explorePost.copyLink"),
          cancel: t("common.cancel"),
        },
        (action) => handleShare(post, action),
      );
    },
    [handleShare, t],
  );

  const openContentReport = useCallback(
    (type: ContentReportTargetType, targetId: string, title?: string) => {
      if (!user) {
        Alert.alert(
          t("customer.contentReport.signInTitle"),
          t("customer.contentReport.signInBody"),
          [
            { text: t("common.cancel"), style: "cancel" },
            { text: t("auth.login"), onPress: () => pushCustomerLogin(`/(app)/explore-post?id=${encodeURIComponent(targetId)}`) },
          ],
        );
        return;
      }
      setReportTarget({ type, id: targetId, title });
    },
    [t, user],
  );

  const showPostActions = useCallback(
    (post: ExplorePost) => {
      const postUrl = `${APP_URL}/explore/${post.id}`;
      const actions: Array<{ text: string; onPress?: () => void; style?: "cancel" | "destructive" }> = [
        {
          text: t("common.share"),
          onPress: () => openShareSheet(post),
        },
        {
          text: t("customer.explorePost.copyLink"),
          onPress: async () => {
            await Clipboard.setStringAsync(postUrl);
            haptic.light();
            Alert.alert(t("customer.explorePost.linkCopied"));
          },
        },
      ];
      if (user && post.id) {
        actions.push({
          text: t("customer.contentReport.reportPost"),
          style: "destructive",
          onPress: () => openContentReport("explore_post", post.id, t("customer.contentReport.reportPost")),
        });
      }
      if (user && post.provider_id) {
        actions.push({
          text: t("customer.blockUser.confirmAction"),
          style: "destructive",
          onPress: () =>
            confirmBlockUser({
              providerId: post.provider_id,
              displayName: post.provider?.business_name,
              onBlocked: () => removePost(post.id),
            }),
        });
      }
      actions.push({ text: t("common.cancel"), style: "cancel" });
      Alert.alert(t("customer.explorePost.moreOptions"), undefined, actions);
    },
    [confirmBlockUser, openContentReport, openShareSheet, removePost, t, user],
  );

  const onPostPress = useCallback((post: ExplorePost) => {
    router.push({ pathname: "/(app)/explore-post", params: { id: post.id } });
  }, []);

  const onEndReached = useCallback(() => {
    if (hasMore && !loadingMore) loadMore();
  }, [hasMore, loadingMore, loadMore]);

  const handleCategoryPress = useCallback(
    async (key: string) => {
      haptic.selection();
      if (key === "nearby") {
        setNearbyLoading(true);
        try {
          const { getCurrentPositionAsync } = await import("expo-location");
          const allowed = await ensureForegroundLocationPermission({
            title: tx("locationUnavailableTitle"),
            message: tx("locationUnavailableBodySettings"),
          });
          if (!allowed) {
            const res = await api.get<{ data?: { latitude?: number; longitude?: number } }>("/api/public/ip-geolocation");
            if (res.error) {
              Alert.alert(tx("locationUnavailableTitle"), tx("locationUnavailableBody"));
              return;
            }
            const d = (res as any)?.data ?? res?.data;
            if (d?.latitude != null && d?.longitude != null) {
              setActiveCategory("nearby");
              triggerFilterUpdate("nearby", searchQuery, { lat: Number(d.latitude), lng: Number(d.longitude) });
            } else {
              Alert.alert(tx("locationUnavailableTitle"), tx("locationUnavailableBodySettings"));
            }
          } else {
            const loc = await getCurrentPositionAsync({});
            setActiveCategory("nearby");
            triggerFilterUpdate("nearby", searchQuery, {
              lat: loc.coords.latitude,
              lng: loc.coords.longitude,
            });
          }
        } catch {
          // keep current category
        } finally {
          setNearbyLoading(false);
        }
        return;
      }
      setActiveCategory(key);
      triggerFilterUpdate(key, searchQuery);
    },
    [searchQuery, triggerFilterUpdate, tx],
  );

  const handleSearchChange = useCallback(
    (text: string) => {
      setSearchQuery(text);
      if (searchDebounce.current) clearTimeout(searchDebounce.current);
      searchDebounce.current = setTimeout(() => {
        triggerFilterUpdate(activeCategory, text);
      }, 500);
    },
    [activeCategory, triggerFilterUpdate],
  );

  const handleSearchSubmit = useCallback(() => {
    Keyboard.dismiss();
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    triggerFilterUpdate(activeCategory, searchQuery);
  }, [activeCategory, searchQuery, triggerFilterUpdate]);

  const handleSearchClear = useCallback(() => {
    setSearchQuery("");
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    triggerFilterUpdate(activeCategory, "");
  }, [activeCategory, triggerFilterUpdate]);

  const getItemHeight = useCallback(
    (item: ExplorePost, colWidth: number) => {
      const aspect = getPostAspect(item);
      const imgH = colWidth * aspect;
      const textH = item.caption ? 62 : 36;
      return imgH + textH;
    },
    [],
  );

  const renderItem = useCallback(
    (item: ExplorePost) => (
      <PinCard
        post={item}
        onPress={() => onPostPress(item)}
        cardWidth={cardWidth}
        onLike={handleLike}
        onSave={handleSave}
        onShare={openShareSheet}
        onMore={user ? showPostActions : undefined}
      />
    ),
    [cardWidth, onPostPress, handleLike, handleSave, openShareSheet, showPostActions, user],
  );

  const keyExtractor = useCallback((item: ExplorePost) => item.id, []);

  const showInitialSkeleton = loading && posts.length === 0;

  return (
    <View style={{ flex: 1, backgroundColor: "#fff" }}>
      {showInitialSkeleton ? (
        <>
          <SafeAreaView
            edges={["top"]}
            style={[contentContainerStyle, { backgroundColor: "#fff" }]}
            accessibilityLabel={tx("feedA11y")}
            accessibilityRole="none"
          >
            <View style={{ paddingHorizontal: contentPadding, paddingTop: 8 }}>
              <Text style={{ fontSize: 28, fontWeight: "800", color: "#111827", marginBottom: 16 }}>{tx("screenTitle")}</Text>
              <View
                style={{
                  backgroundColor: "#F3F4F6",
                  borderRadius: 14,
                  height: 48,
                  marginBottom: 12,
                }}
              />
              <View style={{ flexDirection: "row" }}>
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} width={80} height={36} borderRadius={999} style={i < 4 ? { marginRight: 8 } : undefined} />
                ))}
              </View>
            </View>
          </SafeAreaView>
          <MasonrySkeleton cardWidth={cardWidth} contentPadding={contentPadding} />
        </>
      ) : (
        <>
          <SafeAreaView edges={["top"]} style={{ backgroundColor: "#fff" }} />

          <View style={[{ flex: 1 }, contentContainerStyle]}>
            <MasonryList
              data={posts}
              extraData={{
                category: activeCategory,
                userId: user?.id ?? null,
                search: searchQuery,
              }}
              numColumns={columns}
              gap={GAP}
              columnWidth={cardWidth}
              renderItem={renderItem}
              keyExtractor={keyExtractor}
              getItemHeight={getItemHeight}
              onEndReached={onEndReached}
              onEndReachedThreshold={0.4}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={refetch} tintColor={Colors.primary} />
              }
              contentContainerStyle={{
                paddingHorizontal: contentPadding,
                paddingBottom: tabScrollPaddingBottom,
              }}
              ListHeaderComponent={
                <View style={{ paddingTop: 4, paddingBottom: 4 }}>
                  {/* Title row */}
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                    <Text style={{ fontSize: 28, fontWeight: "800", color: "#111827" }}>{tx("screenTitle")}</Text>
                    <View style={{ flexDirection: "row" }}>
                      {user ? (
                        <TouchableOpacity
                          onPress={() => router.push({ pathname: "/(app)/account-settings/wishlists" as any, params: { tab: "posts" } })}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          accessibilityLabel={tx("savedPostsA11y")}
                        >
                          <Ionicons name="bookmark-outline" size={24} color="#374151" />
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>

                  {/* Search */}
                  <ExploreSearchBar
                    query={searchQuery}
                    onChangeQuery={handleSearchChange}
                    onSubmit={handleSearchSubmit}
                    onClear={handleSearchClear}
                  />

                  {/* Category chips */}
                  <View style={{ marginBottom: 14 }}>
                    <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                      {BEAUTY_CATEGORY_DEFS.map((cat) => (
                        <CategoryChip
                          key={cat.key}
                          label={cat.key === "nearby" && nearbyLoading ? "…" : tx(cat.labelKey)}
                          icon={cat.icon}
                          active={activeCategory === cat.key}
                          onPress={() => handleCategoryPress(cat.key)}
                          disabled={cat.key === "nearby" && nearbyLoading}
                          loading={cat.key === "nearby" && nearbyLoading}
                        />
                      ))}
                    </View>
                  </View>

                  {/* Error */}
                  {error ? (
                    <View
                      style={{
                        backgroundColor: "#FEF2F2",
                        borderWidth: 1,
                        borderColor: "#FECACA",
                        borderRadius: 12,
                        padding: 14,
                        marginBottom: 12,
                      }}
                    >
                      <Text style={{ color: "#B91C1C", fontSize: 14, marginBottom: 8 }}>{error}</Text>
                      <TouchableOpacity
                        onPress={refetch}
                        style={{
                          backgroundColor: Colors.primary,
                          borderRadius: 10,
                          paddingVertical: 10,
                          alignItems: "center",
                        }}
                      >
                        <Text style={{ color: "#fff", fontWeight: "600" }}>{tx("retry")}</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>
              }
              ListFooterComponent={
                loadingMore ? (
                  <View style={{ paddingVertical: 24, alignItems: "center" }}>
                    <ActivityIndicator size="small" color={Colors.primary} />
                    <Text style={{ fontSize: 12, color: "#9CA3AF", marginTop: 6 }}>{tx("loadingMore")}</Text>
                  </View>
                ) : !hasMore && posts.length > 0 ? (
                  <View style={{ paddingVertical: 24, alignItems: "center" }}>
                    <Text style={{ fontSize: 13, color: "#9CA3AF" }}>{tx("endOfFeed")}</Text>
                  </View>
                ) : null
              }
              ListEmptyComponent={<EmptyState category={activeCategory} hideSocialFeed={hideSocialFeed} />}
            />
          </View>
        </>
      )}
      {reportTarget ? (
        <ContentReportSheet
          visible
          onClose={() => setReportTarget(null)}
          targetType={reportTarget.type}
          targetId={reportTarget.id}
          title={reportTarget.title}
        />
      ) : null}
    </View>
  );
}
