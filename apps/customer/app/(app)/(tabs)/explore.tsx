import { useEffect, useCallback, useState, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  useWindowDimensions,
  TextInput,
  Animated,
  Keyboard,
  Platform,
} from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { useExploreFeed } from "@/features/explore/useExploreFeed";
import { useAuth } from "@/providers/AuthProvider";
import { api } from "@/lib/api-client";
import { haptic } from "@/lib/haptics";
import { MasonryList } from "@/components/MasonryList";
import type { ExplorePost } from "@/types/api";
import { SCREEN_PADDING, TAB_CONTENT_PADDING_BOTTOM } from "@/constants/layout";
import { Colors, Shadows } from "@/constants/colors";
import { Skeleton } from "@/components/Skeleton";

const COLS = 2;
const GAP = 10;

const BEAUTY_CATEGORIES = [
  { key: "all", label: "For You", icon: "sparkles" as const },
  { key: "trending", label: "Trending", icon: "trending-up" as const },
  { key: "hair", label: "Hair", icon: "cut-outline" as const },
  { key: "nails", label: "Nails", icon: "color-palette-outline" as const },
  { key: "makeup", label: "Makeup", icon: "brush-outline" as const },
  { key: "skincare", label: "Skincare", icon: "leaf-outline" as const },
  { key: "lashes", label: "Lashes", icon: "eye-outline" as const },
  { key: "barber", label: "Barber", icon: "cut-outline" as const },
  { key: "spa", label: "Spa", icon: "water-outline" as const },
  { key: "body", label: "Body", icon: "body-outline" as const },
];

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
function PinCard({
  post,
  onPress,
  cardWidth,
  onLike,
  onSave,
}: {
  post: ExplorePost;
  onPress: () => void;
  cardWidth: number;
  onLike: (post: ExplorePost) => void;
  onSave: (post: ExplorePost) => void;
}) {
  const img = post.media_urls?.[0] || "https://placehold.co/400x500/f5f5f5/999?text=Beauty";
  const aspect = getPostAspect(post);
  const imgHeight = cardWidth * aspect;
  const providerInitial = (post.provider?.business_name || "B").charAt(0).toUpperCase();
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const heartAnim = useRef(new Animated.Value(0)).current;

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

  const lastTap = useRef(0);
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
      <Pressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        accessibilityRole="button"
        accessibilityLabel={`Post by ${post.provider?.business_name || "Provider"}${post.caption ? `, ${post.caption}` : ""}`}
      >
        <View
          style={{
            borderRadius: 16,
            overflow: "hidden",
            backgroundColor: "#F3F4F6",
            ...Shadows.cardSubtle,
          }}
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

            {/* Save button (top-right) */}
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
              }}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              activeOpacity={0.7}
            >
              <Ionicons
                name={post.is_saved ? "bookmark" : "bookmark-outline"}
                size={16}
                color="#fff"
              />
            </TouchableOpacity>

            {/* Provider badge (bottom-left on image) */}
            <View
              style={{
                position: "absolute",
                bottom: 8,
                left: 8,
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
              }}
            >
              <View
                style={{
                  width: 24,
                  height: 24,
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
            <View style={{ flexDirection: "row", alignItems: "center", marginTop: post.caption ? 6 : 0, gap: 12 }}>
              <TouchableOpacity
                onPress={() => { haptic.light(); onLike(post); }}
                style={{ flexDirection: "row", alignItems: "center", gap: 3 }}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              >
                <Ionicons
                  name={post.is_liked ? "heart" : "heart-outline"}
                  size={16}
                  color={post.is_liked ? Colors.primary : "#9CA3AF"}
                />
                <Text style={{ fontSize: 12, color: post.is_liked ? Colors.primary : "#9CA3AF", fontWeight: "500" }}>
                  {post.like_count > 0 ? post.like_count : ""}
                </Text>
              </TouchableOpacity>
              {(post.comment_count ?? 0) > 0 ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                  <Ionicons name="chatbubble-outline" size={14} color="#9CA3AF" />
                  <Text style={{ fontSize: 12, color: "#9CA3AF" }}>{post.comment_count}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

/* ─── Category Chip ─── */
function CategoryChip({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: active ? "#111827" : "#F3F4F6",
        marginRight: 8,
      }}
    >
      <Ionicons name={icon} size={14} color={active ? "#fff" : "#6B7280"} />
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
        placeholder="Search looks, styles, treatments..."
        placeholderTextColor="#9CA3AF"
        value={query}
        onChangeText={onChangeQuery}
        onSubmitEditing={onSubmit}
        returnKeyType="search"
      />
      {query.length > 0 ? (
        <TouchableOpacity onPress={onClear} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close-circle" size={18} color="#9CA3AF" />
        </TouchableOpacity>
      ) : (
        <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="camera-outline" size={20} color="#9CA3AF" />
        </TouchableOpacity>
      )}
    </View>
  );
}

/* ─── Masonry Skeleton ─── */
function MasonrySkeleton({ cardWidth }: { cardWidth: number }) {
  const heights = [1.1, 0.8, 0.9, 1.3, 0.7, 1.0];
  return (
    <View style={{ flexDirection: "row", gap: GAP, paddingHorizontal: SCREEN_PADDING, paddingTop: 8 }}>
      <View style={{ flex: 1, gap: GAP }}>
        {[0, 2, 4].map((i) => (
          <View key={i} style={{ borderRadius: 16, overflow: "hidden", backgroundColor: "#F3F4F6" }}>
            <Skeleton width={cardWidth} height={cardWidth * heights[i]} borderRadius={0} />
            <View style={{ padding: 10, gap: 6 }}>
              <Skeleton width="70%" height={12} />
              <Skeleton width="40%" height={10} />
            </View>
          </View>
        ))}
      </View>
      <View style={{ flex: 1, gap: GAP }}>
        {[1, 3, 5].map((i) => (
          <View key={i} style={{ borderRadius: 16, overflow: "hidden", backgroundColor: "#F3F4F6" }}>
            <Skeleton width={cardWidth} height={cardWidth * heights[i]} borderRadius={0} />
            <View style={{ padding: 10, gap: 6 }}>
              <Skeleton width="60%" height={12} />
              <Skeleton width="50%" height={10} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

/* ─── Empty State ─── */
function EmptyState({ category }: { category: string }) {
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
        {isFiltered ? "No posts yet" : "Explore beauty inspiration"}
      </Text>
      <Text style={{ fontSize: 14, color: "#6B7280", textAlign: "center", lineHeight: 22 }}>
        {isFiltered
          ? `No posts found for this category yet. Try another or check back soon.`
          : `Discover looks, styles, and treatments from beauty professionals near you.`}
      </Text>
    </View>
  );
}

/* ═══════════════════════════════════════════
   Main Explore Screen
   ═══════════════════════════════════════════ */
export default function ExploreScreen() {
  useScreenTracking("Explore");
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const cardWidth = (width - SCREEN_PADDING * 2 - GAP) / COLS;

  const [activeCategory, setActiveCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

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
  } = useExploreFeed();

  useEffect(() => {
    initialLoad();
  }, [initialLoad]);

  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerFilterUpdate = useCallback(
    (cat: string, search: string) => {
      const sort = cat === "trending" ? ("trending" as const) : ("chronological" as const);
      const category = cat === "all" || cat === "trending" ? null : cat;
      applyFilters({ category, search: search.trim() || null, sort });
    },
    [applyFilters],
  );

  const handleLike = useCallback(
    async (post: ExplorePost) => {
      if (!user) return;
      haptic.light();
      try {
        if (post.is_liked) {
          await api.delete(`/api/explore/events?post_id=${post.id}&event_type=like`);
        } else {
          await api.post("/api/explore/events", {
            post_id: post.id,
            event_type: "like",
            idempotency_key: `like-${post.id}-${user.id}-${Date.now()}`,
          });
        }
      } catch {}
    },
    [user],
  );

  const handleSave = useCallback(
    async (post: ExplorePost) => {
      if (!user) return;
      haptic.light();
      try {
        if (post.is_saved) {
          await api.delete(`/api/explore/saved?post_id=${post.id}`);
        } else {
          await api.post("/api/explore/saved", { post_id: post.id });
        }
      } catch {}
    },
    [user],
  );

  const onPostPress = useCallback((post: ExplorePost) => {
    router.push({ pathname: "/(app)/explore-post", params: { id: post.id } });
  }, []);

  const onEndReached = useCallback(() => {
    if (hasMore && !loadingMore) loadMore();
  }, [hasMore, loadingMore, loadMore]);

  const handleCategoryPress = useCallback((key: string) => {
    haptic.selection();
    setActiveCategory(key);
    triggerFilterUpdate(key, searchQuery);
  }, [searchQuery, triggerFilterUpdate]);

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
      />
    ),
    [cardWidth, onPostPress, handleLike, handleSave],
  );

  const keyExtractor = useCallback((item: ExplorePost) => item.id, []);

  if (loading && posts.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: "#fff" }}>
        <SafeAreaView edges={["top"]} style={{ backgroundColor: "#fff" }}>
          <View style={{ paddingHorizontal: SCREEN_PADDING, paddingTop: 8 }}>
            <Text style={{ fontSize: 28, fontWeight: "800", color: "#111827", marginBottom: 16 }}>
              Explore
            </Text>
            <View
              style={{
                backgroundColor: "#F3F4F6",
                borderRadius: 14,
                height: 48,
                marginBottom: 12,
              }}
            />
            <View style={{ flexDirection: "row", gap: 8 }}>
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} width={80} height={36} borderRadius={999} />
              ))}
            </View>
          </View>
        </SafeAreaView>
        <MasonrySkeleton cardWidth={cardWidth} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#fff" }}>
      <SafeAreaView edges={["top"]} style={{ backgroundColor: "#fff" }} />

      <MasonryList
        data={posts}
        numColumns={COLS}
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
          paddingHorizontal: SCREEN_PADDING,
          paddingBottom: TAB_CONTENT_PADDING_BOTTOM,
        }}
        ListHeaderComponent={
          <View style={{ paddingTop: 4, paddingBottom: 4 }}>
            {/* Title row */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <Text style={{ fontSize: 28, fontWeight: "800", color: "#111827" }}>Explore</Text>
              <View style={{ flexDirection: "row", gap: 12 }}>
                {user ? (
                  <TouchableOpacity
                    onPress={() => router.push({ pathname: "/(app)/account-settings/wishlists" as any, params: { tab: "posts" } })}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityLabel="Saved posts"
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
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 0 }}>
                {BEAUTY_CATEGORIES.map((cat) => (
                  <CategoryChip
                    key={cat.key}
                    label={cat.label}
                    icon={cat.icon}
                    active={activeCategory === cat.key}
                    onPress={() => handleCategoryPress(cat.key)}
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
                  <Text style={{ color: "#fff", fontWeight: "600" }}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={{ paddingVertical: 24, alignItems: "center" }}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={{ fontSize: 12, color: "#9CA3AF", marginTop: 6 }}>Loading more inspiration...</Text>
            </View>
          ) : !hasMore && posts.length > 0 ? (
            <View style={{ paddingVertical: 24, alignItems: "center" }}>
              <Text style={{ fontSize: 13, color: "#9CA3AF" }}>You&apos;ve seen it all! Pull down to refresh.</Text>
            </View>
          ) : null
        }
        ListEmptyComponent={<EmptyState category={activeCategory} />}
      />
    </View>
  );
}
