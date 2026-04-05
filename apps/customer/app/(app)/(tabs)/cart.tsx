import { useEffect, useState, useCallback, useRef, useMemo, useLayoutEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { Image } from "expo-image";
import { router, useNavigation } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useResponsive } from "@/hooks/useResponsive";
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";
import { Colors, Shadows } from "@/constants/colors";
import { haptic } from "@/lib/haptics";
import { APP_URL } from "@/config/public-env";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";
import { formatMoney } from "@beautonomi/utils";
import type { CartItem } from "@/types/api";
import { useCart } from "@/features/shop/useCart";

interface ProviderShippingConfig {
  offers_delivery: boolean;
  offers_collection: boolean;
}

function useProviderShippingConfigs(providerIds: string[]) {
  const [configs, setConfigs] = useState<Record<string, ProviderShippingConfig>>({});
  const fetchedRef = useRef<Set<string>>(new Set());
  const providerIdsKey = useMemo(() => providerIds.join(","), [providerIds]);

  useEffect(() => {
    const toFetch = providerIds.filter((id) => id && id !== "unknown" && !fetchedRef.current.has(id));
    if (toFetch.length === 0) return;
    toFetch.forEach((id) => fetchedRef.current.add(id));
    Promise.allSettled(
      toFetch.map((id) =>
        api.get<{ data?: { shipping?: ProviderShippingConfig }; shipping?: ProviderShippingConfig }>(
          `/api/public/products/shipping-config?provider_id=${id}`,
        ).then((res) => {
          const raw = res.data as any;
          const sc: ProviderShippingConfig | null =
            raw?.shipping ?? raw?.data?.shipping ?? null;
          if (sc) setConfigs((prev) => ({ ...prev, [id]: sc }));
        }),
      ),
    );
  }, [providerIds, providerIdsKey]);

  return configs;
}

function variantLabel(item: CartItem): string {
  const ov = item.product_variant?.option_values;
  if (!ov || Object.keys(ov).length === 0) return "";
  return Object.values(ov).join(", ");
}

function linePrice(item: CartItem): number {
  return (item.effective_price ?? item.product?.retail_price ?? 0) * item.quantity;
}

