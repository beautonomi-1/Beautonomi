import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  FlatList,
  Platform,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, isAuthError } from "@/lib/api-client";
import { useAuth } from "@/providers/AuthProvider";
import { useSafeAreaInsets, SafeAreaView } from "react-native-safe-area-context";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { useResponsive } from "@/hooks/useResponsive";
import { Colors, Shadows } from "@/constants/colors";
import { useTabContentPaddingBottom } from "@/hooks/useTabContentPaddingBottom";

type Tab = "providers" | "products" | "posts";

const COLUMN_GAP = 8;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.gray[50],
  },
  tabletShell: {
    flex: 1,
    width: "100%" as const,
  },
  headerBlock: {
    backgroundColor: Colors.white,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.gray[200],
  },
  screenTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: Colors.gray[900],
  },
  screenSubtitle: {
    fontSize: 14,
    color: Colors.gray[500],
    marginTop: 4,
  },
  errorBanner: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FEF2F2",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#FECACA",
  },
  errorText: {
    color: "#991B1B",
    textAlign: "center",
    marginBottom: 12,
    fontSize: 14,
    lineHeight: 20,
  },
  retryBtn: {
    alignSelf: "center",
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryBtnText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 15,
  },
  tabBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingTop: 4,
    backgroundColor: Colors.white,
  },
  loadingPane: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  loadingLabel: {
    marginTop: 12,
    fontSize: 14,
    color: Colors.gray[500],
  },
  emptyPane: {
    flex: 1,
    minHeight: 320,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
    paddingVertical: 32,
  },
  emptyListPane: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
    paddingVertical: 48,
    minHeight: 280,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: Colors.gray[900],
    marginTop: 16,
    textAlign: "center",
  },
  emptyBody: {
    fontSize: 14,
    color: Colors.gray[500],
    marginTop: 8,
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 300,
  },
  emptyCta: {
    marginTop: 20,
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 12,
  },
  emptyCtaText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
  emptyCtaSecondary: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  emptyCtaSecondaryText: {
    color: Colors.primary,
    fontWeight: "600",
    fontSize: 15,
  },
});

export interface SavedTabContentProps {
  /** When false, do not fetch or show "Recently viewed" (e.g. on main Saved tab) */
  showRecentlyViewed?: boolean;
  /** For analytics / screen title */
  screenName?: string;
  /** Initial tab from route params (e.g. tab=posts) */
  initialTab?: Tab;
  /**
   * `tabs` — main Saved tab (bottom tab bar). `stack` — e.g. account wishlists (no tab bar; tighter bottom inset).
   */
  layoutVariant?: "tabs" | "stack";
}

