import { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, Stack, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/providers/AuthProvider";
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";
import { Colors, Shadows } from "@/constants/colors";
import { useResponsive } from "@/hooks/useResponsive";
import { haptic } from "@/lib/haptics";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";
import { useCart } from "@/features/shop/useCart";
import { shareMarketplaceProduct } from "@/lib/share-product";
import { formatMoney } from "@beautonomi/utils";
import type { PublicProductVariant } from "@/types/api";

interface ShippingConfig {
  offers_delivery: boolean;
  offers_collection: boolean;
  delivery_fee?: number;
  free_delivery_threshold?: number | null;
  estimated_delivery_days?: number;
  collection_notes?: string | null;
  delivery_notes?: string | null;
}

interface CollectionLocation {
  id: string;
  name: string;
  address_line1: string;
  city: string;
}

interface ProductDetailResponse {
  product: {
    id: string;
    name: string;
    brand?: string | null;
    short_description?: string | null;
    long_description?: string | null;
    description?: string | null;
    retail_price: number;
    currency: string;
    image_urls: string[];
    has_variants: boolean;
    variant_option_types?: { name: string; values: string[] }[];
    variants: {
      id: string;
      option_values?: Record<string, string>;
      retail_price: number;
      quantity: number;
      sort_order?: number;
      image_url?: string | null;
    }[];
    provider?: { id: string; business_name: string; slug: string };
  };
  shipping?: ShippingConfig;
  collection_locations?: CollectionLocation[];
}

function formatVariantLabel(optionValues?: Record<string, string>): string {
  if (!optionValues || Object.keys(optionValues).length === 0) return "";
  return Object.values(optionValues).join(", ");
}

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { addToCart } = useCart();
  const { contentPadding } = useResponsive();
  const { width: screenWidth } = useWindowDimensions();

  const [data, setData] = useState<ProductDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addingToCart, setAddingToCart] = useState(false);
  const [wishlistLoading, setWishlistLoading] = useState(false);
  const [isInWishlist, setIsInWishlist] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState<PublicProductVariant | null>(null);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const imageListRef = useRef<FlatList>(null);

  const shipping = data?.shipping;
  const collectionLocations = data?.collection_locations ?? [];
  const isPickupOnly = shipping
    ? shipping.offers_collection && !shipping.offers_delivery
    : false;
  const hasDelivery = shipping?.offers_delivery === true;

  const product = data?.product;
  const hasVariants = Boolean(product?.has_variants && product.variants?.length);
  const variants = (product?.variants ?? []).sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
  );

  const displayPrice = selectedVariant
    ? selectedVariant.retail_price
    : hasVariants && variants.length
      ? variants[0].retail_price
      : product?.retail_price ?? 0;
  const displayStock = selectedVariant
    ? selectedVariant.quantity
    : hasVariants && variants.length
      ? variants[0].quantity
      : (product as { quantity?: number } | undefined)?.quantity ?? 0;
  const inStock = displayStock > 0;
  const selectedVariantId = selectedVariant?.id ?? (hasVariants && variants[0] ? variants[0].id : null);

  const load = useCallback(async () => {
    if (!id) {
      setError("No product ID provided.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<ProductDetailResponse>(`/api/public/products/${encodeURIComponent(id)}`);
      if (res.error) {
        const status = (res.error as { status?: number } | undefined)?.status;
        if (status === 404) {
          setError("This product is no longer available or could not be found.");
        } else {
          setError(getApiErrorMessage(res.error, "Could not load product. Please try again."));
        }
        setData(null);
      } else {
        setData(res.data as ProductDetailResponse);
        const prod = (res.data as ProductDetailResponse)?.product;
        if (prod?.has_variants && Array.isArray(prod.variants) && prod.variants.length > 0) {
          const sorted = [...prod.variants].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
          const firstInStock = sorted.find((v) => (v.quantity ?? 0) > 0) ?? sorted[0];
          setSelectedVariant(firstInStock as PublicProductVariant);
        } else {
          setSelectedVariant(null);
        }
      }
    } catch (e) {
      setError(getApiErrorMessage(e, "Could not load product. Please try again."));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!user || !id) {
      setIsInWishlist(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await api.post<{ is_in_wishlist?: boolean; data?: { is_in_wishlist?: boolean } }>(
          "/api/me/wishlists/check",
          { item_type: "product", item_id: id },
        );
        const raw = res.data as any;
        const inWishlist = Boolean(raw?.is_in_wishlist ?? raw?.data?.is_in_wishlist);
        if (!cancelled) setIsInWishlist(inWishlist);
      } catch {
        if (!cancelled) setIsInWishlist(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, user]);

  const handleAddToCart = useCallback(async () => {
    if (!product) return;
    if (!product.provider?.id) {
      Alert.alert("Unavailable", "This product cannot be added to your cart right now.");
      return;
    }
    if (hasVariants && !selectedVariantId) {
      Alert.alert("Choose an option", "Please select a variant before adding to cart.");
      return;
    }
    if (!inStock) {
      Alert.alert("Out of stock", "This item is currently unavailable.");
      return;
    }
    setAddingToCart(true);
    haptic.medium();
    const thumb =
      selectedVariant?.image_url ||
      product.image_urls?.[0] ||
      (product as { image_url?: string }).image_url ||
      null;
    const guestSnapshot = {
      name: product.name,
      retail_price: Number(displayPrice),
      currency: product.currency,
      image_url: thumb,
      provider_id: product.provider.id,
      provider_name: product.provider.business_name,
      provider_slug: product.provider.slug,
    };
    const { error: addErr } = await addToCart(product.id, 1, selectedVariantId, guestSnapshot);
    setAddingToCart(false);
    if (addErr) {
      haptic.error();
      Alert.alert("Could not add to cart", addErr);
      return;
    }
    haptic.success();
    Alert.alert("Added to cart", "Item added. View your cart or continue shopping.", [
      {
        text: "Checkout",
        onPress: () =>
          product.provider?.id
            ? user
              ? router.push({ pathname: "/(app)/(tabs)/shop/product-checkout", params: { provider_id: product.provider.id } } as any)
              : router.push({
                  pathname: "/(auth)/login",
                  params: {
                    return_to: `/(app)/(tabs)/shop/product-checkout?provider_id=${encodeURIComponent(product.provider.id)}`,
                  },
                } as any)
            : router.push("/(app)/(tabs)/cart" as any),
      },
      { text: "View cart", onPress: () => router.push("/(app)/(tabs)/cart" as any) },
      { text: "Continue", style: "cancel" },
    ]);
  }, [product, user, hasVariants, selectedVariantId, inStock, displayPrice, selectedVariant, addToCart]);

  const toggleWishlist = useCallback(async () => {
    if (!id) return;
    if (!user) {
      Alert.alert("Sign in to save", "Create an account or sign in to save this product to your wishlist.", [
        { text: "Not now", style: "cancel" },
        {
          text: "Sign in",
          onPress: () =>
            router.push({
              pathname: "/(auth)/login",
              params: { return_to: `/(app)/product-detail?id=${encodeURIComponent(id)}` },
            } as any),
        },
      ]);
      return;
    }
    if (wishlistLoading) return;
    setWishlistLoading(true);
    try {
      const res = await api.post<{ action?: "added" | "removed"; data?: { action?: "added" | "removed" } }>(
        "/api/me/wishlists/toggle",
        { item_type: "product", item_id: id },
      );
      if (res.error) {
        haptic.error();
        Alert.alert("Error", res.error.message || "Could not update wishlist");
        return;
      }
      const action = (res.data as any)?.action ?? (res.data as any)?.data?.action;
      if (action === "added" || action === "removed") {
        const next = action === "added";
        setIsInWishlist(next);
        haptic.success();
      } else {
        haptic.error();
      }
    } catch {
      haptic.error();
      Alert.alert("Error", "Could not update wishlist. Please try again.");
    } finally {
      setWishlistLoading(false);
    }
  }, [id, user, wishlistLoading]);

  const shareProduct = useCallback(() => {
    if (!product?.id) return;
    haptic.light();
    void shareMarketplaceProduct({ id: product.id, name: product.name });
  }, [product]);

  if (loading && !data) {
    return (
      <>
        <Stack.Screen options={{ title: "Product", headerShown: true }} />
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#fff" }}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </>
    );
  }

  if (error || !product) {
    const isNotFound = !product && (!error || error.includes("no longer available") || error.includes("not found"));
    return (
      <>
        <Stack.Screen options={{ title: "Product", headerShown: true, headerBackTitle: "Back" }} />
        <ScrollView contentContainerStyle={{ flex: 1, backgroundColor: "#fff", padding: contentPadding, justifyContent: "center", alignItems: "center" }}>
          <Ionicons
            name={isNotFound ? "cube-outline" : "wifi-outline"}
            size={56}
            color="#D1D5DB"
          />
          <Text style={{ fontSize: 18, fontWeight: "700", color: "#111827", marginTop: 16, textAlign: "center" }}>
            {isNotFound ? "Product unavailable" : "Couldn't load product"}
          </Text>
          <Text style={{ fontSize: 14, color: "#6B7280", marginTop: 8, textAlign: "center", maxWidth: 280, lineHeight: 20 }}>
            {error ?? "This product could not be found. It may have been removed or is no longer available."}
          </Text>
          <View style={{ flexDirection: "row", gap: 12, marginTop: 24 }}>
            {!isNotFound && (
              <TouchableOpacity
                onPress={load}
                style={{ paddingVertical: 12, paddingHorizontal: 20, backgroundColor: Colors.primary, borderRadius: 12 }}
              >
                <Text style={{ color: "#fff", fontWeight: "700" }}>Try again</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => router.back()}
              style={{ paddingVertical: 12, paddingHorizontal: 20, backgroundColor: "#F3F4F6", borderRadius: 12 }}
            >
              <Text style={{ color: "#374151", fontWeight: "600" }}>Go back</Text>
            </TouchableOpacity>
          </View>
          {isNotFound && (
            <TouchableOpacity
              onPress={() => router.push("/(app)/(tabs)/explore" as any)}
              style={{ marginTop: 12, paddingVertical: 10, paddingHorizontal: 20 }}
            >
              <Text style={{ fontSize: 14, color: Colors.primary, fontWeight: "500" }}>Browse other products</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </>
    );
  }

  const fb = getTenantDefaultCurrency();
  const priceLabel = (amount: number) => formatMoney(amount, product.currency ?? fb);

  // Build image gallery: prefer variant image when selected, then all product images
  const allImages: string[] = [];
  if (selectedVariant?.image_url) allImages.push(selectedVariant.image_url);
  (product.image_urls ?? []).forEach((u) => { if (u && !allImages.includes(u)) allImages.push(u); });
  const legacyUrl = (product as { image_url?: string }).image_url;
  if (legacyUrl && !allImages.includes(legacyUrl)) allImages.push(legacyUrl);
  if (allImages.length === 0) allImages.push("");

  const stockLabel =
    displayStock > 10 ? "In stock" :
    displayStock > 0  ? `Only ${displayStock} left` :
    "Sold out";
  const stockColor =
    displayStock > 10 ? "#16A34A" :
    displayStock > 0  ? "#D97706" :
    "#EF4444";

  return (
    <>
      <Stack.Screen
        options={{
          title: product.name,
          headerShown: true,
          headerBackTitle: "Back",
        }}
      />
      <ScrollView style={{ flex: 1, backgroundColor: "#fff" }} contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        {/* ─── Image gallery ─── */}
        <View style={{ position: "relative" }}>
          <FlatList
            ref={imageListRef}
            data={allImages}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyExtractor={(_, i) => String(i)}
            onMomentumScrollEnd={(e) => {
              const idx = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
              setActiveImageIndex(idx);
            }}
            renderItem={({ item }) => (
              <View style={{ width: screenWidth, height: screenWidth, backgroundColor: "#F3F4F6" }}>
                {item ? (
                  <Image source={{ uri: item }} style={{ width: screenWidth, height: screenWidth }} contentFit="cover" />
                ) : (
                  <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="cube-outline" size={64} color="#D1D5DB" />
                  </View>
                )}
              </View>
            )}
          />
          <View
            style={{
              position: "absolute",
              top: 12,
              left: 12,
              right: 12,
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "flex-start",
              pointerEvents: "box-none",
            }}
          >
            <TouchableOpacity
              onPress={shareProduct}
              style={{
                backgroundColor: "rgba(255,255,255,0.95)",
                borderRadius: 22,
                width: 44,
                height: 44,
                alignItems: "center",
                justifyContent: "center",
                shadowColor: "#000",
                shadowOpacity: 0.08,
                shadowRadius: 6,
                shadowOffset: { width: 0, height: 2 },
                elevation: 3,
              }}
              accessibilityRole="button"
              accessibilityLabel="Share product"
            >
              <Ionicons name="share-outline" size={22} color="#111827" />
            </TouchableOpacity>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              {!inStock ? (
                <View
                  style={{
                    backgroundColor: "#EF4444",
                    borderRadius: 8,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    marginRight: 8,
                  }}
                >
                  <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>Sold out</Text>
                </View>
              ) : null}
              <TouchableOpacity
                onPress={() => {
                  void toggleWishlist();
                }}
                disabled={wishlistLoading}
                style={{
                  backgroundColor: "rgba(255,255,255,0.95)",
                  borderRadius: 22,
                  width: 44,
                  height: 44,
                  alignItems: "center",
                  justifyContent: "center",
                  shadowColor: "#000",
                  shadowOpacity: 0.08,
                  shadowRadius: 6,
                  shadowOffset: { width: 0, height: 2 },
                  elevation: 3,
                  opacity: wishlistLoading ? 0.6 : 1,
                }}
                accessibilityRole="button"
                accessibilityLabel={isInWishlist ? "Remove from wishlist" : "Save to wishlist"}
              >
                <Ionicons
                  name={isInWishlist ? "heart" : "heart-outline"}
                  size={22}
                  color={isInWishlist ? Colors.primary : "#111827"}
                />
              </TouchableOpacity>
            </View>
          </View>
          {/* Dot indicators */}
          {allImages.length > 1 && (
            <View style={{ position: "absolute", bottom: 12, left: 0, right: 0, flexDirection: "row", justifyContent: "center" }}>
              {allImages.map((_, i) => (
                <View key={i} style={{
                  width: i === activeImageIndex ? 20 : 6, height: 6, borderRadius: 3,
                  backgroundColor: i === activeImageIndex ? Colors.primary : "rgba(255,255,255,0.7)",
                  marginHorizontal: 3,
                }} />
              ))}
            </View>
          )}
        </View>

        <View style={{ padding: contentPadding }}>
          {/* Brand + Provider row */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            {product.brand ? (
              <Text style={{ fontSize: 12, color: "#9CA3AF", fontWeight: "500" }}>{product.brand}</Text>
            ) : <View />}
            {product.provider?.slug ? (
              <TouchableOpacity
                onPress={() => router.push(`/(app)/partner-profile?slug=${product.provider!.slug}` as any)}
                style={{ flexDirection: "row", alignItems: "center" }}
              >
                <Text style={{ fontSize: 12, color: Colors.primary, fontWeight: "600" }}>
                  {product.provider.business_name}
                </Text>
                <Ionicons name="chevron-forward" size={14} color={Colors.primary} />
              </TouchableOpacity>
            ) : null}
          </View>

          <Text style={{ fontSize: 22, fontWeight: "700", color: "#111827" }}>{product.name}</Text>

          {/* Price + stock row */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
            <Text style={{ fontSize: 22, fontWeight: "800", color: Colors.primary }}>
              {priceLabel(Number(displayPrice))}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: stockColor, marginRight: 6 }} />
              <Text style={{ fontSize: 13, fontWeight: "600", color: stockColor }}>{stockLabel}</Text>
            </View>
          </View>

          {/* Fulfillment availability banner */}
          {shipping && (
            <View style={{ marginTop: 14 }}>
              {isPickupOnly ? (
                <View style={{
                  flexDirection: "row", alignItems: "flex-start",
                  backgroundColor: "#FFF7ED", borderRadius: 12,
                  borderWidth: 1, borderColor: "#FED7AA",
                  padding: 12,
                }}>
                  <Ionicons name="storefront-outline" size={18} color="#C2410C" style={{ marginRight: 10, marginTop: 1 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: "700", color: "#C2410C" }}>In-store pickup only</Text>
                    <Text style={{ fontSize: 12, color: "#92400E", marginTop: 2, lineHeight: 17 }}>
                      This item must be collected in person. No delivery available.
                    </Text>
                    {shipping.collection_notes ? (
                      <Text style={{ fontSize: 12, color: "#92400E", marginTop: 4, lineHeight: 17 }}>
                        {shipping.collection_notes}
                      </Text>
                    ) : null}
                    {collectionLocations.length > 0 && (
                      <Text style={{ fontSize: 12, color: "#C2410C", marginTop: 4, fontWeight: "600" }}>
                        {collectionLocations.length === 1
                          ? `📍 ${collectionLocations[0].name}, ${collectionLocations[0].city}`
                          : `📍 ${collectionLocations.length} pickup locations`}
                      </Text>
                    )}
                  </View>
                </View>
              ) : (
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {shipping.offers_collection && (
                    <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#F0FDF4", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 }}>
                      <Ionicons name="storefront-outline" size={13} color="#16A34A" style={{ marginRight: 4 }} />
                      <Text style={{ fontSize: 12, fontWeight: "600", color: "#16A34A" }}>In-store pickup</Text>
                    </View>
                  )}
                  {hasDelivery && (
                    <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#EFF6FF", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 }}>
                      <Ionicons name="bicycle-outline" size={13} color="#1D4ED8" style={{ marginRight: 4 }} />
                      <Text style={{ fontSize: 12, fontWeight: "600", color: "#1D4ED8" }}>
                        Delivery{shipping.delivery_fee ? ` · ${priceLabel(shipping.delivery_fee)}` : " available"}
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          )}

          {/* Variant selector */}
          {hasVariants && (
            <View style={{ marginTop: 20 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827", marginBottom: 10 }}>
                {product.variant_option_types?.[0]?.name ?? "Option"}
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                {variants.map((v) => {
                  const label = formatVariantLabel(v.option_values) || `Variant ${v.id.slice(0, 8)}`;
                  const isSelected = selectedVariant?.id === v.id;
                  const outOfStock = (v.quantity ?? 0) <= 0;
                  return (
                    <TouchableOpacity
                      key={v.id}
                      onPress={() => {
                        if (outOfStock) return;
                        haptic.selection();
                        setSelectedVariant(v as PublicProductVariant);
                        // Scroll gallery to variant image if different
                        if (v.image_url && v.image_url !== allImages[0]) {
                          setActiveImageIndex(0);
                          imageListRef.current?.scrollToOffset({ offset: 0, animated: true });
                        }
                      }}
                      style={{
                        paddingHorizontal: contentPadding,
                        paddingVertical: 10,
                        borderRadius: 12,
                        borderWidth: 2,
                        borderColor: isSelected ? Colors.primary : "#E5E7EB",
                        backgroundColor: isSelected ? Colors.primaryLight : "#fff",
                        opacity: outOfStock ? 0.5 : 1,
                        marginRight: 10,
                        marginBottom: 10,
                      }}
                      disabled={outOfStock}
                      accessibilityState={{ selected: isSelected, disabled: outOfStock }}
                    >
                      <Text style={{ fontSize: 14, fontWeight: "600", color: isSelected ? Colors.primary : "#374151" }}>{label}</Text>
                      <Text style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>
                        {priceLabel(Number(v.retail_price))}
                        {outOfStock ? " · Sold out" : ""}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Description — short first, then long */}
          {(product.short_description || product.description || product.long_description) && (
            <View style={{ marginTop: 20 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827", marginBottom: 8 }}>Description</Text>
              {product.short_description ? (
                <Text style={{ fontSize: 14, color: "#374151", lineHeight: 22, marginBottom: product.long_description ? 8 : 0 }}>
                  {product.short_description}
                </Text>
              ) : null}
              {product.long_description ? (
                <Text style={{ fontSize: 14, color: "#374151", lineHeight: 22 }}>
                  {product.long_description}
                </Text>
              ) : product.description && !product.short_description ? (
                <Text style={{ fontSize: 14, color: "#374151", lineHeight: 22 }}>
                  {product.description}
                </Text>
              ) : null}
            </View>
          )}

          {/* Add to cart CTA */}
          <TouchableOpacity
            onPress={handleAddToCart}
            disabled={!inStock || addingToCart}
            style={{
              marginTop: 28,
              backgroundColor: inStock ? Colors.primary : "#D1D5DB",
              borderRadius: 12,
              paddingVertical: 16,
              alignItems: "center",
              flexDirection: "row",
              justifyContent: "center",
              ...Shadows.cardSmall,
            }}
            accessibilityRole="button"
            accessibilityLabel={inStock ? "Add to cart" : "Sold out"}
            accessibilityState={{ disabled: !inStock || addingToCart }}
          >
            {addingToCart ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="cart-outline" size={22} color="#fff" style={{ marginRight: 8 }} />
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>
                  {inStock ? `Add to cart · ${priceLabel(Number(displayPrice))}` : "Sold out"}
                </Text>
              </>
            )}
          </TouchableOpacity>

          {/* Prominent next-step CTAs */}
          <View style={{ flexDirection: "row", marginTop: 12, gap: 10 }}>
            <TouchableOpacity
              onPress={() => router.push("/(app)/(tabs)/cart" as any)}
              style={{
                flex: 1,
                backgroundColor: "#111827",
                borderRadius: 12,
                paddingVertical: 13,
                alignItems: "center",
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>View cart</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                if (!product.provider?.id) {
                  router.push("/(app)/(tabs)/cart" as any);
                  return;
                }
                if (user) {
                  router.push({ pathname: "/(app)/(tabs)/shop/product-checkout", params: { provider_id: product.provider.id } } as any);
                } else {
                  router.push({
                    pathname: "/(auth)/login",
                    params: {
                      return_to: `/(app)/(tabs)/shop/product-checkout?provider_id=${encodeURIComponent(product.provider.id)}`,
                    },
                  } as any);
                }
              }}
              style={{
                flex: 1,
                backgroundColor: "#fff",
                borderColor: Colors.primary,
                borderWidth: 2,
                borderRadius: 12,
                paddingVertical: 13,
                alignItems: "center",
              }}
            >
              <Text style={{ color: Colors.primary, fontWeight: "700", fontSize: 14 }}>Checkout now</Text>
            </TouchableOpacity>
          </View>

          {/* View in provider shop link */}
          {product.provider?.slug ? (
            <TouchableOpacity
              onPress={() => router.push(`/(app)/partner-profile?slug=${product.provider!.slug}&tab=products` as any)}
              style={{ marginTop: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 12 }}
            >
              <Ionicons name="storefront-outline" size={16} color="#6B7280" style={{ marginRight: 6 }} />
              <Text style={{ fontSize: 14, color: "#6B7280", fontWeight: "500" }}>
                More from {product.provider.business_name}
              </Text>
              <Ionicons name="chevron-forward" size={16} color="#6B7280" />
            </TouchableOpacity>
          ) : null}
        </View>
      </ScrollView>
    </>
  );
}