export default function CartScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { contentPadding, contentMaxWidth, isTablet } = useResponsive();
  const {
    items,
    loading,
    error: cartError,
    fromCache,
    fetchCart,
    updateQuantity: patchCartQuantity,
    removeItem: removeCartLine,
    isGuestCart,
  } = useCart();
  const constraint = (isTablet || Platform.OS === "web") ? { maxWidth: Math.min(600, contentMaxWidth), alignSelf: "center" as const, width: "100%" as const } : {};
  const [refreshing, setRefreshing] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const totalQty = useMemo(
    () => items.reduce((sum, i) => sum + i.quantity, 0),
    [items],
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      title: totalQty > 0 ? `Cart (${totalQty})` : "Cart",
      headerShown: true,
    });
  }, [navigation, totalQty]);

  // Derive provider IDs from items to pre-fetch shipping configs
  const providerIds = useMemo(
    () => [...new Set(items.map((i) => i.provider?.id).filter(Boolean) as string[])],
    [items],
  );
  const shippingConfigs = useProviderShippingConfigs(providerIds);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchCart();
    setRefreshing(false);
  }, [fetchCart]);

  const updateQuantity = useCallback(
    async (itemId: string, newQty: number) => {
      if (newQty < 1) return;
      const item = items.find((i) => i.id === itemId);
      if (!item) return;
      const maxQty = item.stock_available ?? 999;
      if (newQty > maxQty) {
        Alert.alert("Limited stock", `Only ${maxQty} available.`);
        return;
      }
      setUpdatingId(itemId);
      haptic.light();
      const { error: err } = await patchCartQuantity(itemId, newQty);
      if (err) Alert.alert("Error", err);
      setUpdatingId(null);
    },
    [items, patchCartQuantity],
  );

  const removeItem = useCallback(
    async (itemId: string) => {
      setRemovingId(itemId);
      haptic.light();
      const { error: err } = await removeCartLine(itemId);
      if (err) Alert.alert("Error", err);
      setRemovingId(null);
    },
    [removeCartLine],
  );

  const signInForCheckout = useCallback((providerId: string) => {
    haptic.medium();
    router.push({
      pathname: "/(auth)/login",
      params: {
        return_to: `/(app)/(tabs)/shop/product-checkout?provider_id=${encodeURIComponent(providerId)}`,
      },
    } as any);
  }, []);

  const openCheckout = useCallback(() => {
    haptic.medium();
    const url = `${APP_URL}/cart`;
    router.push({
      pathname: "/(app)/in-app-browser",
      params: { url: encodeURIComponent(url), title: "Cart" },
    });
  }, []);

  if (loading && items.length === 0) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#fff" }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  const groups: Record<string, { provider: CartItem["provider"]; items: CartItem[]; subtotal: number }> = {};
  items.forEach((item) => {
    const pid = item.provider?.id ?? "unknown";
    if (!groups[pid]) groups[pid] = { provider: item.provider, items: [], subtotal: 0 };
    groups[pid].items.push(item);
    groups[pid].subtotal += linePrice(item);
  });
  const total = items.reduce((sum, i) => sum + linePrice(i), 0);
  const fb = getTenantDefaultCurrency();
  const fmt = (amount: number) => formatMoney(amount, fb);

  const bottomChromePadding = 12 + insets.bottom;
  const scrollBottomPadding = 88 + bottomChromePadding;

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: "#F9FAFB" }}
        contentContainerStyle={{ paddingBottom: scrollBottomPadding, ...constraint }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />}
      >
        {cartError ? (
          <View style={{ padding: contentPadding, marginBottom: 8 }}>
            <View
              style={{
                backgroundColor: fromCache ? "#FFFBEB" : "#FEF2F2",
                borderRadius: 12,
                padding: 12,
                borderWidth: 1,
                borderColor: fromCache ? "#FDE68A" : "#FECACA",
              }}
            >
              <Text style={{ fontSize: 13, color: fromCache ? "#92400E" : "#991B1B" }}>
                {fromCache ? `${cartError} Showing saved cart.` : cartError}
              </Text>
            </View>
          </View>
        ) : null}
        {isGuestCart && items.length > 0 ? (
          <View
            style={{
              marginHorizontal: contentPadding,
              marginTop: 12,
              marginBottom: 4,
              padding: 14,
              backgroundColor: "#EFF6FF",
              borderRadius: 12,
              borderWidth: 1,
              borderColor: "#BFDBFE",
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: "600", color: "#1E40AF" }}>Browsing as a guest</Text>
            <Text style={{ fontSize: 13, color: "#1E3A8A", marginTop: 4, lineHeight: 18 }}>
              Your cart is saved on this device. Sign in to sync it everywhere and complete checkout.
            </Text>
            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: "/(auth)/login",
                  params: { return_to: "/(app)/(tabs)/cart" },
                } as any)
              }
              style={{
                alignSelf: "flex-start",
                marginTop: 10,
                paddingVertical: 8,
                paddingHorizontal: 16,
                backgroundColor: Colors.primary,
                borderRadius: 10,
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>Sign in</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        {items.length === 0 ? (
          <View style={{ padding: contentPadding * 2, alignItems: "center" }}>
            <Ionicons name="cart-outline" size={56} color="#D1D5DB" />
            <Text style={{ fontSize: 18, fontWeight: "700", color: "#111827", marginTop: 16 }}>Your cart is empty</Text>
            <Text style={{ fontSize: 14, color: "#6B7280", marginTop: 8, textAlign: "center" }}>
              Browse providers and add products to get started.
            </Text>
            <TouchableOpacity
              onPress={() => router.push("/(app)/(tabs)/explore" as any)}
              style={{ marginTop: 24, paddingVertical: 14, paddingHorizontal: 32, backgroundColor: Colors.primary, borderRadius: 12 }}
            >
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>Browse products</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push("/(app)/product-orders" as any)}
              style={{ marginTop: 12, paddingVertical: 10 }}
            >
              <Text style={{ fontSize: 14, color: Colors.primary, fontWeight: "500" }}>View my orders</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ padding: contentPadding }}>
            {Object.values(groups).map((g) => {
              const sc = shippingConfigs[g.provider.id];
              const isPickupOnly = sc ? (sc.offers_collection && !sc.offers_delivery) : false;
              return (
              <View key={g.provider.id} style={{ marginBottom: 20 }}>
                {/* Provider header with fulfillment badge */}
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: isPickupOnly ? 8 : 10 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: "#374151", flex: 1 }}>{g.provider.business_name}</Text>
                  {isPickupOnly && (
                    <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#FFF7ED", borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: "#FED7AA" }}>
                      <Ionicons name="storefront-outline" size={12} color="#C2410C" style={{ marginRight: 4 }} />
                      <Text style={{ fontSize: 11, fontWeight: "700", color: "#C2410C" }}>Pickup only</Text>
                    </View>
                  )}
                  {sc && !isPickupOnly && sc.offers_delivery && (
                    <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#EFF6FF", borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4 }}>
                      <Ionicons name="bicycle-outline" size={12} color="#1D4ED8" style={{ marginRight: 4 }} />
                      <Text style={{ fontSize: 11, fontWeight: "600", color: "#1D4ED8" }}>Delivery available</Text>
                    </View>
                  )}
                </View>
                {isPickupOnly && (
                  <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#FFF7ED", borderRadius: 10, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: "#FED7AA" }}>
                    <Ionicons name="information-circle-outline" size={15} color="#C2410C" style={{ marginRight: 8 }} />
                    <Text style={{ flex: 1, fontSize: 12, color: "#92400E", lineHeight: 17 }}>
                      In-store collection required. No delivery for this provider.
                    </Text>
                  </View>
                )}
                <View style={{ backgroundColor: "#fff", borderRadius: 12, overflow: "hidden", ...Shadows.cardSmall }}>
                  {g.items.map((item) => {
                    const label = variantLabel(item);
                    const removing = removingId === item.id;
                    const updating = updatingId === item.id;
                    const maxQty = item.stock_available ?? 999;
                    const imgUrl = item.product?.image_urls?.[0] ?? (item.product as { image_url?: string })?.image_url;
                    return (
                      <View
                        key={item.id}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          padding: 12,
                          borderBottomWidth: g.items.indexOf(item) < g.items.length - 1 ? 1 : 0,
                          borderBottomColor: "#F3F4F6",
                        }}
                      >
                        <View style={{ width: 56, height: 56, borderRadius: 8, backgroundColor: "#F3F4F6", overflow: "hidden" }}>
                          {imgUrl ? (
                            <Image source={{ uri: imgUrl }} style={{ width: 56, height: 56 }} contentFit="cover" />
                          ) : (
                            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                              <Ionicons name="cube-outline" size={24} color="#9CA3AF" />
                            </View>
                          )}
                        </View>
                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827" }} numberOfLines={2}>
                            {item.product?.name}
                            {label ? ` · ${label}` : ""}
                          </Text>
                          <Text style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>
                            {fmt(item.effective_price ?? item.product?.retail_price ?? 0)} each · {fmt(linePrice(item))} total
                          </Text>
                          {!item.in_stock ? (
                            <Text style={{ fontSize: 11, color: "#EF4444", fontWeight: "600", marginTop: 2 }}>Out of stock — remove before checkout</Text>
                          ) : item.stock_available != null && item.stock_available <= 5 ? (
                            <Text style={{ fontSize: 11, color: "#D97706", fontWeight: "600", marginTop: 2 }}>Only {item.stock_available} left</Text>
                          ) : null}
                          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8 }}>
                            <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 8 }}>
                              <TouchableOpacity
                                onPress={() => updateQuantity(item.id, item.quantity - 1)}
                                disabled={updating || item.quantity <= 1}
                                style={{ width: 32, height: 32, alignItems: "center", justifyContent: "center" }}
                              >
                                <Ionicons name="remove" size={18} color={item.quantity <= 1 ? "#D1D5DB" : "#374151"} />
                              </TouchableOpacity>
                              <Text style={{ minWidth: 28, fontSize: 14, fontWeight: "600", color: "#111827", textAlign: "center" }}>
                                {updating ? "…" : item.quantity}
                              </Text>
                              <TouchableOpacity
                                onPress={() => updateQuantity(item.id, item.quantity + 1)}
                                disabled={updating || item.quantity >= maxQty}
                                style={{ width: 32, height: 32, alignItems: "center", justifyContent: "center" }}
                              >
                                <Ionicons name="add" size={18} color={item.quantity >= maxQty ? "#D1D5DB" : "#374151"} />
                              </TouchableOpacity>
                            </View>
                          </View>
                        </View>
                        <TouchableOpacity
                          onPress={() => removeItem(item.id)}
                          disabled={removing}
                          style={{ padding: 8 }}
                          hitSlop={12}
                        >
                          {removing ? (
                            <ActivityIndicator size="small" color="#6B7280" />
                          ) : (
                            <Ionicons name="trash-outline" size={22} color="#6B7280" />
                          )}
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
                <Text style={{ fontSize: 13, color: "#6B7280", marginTop: 6, textAlign: "right" }}>
                  Subtotal: {fmt(g.subtotal)}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    if (isGuestCart) {
                      signInForCheckout(g.provider.id);
                      return;
                    }
                    haptic.medium();
                    router.push({
                      pathname: "/(app)/(tabs)/shop/product-checkout",
                      params: { provider_id: g.provider.id },
                    } as any);
                  }}
                  style={{ marginTop: 12, backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center" }}
                >
                  {isPickupOnly ? (
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <Ionicons name="storefront-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
                      <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>Checkout for pickup — {fmt(g.subtotal)}</Text>
                    </View>
                  ) : (
                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>Checkout — {fmt(g.subtotal)}</Text>
                  )}
                </TouchableOpacity>
              </View>
              );
            })}

            <View style={{ backgroundColor: "#fff", borderRadius: 12, padding: contentPadding, marginTop: 8, ...Shadows.cardSmall }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontSize: 16, fontWeight: "700", color: "#111827" }}>Total</Text>
                <Text style={{ fontSize: 18, fontWeight: "700", color: Colors.primary }}>{fmt(total)}</Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {items.length > 0 && (
        <View
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            padding: contentPadding,
            paddingBottom: bottomChromePadding,
            backgroundColor: "#fff",
            borderTopWidth: 1,
            borderTopColor: "#E5E7EB",
          }}
        >
          <TouchableOpacity
            onPress={openCheckout}
            style={{ paddingVertical: 10, alignItems: "center", flexDirection: "row", justifyContent: "center" }}
          >
            <Ionicons name="open-outline" size={16} color={Colors.primary} style={{ marginRight: 6 }} />
            <Text style={{ fontSize: 13, color: Colors.primary, fontWeight: "600" }}>Also checkout on web</Text>
          </TouchableOpacity>
        </View>
      )}
    </>
  );
}
