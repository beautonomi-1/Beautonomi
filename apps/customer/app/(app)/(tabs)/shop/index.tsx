import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Colors } from "@/constants/colors";
import { useResponsive } from "@/hooks/useResponsive";
import { useTabContentPaddingBottom } from "@/hooks/useTabContentPaddingBottom";
import { useCart } from "@/features/shop/useCart";
import { useAuth } from "@/providers/AuthProvider";
import { api } from "@/lib/api-client";
import { shareMarketplaceProduct } from "@/lib/share-product";
import { haptic } from "@/lib/haptics";
import { formatMoney } from "@beautonomi/utils";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";

const PRIMARY = Colors.primary;

interface ShopProduct {
  id: string;
  name: string;
  description?: string;
  price: number;
  currency: string;
  image_url?: string | null;
  image_urls?: string[] | null;
  brand?: string | null;
  quantity?: number;
  track_stock_quantity?: boolean;
  has_variants?: boolean;
  in_stock?: boolean;
  provider?: { id: string; business_name: string; slug: string };
}

interface ProductsResponse {
  products?: ShopProduct[];
  total?: number;
  page?: number;
  has_more?: boolean;
}

export default function ShopScreen() {
  const router = useRouter();
  const { contentPadding } = useResponsive();
  const tabScrollPaddingBottom = useTabContentPaddingBottom();
  const { user } = useAuth();
  const cart = useCart();
  const fb = getTenantDefaultCurrency();
  const params = useLocalSearchParams<{ q?: string; category?: string }>();

  const [query, setQuery] = useState(params.q ?? "");
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wishlistProductIds, setWishlistProductIds] = useState<Set<string>>(new Set());
  const [wishlistBusyId, setWishlistBusyId] = useState<string | null>(null);
  const [addingToCartId, setAddingToCartId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setWishlistProductIds(new Set());
      return;
    }
    let cancelled = false;
    api.get<unknown>("/api/me/wishlists/products").then((res) => {
      if (cancelled || res.error) return;
      const raw = res.data as { data?: unknown[] } | unknown[] | null;
      const list = Array.isArray(raw) ? raw : (raw as { data?: unknown[] })?.data ?? [];
      const next = new Set<string>();
      for (const row of list) {
        if (!row || typeof row !== "object") continue;
        const o = row as { product_id?: string; id?: string };
        const pid = o.product_id ?? o.id;
        if (typeof pid === "string") next.add(pid);
      }
      setWishlistProductIds(next);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const fetchProducts = useCallback(async (opts: { pageNum?: number; queryOverride?: string; isRefresh?: boolean } = {}) => {
    const { pageNum = 1, queryOverride, isRefresh = false } = opts;
    const q = queryOverride !== undefined ? queryOverride : query;

    if (isRefresh) setRefreshing(true);
    else if (pageNum === 1) setLoading(true);
    else setLoadingMore(true);
    setError(null);

    const searchParams = new URLSearchParams({ page: String(pageNum), limit: "20" });
    if (q.trim()) searchParams.set("search", q.trim());
    if (params.category?.trim()) searchParams.set("category", params.category.trim());

    try {
      const res = await api.get<ProductsResponse>(`/api/public/products?${searchParams}`);
      if (res.error) {
        setError("Could not load products. Pull to refresh.");
        if (pageNum === 1) setProducts([]);
      } else {
        const data = res.data as ProductsResponse;
        const list = data?.products ?? [];
        if (pageNum === 1) {
          setProducts(list);
        } else {
          setProducts((prev) => [...prev, ...list]);
        }
        setPage(pageNum);
        setHasMore(data?.has_more ?? false);
      }
    } catch {
      setError("Could not load products.");
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [query]);

  useEffect(() => {
    fetchProducts({ pageNum: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = useCallback(() => {
    fetchProducts({ pageNum: 1, queryOverride: query });
  }, [fetchProducts, query]);

  const handleLoadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    fetchProducts({ pageNum: page + 1 });
  }, [fetchProducts, page, hasMore, loadingMore]);

  const fmt = useCallback(
    (amount: number, currency?: string) => formatMoney(amount, currency ?? fb),
    [fb],
  );

  const inStock = useCallback((p: ShopProduct) => {
    if (p.in_stock != null) return p.in_stock;
    if (p.has_variants) return true;
    if (!p.track_stock_quantity) return true;
    return (p.quantity ?? 0) > 0;
  }, []);

  const imageUri = useCallback(
    (p: ShopProduct) =>
      p.image_url ?? (Array.isArray(p.image_urls) && p.image_urls.length > 0 ? p.image_urls[0] : null),
    [],
  );

  const productKeyExtractor = useCallback((p: ShopProduct) => p.id, []);

  const toggleGridWishlist = useCallback(
    async (p: ShopProduct) => {
      if (!user) {
        router.push({
          pathname: "/(auth)/login",
          params: { return_to: `/(app)/product-detail?id=${encodeURIComponent(p.id)}` },
        } as any);
        return;
      }
      if (wishlistBusyId) return;
      setWishlistBusyId(p.id);
      haptic.light();
      try {
        const res = await api.post<{ action?: "added" | "removed"; data?: { action?: "added" | "removed" } }>(
          "/api/me/wishlists/toggle",
          { item_type: "product", item_id: p.id },
        );
        if (res.error) {
          Alert.alert("Error", "Could not update wishlist. Please try again.");
        } else {
          const action = (res.data as { action?: string; data?: { action?: string } })?.action
            ?? (res.data as { data?: { action?: string } })?.data?.action;
          if (action === "added" || action === "removed") {
            setWishlistProductIds((prev) => {
              const next = new Set(prev);
              if (action === "added") next.add(p.id);
              else next.delete(p.id);
              return next;
            });
            haptic.success();
          }
        }
      } finally {
        setWishlistBusyId(null);
      }
    },
    [user, router, wishlistBusyId],
  );

  const quickAddToCart = useCallback(
    async (p: ShopProduct) => {
      if (!p.provider?.id) {
        Alert.alert("Unavailable", "This product cannot be added from the grid. Open the product page.");
        return;
      }
      if (p.has_variants) {
        router.push(`/(app)/product-detail?id=${p.id}` as any);
        return;
      }
      if (!inStock(p)) return;
      setAddingToCartId(p.id);
      haptic.medium();
      const img = imageUri(p);
      const { error: addErr } = await cart.addToCart(p.id, 1, null, {
        name: p.name,
        retail_price: p.price,
        currency: p.currency,
        image_url: img,
        provider_id: p.provider.id,
        provider_name: p.provider.business_name,
        provider_slug: p.provider.slug,
      });
      setAddingToCartId(null);
      if (addErr) Alert.alert("Could not add to cart", addErr);
      else {
        haptic.success();
        Alert.alert("Added to cart", "View your cart or keep shopping.", [
          { text: "View cart", onPress: () => router.push("/(app)/(tabs)/cart" as any) },
          { text: "OK", style: "cancel" },
        ]);
      }
    },
    [cart, imageUri, inStock, router],
  );

  const renderProduct = useCallback(
    ({ item: p }: { item: ShopProduct }) => {
      const available = inStock(p);
      const img = imageUri(p);
      const saved = wishlistProductIds.has(p.id);
      const canQuickAdd = available && !p.has_variants && !!p.provider?.id;
      return (
        <View
          style={{
            flex: 1,
            borderRadius: 14,
            backgroundColor: "#fff",
            overflow: "hidden",
            borderWidth: 1,
            borderColor: "#F3F4F6",
            shadowColor: "#000",
            shadowOpacity: 0.04,
            shadowRadius: 4,
            shadowOffset: { width: 0, height: 2 },
            elevation: 1,
          }}
        >
          <View style={{ aspectRatio: 1, backgroundColor: "#F3F4F6", position: "relative" }}>
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => router.push(`/(app)/product-detail?id=${p.id}` as any)}
              style={{ flex: 1 }}
            >
              {img ? (
                <Image source={{ uri: img }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
              ) : (
                <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="cube-outline" size={32} color="#D1D5DB" />
                </View>
              )}
            </TouchableOpacity>
            <View
              style={{
                position: "absolute",
                top: 6,
                left: 6,
                right: 6,
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "flex-start",
                pointerEvents: "box-none",
              }}
            >
              <TouchableOpacity
                onPress={() => {
                  haptic.light();
                  void shareMarketplaceProduct({ id: p.id, name: p.name });
                }}
                style={{
                  backgroundColor: "rgba(255,255,255,0.95)",
                  borderRadius: 18,
                  width: 36,
                  height: 36,
                  alignItems: "center",
                  justifyContent: "center",
                  shadowColor: "#000",
                  shadowOpacity: 0.06,
                  shadowRadius: 4,
                  elevation: 2,
                }}
                accessibilityLabel="Share product"
              >
                <Ionicons name="share-outline" size={18} color="#111827" />
              </TouchableOpacity>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                {!available ? (
                  <View
                    style={{
                      backgroundColor: "#EF4444",
                      borderRadius: 6,
                      paddingHorizontal: 6,
                      paddingVertical: 2,
                      marginRight: 6,
                    }}
                  >
                    <Text style={{ color: "#fff", fontSize: 9, fontWeight: "700" }}>Sold out</Text>
                  </View>
                ) : null}
                <TouchableOpacity
                  onPress={() => void toggleGridWishlist(p)}
                  disabled={wishlistBusyId === p.id}
                  style={{
                    backgroundColor: "rgba(255,255,255,0.95)",
                    borderRadius: 18,
                    width: 36,
                    height: 36,
                    alignItems: "center",
                    justifyContent: "center",
                    shadowColor: "#000",
                    shadowOpacity: 0.06,
                    shadowRadius: 4,
                    elevation: 2,
                    opacity: wishlistBusyId === p.id ? 0.5 : 1,
                  }}
                  accessibilityLabel={saved ? "Remove from wishlist" : "Save to wishlist"}
                >
                  <Ionicons name={saved ? "heart" : "heart-outline"} size={18} color={saved ? PRIMARY : "#111827"} />
                </TouchableOpacity>
              </View>
            </View>
            {canQuickAdd ? (
              <TouchableOpacity
                onPress={() => void quickAddToCart(p)}
                disabled={addingToCartId === p.id}
                style={{
                  position: "absolute",
                  bottom: 6,
                  right: 6,
                  backgroundColor: PRIMARY,
                  borderRadius: 18,
                  width: 36,
                  height: 36,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: addingToCartId === p.id ? 0.7 : 1,
                }}
                accessibilityLabel="Add to cart"
              >
                {addingToCartId === p.id ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="add" size={22} color="#fff" />
                )}
              </TouchableOpacity>
            ) : null}
          </View>
          <TouchableOpacity
            onPress={() => router.push(`/(app)/product-detail?id=${p.id}` as any)}
            activeOpacity={0.85}
            style={{ padding: 10 }}
          >
            {p.brand ? <Text style={{ fontSize: 10, color: "#9CA3AF", fontWeight: "500", marginBottom: 2 }}>{p.brand}</Text> : null}
            <Text style={{ fontSize: 13, fontWeight: "600", color: "#111827", lineHeight: 18 }} numberOfLines={2}>
              {p.name}
            </Text>
            {p.provider?.business_name ? (
              <Text style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }} numberOfLines={1}>
                {p.provider.business_name}
              </Text>
            ) : null}
            <Text style={{ fontSize: 14, fontWeight: "700", color: PRIMARY, marginTop: 4 }}>{fmt(p.price, p.currency)}</Text>
          </TouchableOpacity>
        </View>
      );
    },
    [
      fmt,
      inStock,
      imageUri,
      router,
      wishlistProductIds,
      toggleGridWishlist,
      wishlistBusyId,
      quickAddToCart,
      addingToCartId,
    ],
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F9FAFB" }} edges={["top"]}>
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: contentPadding, paddingVertical: 12, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#F3F4F6" }}>
        <TouchableOpacity
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/(app)/(tabs)/home" as any))}
          style={{ marginRight: 12 }}
        >
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: 20, fontWeight: "700", color: "#111827" }}>Shop</Text>
        <TouchableOpacity
          onPress={() => router.push("/(app)/(tabs)/cart" as any)}
          style={{ position: "relative", padding: 4 }}
          accessibilityLabel={`Cart${cart.itemCount > 0 ? `, ${cart.itemCount} items` : ""}`}
        >
          <Ionicons name="bag-outline" size={24} color="#111827" />
          {cart.itemCount > 0 && (
            <View style={{ position: "absolute", top: -2, right: -2, backgroundColor: PRIMARY, borderRadius: 10, minWidth: 18, height: 18, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 }}>
              <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>{cart.itemCount > 99 ? "99+" : cart.itemCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {/* Search bar */}
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: contentPadding, paddingVertical: 10, backgroundColor: "#fff", gap: 8, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" }}>
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: "#F3F4F6", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 }}>
            <Ionicons name="search-outline" size={18} color="#9CA3AF" style={{ marginRight: 8 }} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={handleSearch}
              placeholder="Search products…"
              placeholderTextColor="#9CA3AF"
              returnKeyType="search"
              style={{ flex: 1, fontSize: 15, color: "#111827" }}
              autoCorrect={false}
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => { setQuery(""); fetchProducts({ pageNum: 1, queryOverride: "" }); }}>
                <Ionicons name="close-circle" size={18} color="#9CA3AF" />
              </TouchableOpacity>
            )}
          </View>
          {query.length > 0 && (
            <TouchableOpacity onPress={handleSearch} style={{ paddingHorizontal: 14, paddingVertical: 8, backgroundColor: PRIMARY, borderRadius: 12 }}>
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>Search</Text>
            </TouchableOpacity>
          )}
        </View>

        {loading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator size="large" color={PRIMARY} />
          </View>
        ) : error && products.length === 0 ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: contentPadding }}>
            <Ionicons name="wifi-outline" size={48} color="#D1D5DB" />
            <Text style={{ color: "#6B7280", marginTop: 12, textAlign: "center" }}>{error}</Text>
            <TouchableOpacity onPress={() => fetchProducts({ pageNum: 1 })} style={{ marginTop: 16, paddingVertical: 12, paddingHorizontal: 24, backgroundColor: PRIMARY, borderRadius: 12 }}>
              <Text style={{ color: "#fff", fontWeight: "600" }}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : products.length === 0 ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: contentPadding }}>
            <Ionicons name="cube-outline" size={48} color="#D1D5DB" />
            <Text style={{ fontSize: 16, fontWeight: "600", color: "#374151", marginTop: 12 }}>No products found</Text>
            {query ? (
              <Text style={{ color: "#6B7280", marginTop: 6, textAlign: "center" }}>Try a different search term</Text>
            ) : (
              <Text style={{ color: "#6B7280", marginTop: 6, textAlign: "center" }}>No products are available right now</Text>
            )}
          </View>
        ) : (
          <FlatList
            data={products}
            keyExtractor={productKeyExtractor}
            numColumns={2}
            contentContainerStyle={{ padding: contentPadding, paddingBottom: tabScrollPaddingBottom }}
            columnWrapperStyle={{ gap: 12 }}
            ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchProducts({ pageNum: 1, isRefresh: true })} colors={[PRIMARY]} />}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.4}
            ListFooterComponent={loadingMore ? <ActivityIndicator style={{ padding: 16 }} color={PRIMARY} /> : null}
            renderItem={renderProduct}
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
