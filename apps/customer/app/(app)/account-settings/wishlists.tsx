import { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  FlatList,
  Platform,
} from "react-native";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/lib/api-client";
import { ScreenFrame } from "@/components/ScreenFrame";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { useResponsive } from "@/hooks/useResponsive";
import { Colors } from "@/constants/colors";

type Tab = "providers" | "posts";

const COLUMN_GAP = 8;
const COL_COUNT = 2;

export default function WishlistsScreen() {
  useScreenTracking("Wishlists");
  const params = useLocalSearchParams<{ tab?: string }>();
  const { width, contentPadding, contentMaxWidth, isTablet } = useResponsive();
  const constraint = (isTablet || Platform.OS === "web") ? { maxWidth: contentMaxWidth, alignSelf: "center" as const, width: "100%" as const } : {};
  const contentWidth = Math.min(width, contentMaxWidth) - contentPadding * 2;
  const TILE_WIDTH = (contentWidth - COLUMN_GAP * (COL_COUNT - 1)) / COL_COUNT;
  const [activeTab, setActiveTab] = useState<Tab>(
    params.tab === "posts" ? "posts" : "providers"
  );

  const [saved, setSaved] = useState<any[]>([]);
  const [recentlyViewed, setRecentlyViewed] = useState<any[]>([]);
  const [savedPosts, setSavedPosts] = useState<any[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [postsLoading, setPostsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProviders = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const [savedRes, recentRes] = await Promise.all([
        api.get<any>("/api/me/wishlists/providers"),
        api.get<any>("/api/me/recently-viewed"),
      ]);
      if (savedRes.error) setError(savedRes.error.message || "Failed to load");
      else {
        const s = savedRes.data;
        setSaved(Array.isArray(s) ? s : s?.data ?? []);
      }
      const r = recentRes.data;
      setRecentlyViewed(Array.isArray(r) ? r : r?.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadSavedPosts = async (cursor?: string, isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
      setSavedPosts([]);
      setNextCursor(undefined);
    } else if (!cursor) {
      setPostsLoading(true);
    }
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "20" });
      if (cursor) params.set("cursor", cursor);
      const res = await api.get<any>(`/api/explore/saved?${params}`);
      if (res.error) {
        setError(res.error.message || "Failed to load saved posts");
      } else {
        const d = res.data;
        const posts = d?.data ?? [];
        if (cursor) {
          setSavedPosts((prev) => [...prev, ...posts]);
        } else {
          setSavedPosts(posts);
        }
        setNextCursor(d?.next_cursor);
        setHasMore(d?.has_more ?? false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setPostsLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (activeTab === "providers") {
      loadProviders();
    } else {
      loadSavedPosts();
    }
  }, [activeTab]);

  const handleRefresh = () => {
    if (activeTab === "providers") loadProviders(true);
    else loadSavedPosts(undefined, true);
  };

  const handleUnsave = async (postId: string) => {
    setSavedPosts((prev) => prev.filter((p) => p.id !== postId));
    try {
      await api.delete(`/api/explore/saved?post_id=${postId}`);
    } catch {}
  };

  const handleLoadMore = () => {
    if (hasMore && nextCursor && !postsLoading) {
      loadSavedPosts(nextCursor);
    }
  };

  const isEmpty =
    activeTab === "providers"
      ? saved.length === 0 && recentlyViewed.length === 0
      : savedPosts.length === 0;

  const emptyTitle =
    activeTab === "providers"
      ? "No saved or recently viewed providers"
      : "No saved posts yet";
  const emptySubtitle =
    activeTab === "posts"
      ? "Bookmark posts from Explore to see them here"
      : undefined;

  return (
    <ScreenFrame
      loading={loading || postsLoading}
      error={error}
      onRetry={handleRefresh}
      empty={{ title: emptyTitle, message: emptySubtitle }}
      isEmpty={isEmpty && !loading && !postsLoading}
    >
      {/* Tab bar */}
      <View
        style={{
          flexDirection: "row",
          borderBottomWidth: 1,
          borderBottomColor: "#e5e7eb",
          backgroundColor: "#fff",
        }}
      >
        <TabButton
          label="Providers"
          icon="heart-outline"
          active={activeTab === "providers"}
          onPress={() => setActiveTab("providers")}
        />
        <TabButton
          label="Saved Posts"
          icon="bookmark-outline"
          active={activeTab === "posts"}
          onPress={() => setActiveTab("posts")}
        />
      </View>

      {activeTab === "providers" ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: contentPadding, paddingBottom: 48, ...constraint }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={Colors.primary}
            />
          }
        >
          {saved.length > 0 && (
            <View style={{ marginBottom: 24 }}>
              <Text style={{ fontSize: 18, fontWeight: "600", color: Colors.gray[900], marginBottom: 12 }}>
                Saved providers
              </Text>
              <View>
                {saved.map((p: any, index: number) => (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() =>
                      p.slug &&
                      router.push({
                        pathname: "/(app)/partner-profile",
                        params: { slug: p.slug },
                      })
                    }
                    style={{ flexDirection: "row", alignItems: "center", backgroundColor: Colors.gray[50], borderRadius: 12, padding: 16, marginTop: index === 0 ? 0 : 12 }}
                  >
                    {(p.avatar_url || p.thumbnail_url) ? (
                      <Image
                        source={{ uri: p.avatar_url || p.thumbnail_url }}
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: 8,
                          marginRight: 12,
                        }}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                        transition={200}
                      />
                    ) : (
                      <View
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: 8,
                          marginRight: 12,
                          backgroundColor: "#f3f4f6",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Ionicons name="storefront-outline" size={20} color="#9ca3af" />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: "500", color: Colors.gray[900] }}>
                        {p.business_name}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={Colors.gray[400]} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
          {recentlyViewed.length > 0 && (
            <View>
              <Text style={{ fontSize: 18, fontWeight: "600", color: Colors.gray[900], marginBottom: 12 }}>
                Recently viewed
              </Text>
              <View>
                {recentlyViewed.map((p: any, idx: number) => (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() =>
                      p.slug &&
                      router.push({
                        pathname: "/(app)/partner-profile",
                        params: { slug: p.slug },
                      })
                    }
                    style={[{ flexDirection: "row", alignItems: "center", backgroundColor: Colors.gray[50], borderRadius: 12, padding: 16 }, idx > 0 && { marginTop: 12 }]}
                  >
                    {(p.avatar_url || p.thumbnail_url) ? (
                      <Image
                        source={{ uri: p.avatar_url || p.thumbnail_url }}
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: 8,
                          marginRight: 12,
                        }}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                        transition={200}
                      />
                    ) : (
                      <View
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: 8,
                          marginRight: 12,
                          backgroundColor: "#f3f4f6",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Ionicons name="storefront-outline" size={20} color="#9ca3af" />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: "500", color: Colors.gray[900] }}>
                        {p.business_name}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={Colors.gray[400]} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      ) : (
        <FlatList
          data={savedPosts}
          keyExtractor={(item) => item.id}
          numColumns={COL_COUNT}
          contentContainerStyle={{ padding: contentPadding, paddingBottom: 48, ...constraint }}
          columnWrapperStyle={{ marginBottom: COLUMN_GAP }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={Colors.primary}
            />
          }
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.4}
          renderItem={({ item, index }) => (
            <View style={{ marginRight: index % 2 === 0 ? COLUMN_GAP : 0 }}>
              <SavedPostTile post={item} onUnsave={handleUnsave} tileWidth={TILE_WIDTH} />
            </View>
          )}
        />
      )}
    </ScreenFrame>
  );
}

function TabButton({
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
      style={{
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 12,
        borderBottomWidth: 2,
        borderBottomColor: active ? Colors.primary : "transparent",
      }}
    >
      <Ionicons
        name={icon}
        size={18}
        color={active ? Colors.primary : "#6b7280"}
        style={{ marginRight: 6 }}
      />
      <Text
        style={{
          fontSize: 14,
          fontWeight: "600",
          color: active ? Colors.primary : "#6b7280",
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function SavedPostTile({
  post,
  onUnsave,
  tileWidth,
}: {
  post: any;
  onUnsave: (id: string) => void;
  tileWidth: number;
}) {
  const mediaUrl = post.media_urls?.[0];
  const providerName = post.provider?.business_name || "";

  return (
    <TouchableOpacity
      onPress={() =>
        router.push({
          pathname: "/(app)/explore-post" as any,
          params: { id: post.id },
        })
      }
      activeOpacity={0.8}
      style={{ width: tileWidth }}
    >
      <View style={{ borderRadius: 12, overflow: "hidden", backgroundColor: "#f3f4f6" }}>
        {mediaUrl ? (
          <Image
            source={{ uri: mediaUrl }}
            style={{ width: tileWidth, height: tileWidth * 1.2 }}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={200}
          />
        ) : (
          <View
            style={{
              width: tileWidth,
              height: tileWidth * 1.2,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="image-outline" size={32} color="#d1d5db" />
          </View>
        )}
        {/* Unsave button */}
        <TouchableOpacity
          onPress={() => onUnsave(post.id)}
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            backgroundColor: "rgba(0,0,0,0.5)",
            borderRadius: 16,
            width: 32,
            height: 32,
            alignItems: "center",
            justifyContent: "center",
          }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="bookmark" size={16} color="#fff" />
        </TouchableOpacity>
      </View>
      <View style={{ paddingVertical: 6 }}>
        {providerName ? (
          <Text
            style={{ fontSize: 12, fontWeight: "600", color: "#374151" }}
            numberOfLines={1}
          >
            {providerName}
          </Text>
        ) : null}
        {post.caption ? (
          <Text
            style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}
            numberOfLines={2}
          >
            {post.caption}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}