export function SavedTabContent({
  showRecentlyViewed = true,
  screenName = "Saved",
  initialTab,
  layoutVariant = "tabs",
}: SavedTabContentProps) {
  useScreenTracking(screenName);
  const { user } = useAuth();
  const params = useLocalSearchParams<{ tab?: string }>();
  const { width, contentPadding, contentMaxWidth, isTablet, columns: gridColumns } = useResponsive();
  const insets = useSafeAreaInsets();
  const tabBarScrollPadding = useTabContentPaddingBottom(8);
  const stackScrollPadding = Math.max(insets.bottom, 8) + 28;
  const scrollBottomPadding = layoutVariant === "stack" ? stackScrollPadding : tabBarScrollPadding;
  const constraint =
    isTablet || Platform.OS === "web"
      ? { maxWidth: contentMaxWidth, alignSelf: "center" as const, width: "100%" as const }
      : {};
  const contentWidth = Math.min(width, contentMaxWidth) - contentPadding * 2;
  const TILE_WIDTH = (contentWidth - COLUMN_GAP * (gridColumns - 1)) / gridColumns;
  // §Customer-audit 2026-04: provider list rows are horizontal (avatar | name |
  // chevron) so a 3-/4-column grid would squash them. Use a 2-column layout on
  // tablet to make better use of horizontal space while keeping each row
  // comfortable; phones stay single-column.
  const providerColumns = isTablet ? 2 : 1;
  const PROVIDER_GAP = 12;
  const PROVIDER_TILE_WIDTH =
    providerColumns === 1
      ? contentWidth
      : (contentWidth - PROVIDER_GAP * (providerColumns - 1)) / providerColumns;
  const [activeTab, setActiveTab] = useState<Tab>(
    initialTab ?? (params.tab === "posts" ? "posts" : "providers")
  );

  const [saved, setSaved] = useState<any[]>([]);
  const [recentlyViewed, setRecentlyViewed] = useState<any[]>([]);
  const [savedPosts, setSavedPosts] = useState<any[]>([]);
  const [savedProducts, setSavedProducts] = useState<any[]>([]);
  const [collections, setCollections] = useState<{ id: string; name: string; slug: string; post_count: number }[]>([]);
  const [boardPickerPost, setBoardPickerPost] = useState<{ id: string; collection_ids?: string[] } | null>(null);
  const [boardActionLoading, setBoardActionLoading] = useState(false);
  const [createBoardVisible, setCreateBoardVisible] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");
  const [creatingBoard, setCreatingBoard] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [postsLoading, setPostsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProviders = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const requests: Promise<any>[] = [
          api.get<any>("/api/me/wishlists/providers"),
        ];
        if (showRecentlyViewed) {
          requests.push(api.get<any>("/api/me/recently-viewed"));
        }
        const results = await Promise.all(requests);
        const savedRes = results[0];
        if (savedRes.error) setError(savedRes.error.message || "Failed to load");
        else {
          const s = savedRes.data;
          setSaved(Array.isArray(s) ? s : s?.data ?? []);
        }
        if (showRecentlyViewed && results[1]) {
          const r = results[1].data;
          setRecentlyViewed(Array.isArray(r) ? r : r?.data ?? []);
        } else if (!showRecentlyViewed) {
          setRecentlyViewed([]);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [showRecentlyViewed]
  );

  const loadProducts = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const res = await api.get<any>("/api/me/wishlists/products");
        if (res.error) {
          setError(res.error.message || "Failed to load");
          setSavedProducts([]);
        } else {
          const d = res.data;
          setSavedProducts(Array.isArray(d) ? d : d?.data ?? []);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
        setSavedProducts([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  const loadCollections = useCallback(async () => {
    try {
      const res = await api.get<{ data?: { id: string; name: string; slug: string; post_count: number }[] }>("/api/explore/collections");
      const d = res.data;
      const list = d?.data ?? (Array.isArray(d) ? d : []);
      setCollections(Array.isArray(list) ? list : []);
    } catch {
      setCollections([]);
    }
  }, []);

  const loadSavedPosts = useCallback(async (cursor?: string, isRefresh = false) => {
    if (!user?.id) {
      setSavedPosts([]);
      setNextCursor(undefined);
      setHasMore(false);
      setPostsLoading(false);
      setRefreshing(false);
      return;
    }
    if (isRefresh) {
      setRefreshing(true);
      setSavedPosts([]);
      setNextCursor(undefined);
    } else if (!cursor) {
      setPostsLoading(true);
    }
    setError(null);
    try {
      if (!cursor) loadCollections();
      const params = new URLSearchParams({ limit: "20" });
      if (cursor) params.set("cursor", cursor);
      const res = await api.get<{
        data?: unknown[];
        next_cursor?: string;
        has_more?: boolean;
      }>(`/api/explore/saved?${params}`);
      if (res.error) {
        const msg = res.error.message || "Failed to load saved posts";
        setError(isAuthError(res) ? "Please sign in again to view saved posts." : msg);
      } else {
        const d = res.data as Record<string, unknown> | null | undefined;
        const raw = d?.data;
        const posts = Array.isArray(raw) ? raw : [];
        if (cursor) {
          setSavedPosts((prev) => [...prev, ...posts]);
        } else {
          setSavedPosts(posts);
        }
        setNextCursor(typeof d?.next_cursor === "string" ? d.next_cursor : undefined);
        setHasMore(Boolean(d?.has_more));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setPostsLoading(false);
      setRefreshing(false);
    }
  }, [loadCollections, user?.id]);

  useEffect(() => {
    if (activeTab === "providers") {
      loadProviders();
    } else if (activeTab === "products") {
      loadProducts();
    } else {
      loadSavedPosts();
    }
  }, [activeTab, loadProviders, loadProducts, loadSavedPosts]);

  const handleRefresh = useCallback(() => {
    if (activeTab === "providers") loadProviders(true);
    else if (activeTab === "products") loadProducts(true);
    else loadSavedPosts(undefined, true);
  }, [activeTab, loadProviders, loadProducts, loadSavedPosts]);

  const handleUnsave = useCallback(async (postId: string) => {
    const prev = savedPosts;
    setSavedPosts((p) => p.filter((x) => x.id !== postId));
    try {
      await api.delete(`/api/explore/saved?post_id=${postId}`);
    } catch {
      setSavedPosts(prev);
    }
  }, [savedPosts]);

  const savedProviderIds = useMemo(() => new Set(saved.map((p: any) => p.id)), [saved]);
  const handleSaveProvider = useCallback(
    (providerId: string, inWishlist: boolean) => {
      if (inWishlist) {
        loadProviders(true);
      } else {
        setSaved((prev: any[]) => prev.filter((p: any) => p.id !== providerId));
      }
    },
    [loadProviders]
  );

  const handleLoadMore = useCallback(() => {
    if (hasMore && nextCursor && !postsLoading) {
      loadSavedPosts(nextCursor);
    }
  }, [hasMore, nextCursor, postsLoading, loadSavedPosts]);

  const handleToggleBoard = useCallback(
    async (postId: string, collectionId: string, add: boolean) => {
      setBoardActionLoading(true);
      try {
        if (add) {
          await api.post(`/api/explore/collections/${collectionId}/posts`, { post_id: postId });
        } else {
          await api.delete(`/api/explore/collections/${collectionId}/posts?post_id=${postId}`);
        }
        setSavedPosts((prev) =>
          prev.map((p) => {
            if (p.id !== postId) return p;
            const ids = p.collection_ids ?? [];
            return {
              ...p,
              collection_ids: add
                ? (ids.includes(collectionId) ? ids : [...ids, collectionId])
                : ids.filter((id: string) => id !== collectionId),
            };
          })
        );
        setCollections((prev) =>
          prev.map((c) =>
            c.id === collectionId ? { ...c, post_count: c.post_count + (add ? 1 : -1) } : c
          )
        );
        setBoardPickerPost((p) =>
          p && p.id === postId
            ? {
                ...p,
                collection_ids: add
                  ? [...(p.collection_ids ?? []), collectionId]
                  : (p.collection_ids ?? []).filter((id: string) => id !== collectionId),
              }
            : p
        );
      } catch {
        // keep state on error
      } finally {
        setBoardActionLoading(false);
      }
    },
    []
  );

  const handleCreateBoard = useCallback(async () => {
    const name = newBoardName.trim();
    if (!name) return;
    setCreatingBoard(true);
    try {
      const res = await api.post<{ data?: { id: string; name: string; slug: string } }>(
        "/api/explore/collections",
        { name }
      );
      const data = res.data ?? (res as any);
      if (data?.id) {
        setCollections((prev) => [...prev, { id: data.id, name: data.name, slug: data.slug, post_count: 0 }]);
        setCreateBoardVisible(false);
        setNewBoardName("");
      }
    } catch {
      Alert.alert("Error", "Could not create board. Please try again.");
    } finally {
      setCreatingBoard(false);
    }
  }, [newBoardName]);

  const emptyTitle =
    activeTab === "providers"
      ? showRecentlyViewed
        ? "No saved or recently viewed providers"
        : "No saved providers yet"
      : activeTab === "products"
        ? "No saved products yet"
        : activeTab === "posts" && !user
          ? "Sign in to see saved posts"
          : "No saved posts yet";
  const emptySubtitle =
    activeTab === "posts"
      ? !user
        ? "Your session may have expired — sign in again to load saved explore posts."
        : "Bookmark posts from Explore to see them here"
      : activeTab === "products"
        ? "Save products from the shop with the heart icon to see them here."
        : activeTab === "providers"
          ? "Tap the heart on a provider profile to save them here."
          : undefined;

  const showLoadingContent =
    !refreshing &&
    ((activeTab === "posts" && postsLoading && savedPosts.length === 0) ||
      (activeTab !== "posts" && loading));

  const compactTabs = width < 400;

  const rowGapStyle = (index: number) =>
    (index + 1) % gridColumns !== 0 ? { marginRight: COLUMN_GAP } : undefined;

  const showHeroHeader = layoutVariant === "tabs";

  return (
    <View style={styles.root}>
      {showHeroHeader ? (
        <SafeAreaView edges={["top"]} style={{ backgroundColor: Colors.gray[50] }} />
      ) : null}
      <View style={[styles.tabletShell, constraint]}>
        <View style={styles.headerBlock}>
          {showHeroHeader ? (
            <View style={{ paddingHorizontal: contentPadding, paddingTop: contentPadding, paddingBottom: 4 }}>
              <Text style={styles.screenTitle}>Saved</Text>
              <Text style={styles.screenSubtitle}>Providers, posts, and products you love</Text>
            </View>
          ) : null}
          <View
            style={[
              styles.tabBar,
              {
                paddingHorizontal: contentPadding,
                paddingBottom: 12,
                paddingTop: showHeroHeader ? 4 : 10,
              },
            ]}
          >
            <TabButton
              label="Providers"
              icon="heart-outline"
              active={activeTab === "providers"}
              onPress={() => setActiveTab("providers")}
            />
            <TabButton
              label={compactTabs ? "Posts" : "Saved posts"}
              icon="bookmark-outline"
              active={activeTab === "posts"}
              onPress={() => setActiveTab("posts")}
            />
            <TabButton
              label="Products"
              icon="bag-outline"
              active={activeTab === "products"}
              onPress={() => setActiveTab("products")}
            />
          </View>
        </View>

      {error ? (
        <View style={[styles.errorBanner, { paddingHorizontal: contentPadding }]}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={handleRefresh} style={styles.retryBtn} accessibilityRole="button" accessibilityLabel="Retry">
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {showLoadingContent ? (
        <View style={[styles.loadingPane, { backgroundColor: Colors.gray[50] }]}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingLabel}>Loading…</Text>
        </View>
      ) : activeTab === "providers" ? (
        <ScrollView
          style={{ flex: 1, backgroundColor: Colors.gray[50] }}
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: contentPadding,
            paddingTop: 16,
            paddingBottom: scrollBottomPadding,
            ...constraint,
          }}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={Colors.primary}
            />
          }
        >
          {saved.length === 0 && (!showRecentlyViewed || recentlyViewed.length === 0) ? (
            <View style={styles.emptyPane}>
              <Ionicons name="heart-outline" size={56} color={Colors.gray[300]} />
              <Text style={styles.emptyTitle}>{emptyTitle}</Text>
              {emptySubtitle ? <Text style={styles.emptyBody}>{emptySubtitle}</Text> : null}
              <TouchableOpacity
                onPress={() => router.push("/(app)/(tabs)/home" as any)}
                style={styles.emptyCta}
                accessibilityRole="button"
                accessibilityLabel="Discover providers"
              >
                <Text style={styles.emptyCtaText}>Discover providers</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {saved.length > 0 && (
            <View style={{ marginBottom: 24 }}>
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "600",
                  color: Colors.gray[900],
                  marginBottom: 12,
                }}
              >
                Saved providers
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: PROVIDER_GAP,
                }}
              >
                {saved.map((p: any) => (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() =>
                      p.slug &&
                      router.push({
                        pathname: "/(app)/partner-profile",
                        params: { slug: p.slug },
                      })
                    }
                    style={{
                      width: PROVIDER_TILE_WIDTH,
                      flexDirection: "row",
                      alignItems: "center",
                      backgroundColor: Colors.white,
                      borderRadius: 12,
                      padding: 16,
                      borderWidth: 1,
                      borderColor: Colors.gray[100],
                    }}
                  >
                    {(p.avatar_url || p.thumbnail_url) ? (
                      <Image
                        source={{ uri: p.avatar_url || p.thumbnail_url }}
                        style={{ width: 48, height: 48, borderRadius: 8, marginRight: 12 }}
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
          {showRecentlyViewed && recentlyViewed.length > 0 && (
            <View>
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "600",
                  color: Colors.gray[900],
                  marginBottom: 12,
                }}
              >
                Recently viewed
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: PROVIDER_GAP,
                }}
              >
                {recentlyViewed.map((p: any) => (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() =>
                      p.slug &&
                      router.push({
                        pathname: "/(app)/partner-profile",
                        params: { slug: p.slug },
                      })
                    }
                    style={{
                      width: PROVIDER_TILE_WIDTH,
                      flexDirection: "row",
                      alignItems: "center",
                      backgroundColor: Colors.white,
                      borderRadius: 12,
                      padding: 16,
                      borderWidth: 1,
                      borderColor: Colors.gray[100],
                    }}
                  >
                    {(p.avatar_url || p.thumbnail_url) ? (
                      <Image
                        source={{ uri: p.avatar_url || p.thumbnail_url }}
                        style={{ width: 48, height: 48, borderRadius: 8, marginRight: 12 }}
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
      ) : activeTab === "products" ? (
        <FlatList
          key={`saved-products-${gridColumns}`}
          data={savedProducts}
          keyExtractor={(item) => item.id}
          numColumns={gridColumns}
          style={{ flex: 1, backgroundColor: Colors.gray[50] }}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            { padding: contentPadding, paddingBottom: scrollBottomPadding, ...constraint },
            savedProducts.length === 0 ? { flexGrow: 1 } : null,
          ]}
          columnWrapperStyle={
            savedProducts.length > 0 && gridColumns > 1 ? { marginBottom: COLUMN_GAP } : undefined
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={Colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyListPane}>
              <Ionicons name="bag-outline" size={52} color={Colors.gray[300]} />
              <Text style={styles.emptyTitle}>{emptyTitle}</Text>
              <Text style={styles.emptyBody}>{emptySubtitle}</Text>
              <TouchableOpacity
                onPress={() => router.push("/(app)/(tabs)/shop" as any)}
                style={styles.emptyCta}
                accessibilityRole="button"
                accessibilityLabel="Browse the shop"
              >
                <Text style={styles.emptyCtaText}>Browse shop</Text>
              </TouchableOpacity>
            </View>
          }
          renderItem={({ item, index }) => (
            <View style={rowGapStyle(index)}>
              <SavedProductTile product={item} tileWidth={TILE_WIDTH} />
            </View>
          )}
        />
      ) : (
        <FlatList
          key={`saved-posts-${gridColumns}`}
          data={savedPosts}
          keyExtractor={(item) => item.id}
          numColumns={gridColumns}
          style={{ flex: 1, backgroundColor: Colors.gray[50] }}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            { padding: contentPadding, paddingBottom: scrollBottomPadding, ...constraint },
            savedPosts.length === 0 ? { flexGrow: 1 } : null,
          ]}
          columnWrapperStyle={
            savedPosts.length > 0 && gridColumns > 1 ? { marginBottom: COLUMN_GAP } : undefined
          }
          ListHeaderComponent={
            <View style={{ marginBottom: 16 }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 10,
                }}
              >
                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: "600",
                    color: Colors.gray[900],
                  }}
                >
                  Boards
                </Text>
                <TouchableOpacity
                  onPress={() => setCreateBoardVisible(true)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 6,
                    paddingHorizontal: 10,
                  }}
                >
                  <Ionicons name="add-circle-outline" size={20} color={Colors.primary} />
                  <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.primary, marginLeft: 6 }}>
                    New board
                  </Text>
                </TouchableOpacity>
              </View>
              {collections.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingRight: contentPadding }}
                >
                  {collections.map((c, idx) => (
                    <TouchableOpacity
                      key={c.id}
                      onPress={() =>
                        router.push({
                          pathname: "/(app)/explore-collection/[id]",
                          params: { id: c.id },
                        } as any)
                      }
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        paddingHorizontal: 14,
                        paddingVertical: 10,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: Colors.gray[200],
                        backgroundColor: Colors.gray[50],
                        marginLeft: idx === 0 ? 0 : 10,
                      }}
                    >
                      <Ionicons name="grid-outline" size={18} color={Colors.gray[500]} style={{ marginRight: 8 }} />
                      <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900] }}>{c.name}</Text>
                      <Text style={{ fontSize: 12, color: Colors.gray[500], marginLeft: 6 }}>({c.post_count})</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              ) : (
                <Text style={{ fontSize: 14, color: Colors.gray[500] }}>
                  Create a board to organize saved posts.
                </Text>
              )}
            </View>
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={Colors.primary}
            />
          }
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            postsLoading && savedPosts.length > 0 ? (
              <View style={{ paddingVertical: 20, alignItems: "center" }}>
                <ActivityIndicator size="small" color={Colors.primary} />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyListPane}>
              <Ionicons name="bookmark-outline" size={52} color={Colors.gray[300]} />
              <Text style={styles.emptyTitle}>{emptyTitle}</Text>
              <Text style={styles.emptyBody}>{emptySubtitle}</Text>
              <TouchableOpacity
                onPress={() => router.push("/(app)/(tabs)/explore" as any)}
                style={styles.emptyCta}
                accessibilityRole="button"
                accessibilityLabel="Open Explore"
              >
                <Text style={styles.emptyCtaText}>Explore inspiration</Text>
              </TouchableOpacity>
            </View>
          }
          renderItem={({ item, index }) => (
            <View style={rowGapStyle(index)}>
              <SavedPostTile
                post={item}
                onUnsave={handleUnsave}
                tileWidth={TILE_WIDTH}
                isProviderInWishlist={savedProviderIds.has(item.provider_id)}
                onSaveProvider={handleSaveProvider}
                collections={collections}
                onOpenBoardPicker={() => setBoardPickerPost({ id: item.id, collection_ids: item.collection_ids })}
              />
            </View>
          )}
        />
      )}

      {/* Board picker modal: add/remove post from boards */}
      <Modal
        visible={!!boardPickerPost}
        transparent
        animationType="fade"
        onRequestClose={() => setBoardPickerPost(null)}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "center",
            padding: 24,
          }}
          onPress={() => setBoardPickerPost(null)}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "#fff",
              borderRadius: 16,
              maxHeight: "70%",
              paddingVertical: 8,
            }}
          >
            <View style={{ paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "#e5e7eb" }}>
              <Text style={{ fontSize: 18, fontWeight: "700", color: Colors.gray[900] }}>Add to board</Text>
              <Text style={{ fontSize: 13, color: Colors.gray[500], marginTop: 4 }}>Choose a board</Text>
            </View>
            <ScrollView style={{ maxHeight: 320 }}>
              {collections.map((c) => {
                const inBoard = (boardPickerPost?.collection_ids ?? []).includes(c.id);
                return (
                  <TouchableOpacity
                    key={c.id}
                    disabled={boardActionLoading}
                    onPress={() =>
                      boardPickerPost && handleToggleBoard(boardPickerPost.id, c.id, !inBoard)
                    }
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      paddingVertical: 14,
                      paddingHorizontal: 16,
                    }}
                  >
                    <Text style={{ fontSize: 16, color: Colors.gray[900], fontWeight: "500" }}>{c.name}</Text>
                    {inBoard ? (
                      <Ionicons name="checkmark-circle" size={22} color={Colors.primary} />
                    ) : (
                      <Text style={{ fontSize: 14, color: Colors.gray[500] }}>Add</Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity
              onPress={() => setBoardPickerPost(null)}
              style={{ paddingVertical: 14, alignItems: "center", borderTopWidth: 1, borderTopColor: "#e5e7eb" }}
            >
              <Text style={{ fontSize: 16, fontWeight: "600", color: Colors.gray[600] }}>Done</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Create board modal */}
      <Modal
        visible={createBoardVisible}
        transparent
        animationType="fade"
        onRequestClose={() => !creatingBoard && setCreateBoardVisible(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "center",
            padding: 24,
          }}
          onPress={() => !creatingBoard && setCreateBoardVisible(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
            style={{ backgroundColor: "#fff", borderRadius: 16, padding: 20 }}
          >
            <Text style={{ fontSize: 18, fontWeight: "700", color: Colors.gray[900], marginBottom: 8 }}>
              New board
            </Text>
            <TextInput
              value={newBoardName}
              onChangeText={setNewBoardName}
              placeholder="e.g. Summer looks"
              placeholderTextColor={Colors.gray[400]}
              style={{
                borderWidth: 1,
                borderColor: "#e5e7eb",
                borderRadius: 10,
                paddingHorizontal: 14,
                paddingVertical: 12,
                fontSize: 16,
                color: Colors.gray[900],
                marginBottom: 16,
              }}
              editable={!creatingBoard}
            />
            <View style={{ flexDirection: "row", gap: 12 }}>
              <TouchableOpacity
                onPress={() => !creatingBoard && setCreateBoardVisible(false)}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 10,
                  backgroundColor: Colors.gray[100],
                  alignItems: "center",
                }}
              >
                <Text style={{ fontSize: 16, fontWeight: "600", color: Colors.gray[700] }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleCreateBoard}
                disabled={!newBoardName.trim() || creatingBoard}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 10,
                  backgroundColor: Colors.primary,
                  alignItems: "center",
                }}
              >
                {creatingBoard ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={{ fontSize: 16, fontWeight: "600", color: "#fff" }}>Create</Text>
                )}
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
      </View>
    </View>
  );
}

