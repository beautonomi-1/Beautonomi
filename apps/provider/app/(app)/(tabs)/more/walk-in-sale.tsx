import { useCallback, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Alert,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ActionButton } from "@/components/ui/ActionButton";

interface Product {
  id: string;
  name: string;
  retail_price: number;
  quantity?: number;
  is_active?: boolean;
}

interface ProductsResponse {
  products?: Product[];
}

interface SaleItem {
  product_name: string;
  quantity: number;
  unit_price: number;
}

interface WalkInSale {
  id: string;
  order_number: string;
  total_amount: number | string;
  payment_method: string;
  customer_name?: string | null;
  created_at: string;
  product_order_items?: SaleItem[];
  items?: SaleItem[];
}

interface SalesResponse {
  sales: WalkInSale[];
  total: number;
}

export default function WalkInSaleScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [cart, setCart] = useState<{ product_id: string; name: string; price: number; quantity: number }[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "yoco">("cash");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");

  const { data: productsData, loading: loadingProducts } = useApi<ProductsResponse>(
    "/api/provider/products?limit=200"
  );
  const { data: salesData, loading: loadingSales, error, refresh } = useApi<SalesResponse>(
    "/api/provider/product-sales?limit=30"
  );
  const { execute: postSale, loading: creating } = useApiMutation<{ order: WalkInSale }>("post");

  const products: Product[] = productsData?.products ?? [];
  const activeProducts = products.filter((p) => p.is_active !== false);
  const sales = salesData?.sales ?? [];
  const totalSales = salesData?.total ?? 0;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const addToCart = useCallback((p: Product) => {
    const qty = Number(p.quantity ?? 0);
    if (qty < 1) {
      Alert.alert("Out of stock", `${p.name} has no stock.`);
      return;
    }
    setCart((prev) => {
      const existing = prev.find((c) => c.product_id === p.id);
      if (existing) {
        if (existing.quantity >= qty) return prev;
        return prev.map((c) =>
          c.product_id === p.id ? { ...c, quantity: c.quantity + 1 } : c
        );
      }
      return [...prev, { product_id: p.id, name: p.name, price: Number(p.retail_price), quantity: 1 }];
    });
  }, []);

  const updateCartQty = useCallback((productId: string, delta: number) => {
    setCart((prev) => {
      const item = prev.find((c) => c.product_id === productId);
      if (!item) return prev;
      const newQty = item.quantity + delta;
      if (newQty <= 0) return prev.filter((c) => c.product_id !== productId);
      return prev.map((c) =>
        c.product_id === productId ? { ...c, quantity: newQty } : c
      );
    });
  }, []);

  const cartTotal = cart.reduce((sum, c) => sum + c.price * c.quantity, 0);

  const handleCompleteSale = useCallback(async () => {
    if (cart.length === 0) {
      Alert.alert("Empty cart", "Add at least one product.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const items = cart.map((c) => ({ product_id: c.product_id, quantity: c.quantity }));
    const { error: err } = await postSale("/api/provider/product-sales", {
      items,
      payment_method: paymentMethod,
      customer_name: customerName.trim() || undefined,
      customer_phone: customerPhone.trim() || undefined,
    });
    if (err) {
      Alert.alert("Error", err);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCreateOpen(false);
    setCart([]);
    setCustomerName("");
    setCustomerPhone("");
    setPaymentMethod("cash");
    refresh();
  }, [cart, paymentMethod, customerName, customerPhone, postSale, refresh]);

  if (loadingSales && !salesData) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Walk-in Sale" showBack />
        <View className="flex-1 items-center justify-center py-12">
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !salesData) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Walk-in Sale" showBack />
        <View className="flex-1 justify-center px-4">
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title="Walk-in Sale"
        showBack
        subtitle="Sell in-person (cash/Yoco)"
        rightAction={
          <TouchableOpacity
            onPress={() => {
              setCart([]);
              setCustomerName("");
              setCustomerPhone("");
              setPaymentMethod("cash");
              setCreateOpen(true);
            }}
            className="flex-row items-center rounded-xl bg-amber-500 px-4 py-2"
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text className="ml-1.5 text-sm font-semibold text-white">New sale</Text>
          </TouchableOpacity>
        }
      />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        <View className="mb-3 flex-row items-center justify-between">
          <Text className="text-sm font-medium text-gray-500">Recent walk-in sales</Text>
          {totalSales > 0 && (
            <Text className="text-sm text-gray-500">{totalSales} total</Text>
          )}
        </View>
        {sales.length === 0 ? (
          <View className="items-center rounded-2xl border border-gray-100 bg-gray-50/50 p-8">
            <View className="mb-3 h-14 w-14 items-center justify-center rounded-full bg-amber-100">
              <Ionicons name="storefront-outline" size={28} color="#f59e0b" />
            </View>
            <Text className="text-center font-medium text-gray-900">No walk-in sales yet</Text>
            <Text className="mt-1 text-center text-sm text-gray-500">
              Tap &quot;New sale&quot; to record a cash or Yoco sale.
            </Text>
          </View>
        ) : (
          sales.slice(0, 20).map((sale) => (
            <View
              key={sale.id}
              className="mb-3 flex-row items-center rounded-2xl border border-gray-200 bg-white p-4"
            >
              <View className="h-10 w-10 items-center justify-center rounded-xl bg-amber-100">
                <Ionicons name="receipt-outline" size={20} color="#f59e0b" />
              </View>
              <View className="ml-3 flex-1 min-w-0">
                <Text className="font-semibold text-gray-900">{sale.order_number}</Text>
                <Text className="mt-0.5 text-sm text-gray-600">
                  R {Number(sale.total_amount).toFixed(2)} · {sale.payment_method}
                </Text>
                <Text className="mt-0.5 text-xs text-gray-500">
                  {new Date(sale.created_at).toLocaleDateString()}
                </Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <BottomSheet
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New walk-in sale"
        subtitle="Add products and complete payment"
      >
        {loadingProducts ? (
          <LoadingState />
        ) : (
          <>
            <Text className="mb-2 text-sm font-medium text-gray-700">Products</Text>
            <ScrollView className="mb-4 max-h-48 rounded-xl border border-gray-200 bg-gray-50" nestedScrollEnabled>
              {activeProducts.length === 0 ? (
                <Text className="p-4 text-sm text-gray-500">No active products. Add products first.</Text>
              ) : (
                activeProducts.map((p) => {
                  const inCart = cart.find((c) => c.product_id === p.id);
                  const stock = Number(p.quantity ?? 0);
                  return (
                    <TouchableOpacity
                      key={p.id}
                      onPress={() => addToCart(p)}
                      disabled={stock < 1}
                      className="flex-row items-center justify-between border-b border-gray-100 px-4 py-3 last:border-b-0"
                    >
                      <View className="flex-1 min-w-0">
                        <Text className="font-medium text-gray-900" numberOfLines={1}>
                          {p.name}
                        </Text>
                        <Text className="text-sm text-gray-600">
                          R {Number(p.retail_price).toFixed(2)}
                          {stock >= 0 && ` · ${stock} in stock`}
                        </Text>
                      </View>
                      {inCart ? (
                        <View className="flex-row items-center gap-2">
                          <TouchableOpacity
                            onPress={() => updateCartQty(p.id, -1)}
                            className="h-8 w-8 items-center justify-center rounded-lg bg-gray-200"
                          >
                            <Ionicons name="remove" size={18} color="#374151" />
                          </TouchableOpacity>
                          <Text className="min-w-[24px] text-center font-medium">{inCart.quantity}</Text>
                          <TouchableOpacity
                            onPress={() => updateCartQty(p.id, 1)}
                            disabled={inCart.quantity >= stock}
                            className="h-8 w-8 items-center justify-center rounded-lg bg-amber-500"
                          >
                            <Ionicons name="add" size={18} color="#fff" />
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <TouchableOpacity
                          onPress={() => addToCart(p)}
                          disabled={stock < 1}
                          className="rounded-lg bg-amber-500 px-3 py-1.5"
                        >
                          <Text className="text-sm font-medium text-white">Add</Text>
                        </TouchableOpacity>
                      )}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>

            {cart.length > 0 && (
              <>
                <Text className="mb-2 text-sm font-medium text-gray-700">Cart</Text>
                <View className="mb-3 rounded-xl border border-gray-200 bg-white p-3">
                  {cart.map((c) => (
                    <View key={c.product_id} className="flex-row justify-between py-1">
                      <Text className="text-sm text-gray-900" numberOfLines={1}>
                        {c.name} × {c.quantity}
                      </Text>
                      <Text className="text-sm font-medium text-gray-700">
                        R {(c.price * c.quantity).toFixed(2)}
                      </Text>
                    </View>
                  ))}
                  <View className="mt-2 border-t border-gray-100 pt-2 flex-row justify-between">
                    <Text className="font-semibold text-gray-900">Total</Text>
                    <Text className="font-semibold text-gray-900">R {cartTotal.toFixed(2)}</Text>
                  </View>
                </View>

                <Text className="mb-2 text-sm font-medium text-gray-700">Payment</Text>
                <View className="mb-4 flex-row gap-2">
                  <TouchableOpacity
                    onPress={() => setPaymentMethod("cash")}
                    className={`flex-1 rounded-xl py-2.5 ${paymentMethod === "cash" ? "bg-amber-500" : "bg-gray-100"}`}
                  >
                    <Text
                      className={`text-center text-sm font-medium ${paymentMethod === "cash" ? "text-white" : "text-gray-700"}`}
                    >
                      Cash
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setPaymentMethod("yoco")}
                    className={`flex-1 rounded-xl py-2.5 ${paymentMethod === "yoco" ? "bg-amber-500" : "bg-gray-100"}`}
                  >
                    <Text
                      className={`text-center text-sm font-medium ${paymentMethod === "yoco" ? "text-white" : "text-gray-700"}`}
                    >
                      Yoco
                    </Text>
                  </TouchableOpacity>
                </View>

                <Text className="mb-1 text-sm font-medium text-gray-700">Customer (optional)</Text>
                <TextInput
                  className="mb-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-base text-gray-900"
                  placeholder="Name"
                  placeholderTextColor="#9ca3af"
                  value={customerName}
                  onChangeText={setCustomerName}
                />
                <TextInput
                  className="mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-base text-gray-900"
                  placeholder="Phone"
                  placeholderTextColor="#9ca3af"
                  value={customerPhone}
                  onChangeText={setCustomerPhone}
                  keyboardType="phone-pad"
                />

                <ActionButton
                  label={creating ? "Completing…" : `Complete sale · R ${cartTotal.toFixed(2)}`}
                  onPress={handleCompleteSale}
                  loading={creating}
                  fullWidth
                />
              </>
            )}

            {cart.length === 0 && (
              <Text className="text-center text-sm text-gray-500">Add products above to continue.</Text>
            )}
          </>
        )}
      </BottomSheet>
    </ScreenContainer>
  );
}
