import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
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
import { emitCartUpdated } from "@/lib/cart-events";
import type { PublicProductVariant } from "@/types/api";

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
}

function formatVariantLabel(optionValues?: Record<string, string>): string {
  if (!optionValues || Object.keys(optionValues).length === 0) return "";
  return Object.values(optionValues).join(", ");
}

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { contentPadding } = useResponsive();
  const { width: screenWidth } = useWindowDimensions();

  const [data, setData] = useState<ProductDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addingToCart, setAddingToCart] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState<PublicProductVariant | null>(null);

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
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<ProductDetailResponse>(`/api/public/products/${encodeURIComponent(id)}`);
      if (res.error) {
        setError(getApiErrorMessage(res.error, "Product not found"));
        setData(null);
      } else {
        setData(res.data as ProductDetailResponse);
        const prod = (res.data as ProductDetailResponse)?.product;
        if (prod?.has_variants && Array.isArray(prod.variants) && prod.variants.length > 0) {
          const firstInStock = prod.variants.find((v) => (v.quantity ?? 0) > 0) ?? prod.variants[0];
          setSelectedVariant(firstInStock as PublicProductVariant);
        } else {
          setSelectedVariant(null);
        }
      }
    } catch (e) {
      setError(getApiErrorMessage(e, "Failed to load product"));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAddToCart = useCallback(async () => {
    if (!product || !user) {
      Alert.alert("Sign in required", "Please sign in to add items to your cart.");
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
    try {
      const res = await api.post("/api/me/cart", {
        product_id: product.id,
        product_variant_id: selectedVariantId ?? undefined,
        quantity: 1,
      });
      if (res.error) {
        haptic.error();
        Alert.alert("Error", getApiErrorMessage(res.error, "Could not add to cart."));
      } else {
        haptic.success();
        emitCartUpdated();
        Alert.alert("Added to cart", "Item added. View your cart or continue shopping.", [
          { text: "OK" },
          { text: "View cart", onPress: () => router.push("/(app)/cart" as any) },
        ]);
      }
    } catch {
      haptic.error();
      Alert.alert("Error", "Something went wrong. Please try again.");
    } finally {
      setAddingToCart(false);
    }
  }, [product, user, hasVariants, selectedVariantId, inStock]);

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
    return (
      <>
        <Stack.Screen options={{ title: "Product", headerShown: true }} />
        <View style={{ flex: 1, backgroundColor: "#fff", padding: contentPadding, justifyContent: "center", alignItems: "center" }}>
          <Ionicons name="alert-circle-outline" size={48} color="#9CA3AF" />
          <Text style={{ color: "#6B7280", marginTop: 12, textAlign: "center" }}>{error ?? "Product not found"}</Text>
          <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 20, paddingVertical: 12, paddingHorizontal: 24, backgroundColor: Colors.primary, borderRadius: 12 }}>
            <Text style={{ color: "#fff", fontWeight: "600" }}>Go back</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }

  const imageUri =
    selectedVariant?.image_url ??
    product.image_urls?.[0] ??
    (product as { image_url?: string }).image_url;

  return (
    <>
      <Stack.Screen
        options={{
          title: product.name,
          headerShown: true,
          headerBackTitle: "Back",
        }}
      />
      <ScrollView style={{ flex: 1, backgroundColor: "#fff" }} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <View style={{ width: screenWidth, aspectRatio: 1, backgroundColor: "#F3F4F6" }}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
          ) : (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="cube-outline" size={64} color="#D1D5DB" />
            </View>
          )}
          {!inStock && (
            <View style={{ position: "absolute", top: 12, right: 12, backgroundColor: "#EF4444", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>Sold out</Text>
            </View>
          )}
        </View>

        <View style={{ padding: contentPadding }}>
          {product.brand ? (
            <Text style={{ fontSize: 12, color: "#9CA3AF", fontWeight: "500", marginBottom: 4 }}>{product.brand}</Text>
          ) : null}
          <Text style={{ fontSize: 22, fontWeight: "700", color: "#111827" }}>{product.name}</Text>
          <Text style={{ fontSize: 20, fontWeight: "700", color: Colors.primary, marginTop: 8 }}>
            {product.currency} {Number(displayPrice).toFixed(2)}
          </Text>

          {hasVariants && (
            <View style={{ marginTop: 20 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827", marginBottom: 10 }}>Option</Text>
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
                      }}
                      style={{
                        paddingHorizontal: contentPadding,
                        paddingVertical: 10,
                        borderRadius: 12,
                        borderWidth: 2,
                        borderColor: isSelected ? Colors.primary : "#E5E7EB",
                        backgroundColor: isSelected ? Colors.primaryLight : "#fff",
                        opacity: outOfStock ? 0.6 : 1,
                        marginRight: 10,
                        marginBottom: 10,
                      }}
                      disabled={outOfStock}
                    >
                      <Text style={{ fontSize: 14, fontWeight: "600", color: isSelected ? Colors.primary : "#374151" }}>{label}</Text>
                      <Text style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>
                        {product.currency} {Number(v.retail_price).toFixed(2)}
                        {outOfStock ? " · Sold out" : ""}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {(product.short_description || product.description || product.long_description) && (
            <View style={{ marginTop: 20 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827", marginBottom: 8 }}>Description</Text>
              <Text style={{ fontSize: 14, color: "#374151", lineHeight: 22 }}>
                {product.short_description || product.description || product.long_description || ""}
              </Text>
            </View>
          )}

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
          >
            {addingToCart ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="cart-outline" size={22} color="#fff" style={{ marginRight: 8 }} />
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>
                  {inStock ? "Add to cart" : "Sold out"}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </>
  );
}
