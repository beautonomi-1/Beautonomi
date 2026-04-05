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
import { useResponsive } from "@/hooks/useResponsive";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ActionButton } from "@/components/ui/ActionButton";
import { YocoPaymentSheet } from "@/components/YocoPaymentSheet";
import { E164PhoneField } from "@/components/E164PhoneField";
import { validateE164Phone } from "@/lib/phone-country-codes";
import { Colors } from "@/constants/colors";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";
import { formatCurrency } from "@/lib/format";

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

function formatDateSafe(value: unknown): string {
  if (typeof value !== "string" || !value) return "—";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "—";
  return parsed.toLocaleDateString();
}

export default function WalkInSaleScreen() {
  const tenantCurrency = getTenantDefaultCurrency();
  const { screenPadding } = useResponsive();
  const [refreshing, setRefreshing] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [cart, setCart] = useState<{ product_id: string; name: string; price: number; quantity: number }[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "yoco">("cash");
  const [customerName, setCustomerName] = useState("");
  const [customerPhoneE164, setCustomerPhoneE164] = useState("");
  const [showYocoPayment, setShowYocoPayment] = useState(false);

  const { data: productsData, loading: loadingProducts, refresh: refreshProducts } = useApi<ProductsResponse>(
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
    await Promise.all([refresh(), refreshProducts()]);
    setRefreshing(false);
  }, [refresh, refreshProducts]);

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

  const submitSale = useCallback(
    async (paymentRef?: string) => {
      const phoneErr = validateE164Phone(customerPhoneE164);
      if (phoneErr) {
        Alert.alert("Invalid phone", phoneErr);
        return;
      }
      const items = cart.map((c) => ({ product_id: c.product_id, quantity: c.quantity }));
      const { error: err } = await postSale("/api/provider/product-sales", {
        items,
        payment_method: paymentMethod,
        payment_reference: paymentRef,
        customer_name: customerName.trim() || undefined,
        customer_phone: customerPhoneE164.trim() || undefined,
      });
      if (err) {
        Alert.alert("Error", err);
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCreateOpen(false);
      setShowYocoPayment(false);
      setCart([]);
      setCustomerName("");
      setCustomerPhoneE164("");
      setPaymentMethod("cash");
      refresh();
    },
    [cart, paymentMethod, customerName, customerPhoneE164, postSale, refresh]
  );

  const handleCompleteSale = useCallback(async () => {
    if (cart.length === 0) {
      Alert.alert("Empty cart", "Add at least one product.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (paymentMethod === "yoco") {
      setShowYocoPayment(true);
      return;
    }
    await submitSale();
  }, [cart, paymentMethod, submitSale]);

  if (loadingSales && !salesData) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Walk-in Sale" showBack />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 48 }}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !salesData) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Walk-in Sale" showBack />
        <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 16 }}>
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
              setCustomerPhoneE164("");
              setPaymentMethod("cash");
              setCreateOpen(true);
            }}
            style={{ flexDirection: "row", alignItems: "center", borderRadius: 12, backgroundColor: "#f59e0b", paddingHorizontal: 16, paddingVertical: 8 }}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={{ marginLeft: 6, fontSize: 14, fontWeight: "600", color: Colors.white }}>New sale</Text>
          </TouchableOpacity>
        }
      />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: screenPadding, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={{ marginBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[500] }}>Recent walk-in sales</Text>
          {totalSales > 0 && (
            <Text style={{ fontSize: 14, color: Colors.gray[500] }}>{totalSales} total</Text>
          )}
        </View>
        {sales.length === 0 ? (
          <View style={{ alignItems: "center", borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[100], backgroundColor: "rgba(249,250,251,0.5)", padding: 32 }}>
            <View style={{ marginBottom: 12, height: 56, width: 56, alignItems: "center", justifyContent: "center", borderRadius: 9999, backgroundColor: "#fef3c7" }}>
              <Ionicons name="storefront-outline" size={28} color="#f59e0b" />
            </View>
            <Text style={{ textAlign: "center", fontWeight: "500", color: Colors.gray[900] }}>No walk-in sales yet</Text>
            <Text style={{ marginTop: 4, textAlign: "center", fontSize: 14, color: Colors.gray[500] }}>
              Tap &quot;New sale&quot; to record a cash or Yoco sale.
            </Text>
          </View>
        ) : (
          sales.slice(0, 20).map((sale) => (
            <View
              key={sale.id}
              style={{ marginBottom: 12, flexDirection: "row", alignItems: "center", borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, padding: 16 }}
            >
              <View style={{ height: 40, width: 40, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#fef3c7" }}>
                <Ionicons name="receipt-outline" size={20} color="#f59e0b" />
              </View>
              <View style={{ marginLeft: 12, flex: 1, minWidth: 0 }}>
                <Text style={{ fontWeight: "600", color: Colors.gray[900] }}>{sale.order_number}</Text>
                <Text style={{ marginTop: 2, fontSize: 14, color: Colors.gray[600] }}>
                  {formatCurrency(Number(sale.total_amount), tenantCurrency)} · {sale.payment_method}
                </Text>
                <Text style={{ marginTop: 2, fontSize: 12, color: Colors.gray[500] }}>
                  {formatDateSafe(sale.created_at)}
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
            <Text style={{ marginBottom: 8, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Products</Text>
            <ScrollView style={{ marginBottom: 16, maxHeight: 192, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50] }} nestedScrollEnabled>
              {activeProducts.length === 0 ? (
                <Text style={{ padding: 16, fontSize: 14, color: Colors.gray[500] }}>No active products. Add products first.</Text>
              ) : (
                activeProducts.map((p, idx) => {
                  const inCart = cart.find((c) => c.product_id === p.id);
                  const stock = Number(p.quantity ?? 0);
                  return (
                    <TouchableOpacity
                      key={p.id}
                      onPress={() => addToCart(p)}
                      disabled={stock < 1}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        borderBottomWidth: idx < activeProducts.length - 1 ? 1 : 0,
                        borderBottomColor: Colors.gray[100],
                        paddingHorizontal: 16,
                        paddingVertical: 12,
                      }}
                    >
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ fontWeight: "500", color: Colors.gray[900] }} numberOfLines={1}>
                          {p.name}
                        </Text>
                        <Text style={{ fontSize: 14, color: Colors.gray[600] }}>
                          {formatCurrency(Number(p.retail_price), tenantCurrency)}
                          {stock >= 0 && ` · ${stock} in stock`}
                        </Text>
                      </View>
                      {inCart ? (
                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                          <TouchableOpacity
                            onPress={() => updateCartQty(p.id, -1)}
                            style={{ height: 32, width: 32, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: Colors.gray[200], marginRight: 8 }}
                          >
                            <Ionicons name="remove" size={18} color="#374151" />
                          </TouchableOpacity>
                          <Text style={{ minWidth: 24, textAlign: "center", fontWeight: "500", marginRight: 8 }}>{inCart.quantity}</Text>
                          <TouchableOpacity
                            onPress={() => updateCartQty(p.id, 1)}
                            disabled={inCart.quantity >= stock}
                            style={{ height: 32, width: 32, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: "#f59e0b" }}
                          >
                            <Ionicons name="add" size={18} color="#fff" />
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <TouchableOpacity
                          onPress={() => addToCart(p)}
                          disabled={stock < 1}
                          style={{ borderRadius: 8, backgroundColor: "#f59e0b", paddingHorizontal: 12, paddingVertical: 6 }}
                        >
                          <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.white }}>Add</Text>
                        </TouchableOpacity>
                      )}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>

            {cart.length > 0 && (
              <>
                <Text style={{ marginBottom: 8, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Cart</Text>
                <View style={{ marginBottom: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, padding: 12 }}>
                  {cart.map((c) => (
                    <View key={c.product_id} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 }}>
                      <Text style={{ fontSize: 14, color: Colors.gray[900] }} numberOfLines={1}>
                        {c.name} × {c.quantity}
                      </Text>
                      <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>
                        {formatCurrency(c.price * c.quantity, tenantCurrency)}
                      </Text>
                    </View>
                  ))}
                  <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: Colors.gray[100], paddingTop: 8, flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ fontWeight: "600", color: Colors.gray[900] }}>Total</Text>
                    <Text style={{ fontWeight: "600", color: Colors.gray[900] }}>{formatCurrency(cartTotal, tenantCurrency)}</Text>
                  </View>
                </View>

                <Text style={{ marginBottom: 8, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Payment</Text>
                <View style={{ marginBottom: 16, flexDirection: "row" }}>
                  <TouchableOpacity
                    onPress={() => setPaymentMethod("cash")}
                    style={{ flex: 1, marginRight: 8, borderRadius: 12, paddingVertical: 10, backgroundColor: paymentMethod === "cash" ? "#f59e0b" : Colors.gray[100] }}
                  >
                    <Text style={{ textAlign: "center", fontSize: 14, fontWeight: "500", color: paymentMethod === "cash" ? Colors.white : Colors.gray[700] }}>
                      Cash
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setPaymentMethod("yoco")}
                    style={{ flex: 1, borderRadius: 12, paddingVertical: 10, backgroundColor: paymentMethod === "yoco" ? "#f59e0b" : Colors.gray[100] }}
                  >
                    <Text style={{ textAlign: "center", fontSize: 14, fontWeight: "500", color: paymentMethod === "yoco" ? Colors.white : Colors.gray[700] }}>
                      Yoco
                    </Text>
                  </TouchableOpacity>
                </View>

                <Text style={{ marginBottom: 4, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Customer (optional)</Text>
                <TextInput
                  style={{ marginBottom: 8, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 10, fontSize: 16, color: Colors.gray[900] }}
                  placeholder="Name"
                  placeholderTextColor="#9ca3af"
                  value={customerName}
                  onChangeText={setCustomerName}
                />
                <E164PhoneField
                  valueE164={customerPhoneE164}
                  onChangeE164={setCustomerPhoneE164}
                  compact
                  muted
                  accessibilityLabel="Customer phone"
                />

                <ActionButton
                  label={creating ? "Completing…" : `Complete sale · ${formatCurrency(cartTotal)}`}
                  onPress={handleCompleteSale}
                  loading={creating}
                  fullWidth
                />
              </>
            )}

            {cart.length === 0 && (
              <Text style={{ textAlign: "center", fontSize: 14, color: Colors.gray[500] }}>Add products above to continue.</Text>
            )}
          </>
        )}
      </BottomSheet>

      <YocoPaymentSheet
        visible={showYocoPayment}
        onClose={() => setShowYocoPayment(false)}
        amountCents={Math.round(cartTotal * 100)}
        currency={tenantCurrency}
        description="Walk-in sale"
        onPaymentSuccess={async (result) => {
          await submitSale(result.reference);
        }}
      />
    </ScreenContainer>
  );
}
