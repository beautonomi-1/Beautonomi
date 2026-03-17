import { useEffect, useState, useCallback } from "react";
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
import { Stack, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/providers/AuthProvider";
import { useResponsive } from "@/hooks/useResponsive";
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";
import { Colors, Shadows } from "@/constants/colors";
import { haptic } from "@/lib/haptics";
import { APP_URL } from "@/config/public-env";
import { emitCartUpdated } from "@/lib/cart-events";
import type { CartItem } from "@/types/api";

function variantLabel(item: CartItem): string {
  const ov = item.product_variant?.option_values;
  if (!ov || Object.keys(ov).length === 0) return "";
  return Object.values(ov).join(", ");
}

function linePrice(item: CartItem): number {
  return (item.effective_price ?? item.product?.retail_price ?? 0) * item.quantity;
}

export default function CartScreen() {
  const { user } = useAuth();
  const { contentPadding, contentMaxWidth, isTablet } = useResponsive();
  const [items, setItems] = useState<CartItem[]>([]);
  const constraint = (isTablet || Platform.OS === "web") ? { maxWidth: Math.min(600, contentMaxWidth), alignSelf: "center" as const, width: "100%" as const } : {};
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchCart = useCallback(async (isRefresh = false) => {
    if (!user) {
      setItems([]);
      setLoading(false);
      return;
    }
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await api.get<{ items: CartItem[] }>("/api/me/cart");
      const data = res.data as { items?: CartItem[] } | null;
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    fetchCart();
  }, [fetchCart]);

  const updateQuantity = useCallback(async (itemId: string, newQty: number) => {
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
    try {
      const res = await api.patch<{ item: CartItem }>(`/api/me/cart/${itemId}`, { quantity: newQty });
      if (res.error) {
        Alert.alert("Error", getApiErrorMessage(res.error, "Could not update quantity."));
      } else {
        setItems((prev) =>
          prev.map((i) => (i.id === itemId ? { ...i, quantity: newQty } : i)),
        );
        emitCartUpdated();
      }
    } catch {
      Alert.alert("Error", "Something went wrong.");
    } finally {
      setUpdatingId(null);
    }
  }, [items]);

  const removeItem = useCallback(async (itemId: string) => {
    setRemovingId(itemId);
    haptic.light();
    try {
      const res = await api.delete(`/api/me/cart/${itemId}`);
      if (res.error) {
        Alert.alert("Error", getApiErrorMessage(res.error, "Could not remove item."));
      } else {
        setItems((prev) => prev.filter((i) => i.id !== itemId));
        emitCartUpdated();
      }
    } catch {
      Alert.alert("Error", "Something went wrong.");
    } finally {
      setRemovingId(null);
    }
  }, []);

  const openCheckout = useCallback(() => {
    haptic.medium();
    const url = `${APP_URL}/cart`;
    router.push({
      pathname: "/(app)/in-app-browser",
      params: { url: encodeURIComponent(url), title: "Cart" },
    });
  }, []);

  if (!user) {
    return (
      <>
        <Stack.Screen options={{ title: "Cart", headerShown: true }} />
        <View style={{ flex: 1, backgroundColor: "#fff", padding: contentPadding, justifyContent: "center", alignItems: "center" }}>
          <Ionicons name="cart-outline" size={56} color="#D1D5DB" />
          <Text style={{ fontSize: 16, color: "#6B7280", marginTop: 12, textAlign: "center" }}>
            Sign in to view your cart
          </Text>
          <TouchableOpacity
            onPress={() => router.replace("/(auth)/login" as any)}
            style={{ marginTop: 20, paddingVertical: 12, paddingHorizontal: 24, backgroundColor: Colors.primary, borderRadius: 12 }}
          >
            <Text style={{ color: "#fff", fontWeight: "600" }}>Sign in</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }

  if (loading && items.length === 0) {
    return (
      <>
        <Stack.Screen options={{ title: "Cart", headerShown: true }} />
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#fff" }}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </>
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

  return (
    <>
      <Stack.Screen options={{ title: "Cart", headerShown: true }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: "#F9FAFB" }}
        contentContainerStyle={{ paddingBottom: 120, ...constraint }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchCart(true)} colors={[Colors.primary]} />}
      >
        {items.length === 0 ? (
          <View style={{ padding: contentPadding * 2, alignItems: "center" }}>
            <Ionicons name="cart-outline" size={56} color="#D1D5DB" />
            <Text style={{ fontSize: 16, color: "#6B7280", marginTop: 12, textAlign: "center" }}>
              Your cart is empty
            </Text>
            <TouchableOpacity
              onPress={() => router.back()}
              style={{ marginTop: 20, paddingVertical: 12, paddingHorizontal: 24, backgroundColor: Colors.primary, borderRadius: 12 }}
            >
              <Text style={{ color: "#fff", fontWeight: "600" }}>Continue shopping</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ padding: contentPadding }}>
            {Object.values(groups).map((g) => (
              <View key={g.provider.id} style={{ marginBottom: 20 }}>
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: "#374151" }}>{g.provider.business_name}</Text>
                </View>
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
                            R{(item.effective_price ?? item.product?.retail_price ?? 0).toFixed(2)} each · R{linePrice(item).toFixed(2)} total
                          </Text>
                          {!item.in_stock && (
                            <Text style={{ fontSize: 11, color: "#EF4444", marginTop: 2 }}>Low stock</Text>
                          )}
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
                  Subtotal: R{g.subtotal.toFixed(2)}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    haptic.medium();
                    router.push({
                      pathname: "/(app)/product-checkout",
                      params: { provider_id: g.provider.id },
                    } as any);
                  }}
                  style={{ marginTop: 12, backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center" }}
                >
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>Checkout — R{g.subtotal.toFixed(2)}</Text>
                </TouchableOpacity>
              </View>
            ))}

            <View style={{ backgroundColor: "#fff", borderRadius: 12, padding: contentPadding, marginTop: 8, ...Shadows.cardSmall }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontSize: 16, fontWeight: "700", color: "#111827" }}>Total</Text>
                <Text style={{ fontSize: 18, fontWeight: "700", color: Colors.primary }}>R{total.toFixed(2)}</Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {items.length > 0 && (
        <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: contentPadding, paddingBottom: 34, backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#E5E7EB" }}>
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