function SavedProductTile({
  product,
  tileWidth,
}: {
  product: any;
  tileWidth: number;
}) {
  const imageUrl = product?.image_urls?.[0];
  const providerSlug = product?.provider?.slug;

  return (
    <TouchableOpacity
      onPress={() =>
        router.push({
          pathname: "/(app)/product-detail",
          params: { id: product.id, ...(providerSlug ? { provider: providerSlug } : {}) },
        } as any)
      }
      activeOpacity={0.85}
      style={{
        width: tileWidth,
        borderRadius: 12,
        overflow: "hidden",
        backgroundColor: "#fff",
        borderWidth: 1,
        borderColor: "#E5E7EB",
      }}
    >
      <View style={{ width: tileWidth, height: tileWidth, backgroundColor: "#F3F4F6" }}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={{ width: tileWidth, height: tileWidth }} contentFit="cover" />
        ) : (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="cube-outline" size={28} color="#D1D5DB" />
          </View>
        )}
        {product?.in_stock === false && (
          <View
            style={{
              position: "absolute",
              top: 8,
              left: 8,
              backgroundColor: "#FEE2E2",
              borderRadius: 999,
              paddingHorizontal: 8,
              paddingVertical: 4,
            }}
          >
            <Text style={{ fontSize: 10, color: "#B91C1C", fontWeight: "700" }}>Out of stock</Text>
          </View>
        )}
      </View>
      <View style={{ padding: 10 }}>
        <Text style={{ fontSize: 11, color: "#6B7280" }} numberOfLines={1}>
          {product?.provider?.business_name || ""}
        </Text>
        <Text style={{ fontSize: 13, fontWeight: "700", color: Colors.gray[900], marginTop: 2 }} numberOfLines={2}>
          {product?.name || "Product"}
        </Text>
        {product?.brand ? (
          <Text style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }} numberOfLines={1}>
            {product.brand}
          </Text>
        ) : null}
        <Text style={{ fontSize: 13, fontWeight: "700", color: Colors.primary, marginTop: 6 }}>
          {product?.currency || ""} {Number(product?.retail_price ?? 0).toFixed(2)}
        </Text>
      </View>
    </TouchableOpacity>
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
      activeOpacity={0.85}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      style={{
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 10,
        paddingHorizontal: 4,
        borderRadius: 12,
        backgroundColor: active ? Colors.white : "transparent",
        ...(active ? Shadows.cardSubtle : {}),
      }}
    >
      <Ionicons
        name={icon}
        size={17}
        color={active ? Colors.primary : Colors.gray[500]}
        style={{ marginRight: 5 }}
      />
      <Text
        style={{
          fontSize: 13,
          fontWeight: "600",
          color: active ? Colors.primary : Colors.gray[600],
          flexShrink: 1,
        }}
        numberOfLines={1}
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
  isProviderInWishlist,
  onSaveProvider,
  collections,
  onOpenBoardPicker,
}: {
  post: any;
  onUnsave: (id: string) => void;
  tileWidth: number;
  isProviderInWishlist: boolean;
  onSaveProvider: (providerId: string, inWishlist: boolean) => void;
  collections: { id: string; name: string; slug: string; post_count: number }[];
  onOpenBoardPicker: () => void;
}) {
  const [providerSaved, setProviderSaved] = useState(isProviderInWishlist);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setProviderSaved(isProviderInWishlist);
  }, [isProviderInWishlist]);
  const mediaUrl = post.media_urls?.[0];
  const providerName = post.provider?.business_name || "";
  const providerSlug = post.provider?.slug;
  const providerId = post.provider_id;

  const handleSaveProvider = async () => {
    if (!providerId || saving) return;
    setSaving(true);
    try {
      await api.post("/api/me/wishlists/toggle", {
        item_type: "provider",
        item_id: providerId,
      });
      const next = !providerSaved;
      setProviderSaved(next);
      onSaveProvider(providerId, next);
    } catch {
      // keep state on error
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ width: tileWidth }}>
      <TouchableOpacity
        onPress={() =>
          router.push({
            pathname: "/(app)/explore-post" as any,
            params: { id: post.id },
          })
        }
        activeOpacity={0.8}
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
          <View
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              flexDirection: "row",
            }}
          >
            {collections.length > 0 && (
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation();
                  onOpenBoardPicker();
                }}
                style={{
                  backgroundColor: "rgba(0,0,0,0.5)",
                  borderRadius: 16,
                  width: 32,
                  height: 32,
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: 6,
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="layers-outline" size={16} color="#fff" />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                onUnsave(post.id);
              }}
              style={{
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
        </View>
      </TouchableOpacity>
      <View style={{ paddingVertical: 6, paddingHorizontal: 2 }}>
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
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "center",
            marginTop: 6,
            gap: 8,
          }}
        >
          {providerSlug ? (
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                router.push({
                  pathname: "/(app)/partner-profile",
                  params: { slug: providerSlug },
                });
              }}
              style={{ paddingVertical: 4 }}
            >
              <Text
                style={{ fontSize: 12, fontWeight: "600", color: Colors.primary }}
              >
                Book with {providerName || "provider"}
              </Text>
            </TouchableOpacity>
          ) : null}
          {providerId ? (
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                handleSaveProvider();
              }}
              disabled={saving}
              style={{
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 9999,
                borderWidth: 1,
                borderColor: providerSaved ? Colors.primary : "#d1d5db",
                backgroundColor: providerSaved ? "#fdf2f8" : "transparent",
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "600",
                  color: providerSaved ? Colors.primary : "#374151",
                }}
              >
                {providerSaved ? "Saved" : "Save provider"}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </View>
  );
}
