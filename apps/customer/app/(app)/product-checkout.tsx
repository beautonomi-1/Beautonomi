import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Colors, Shadows } from "@/constants/colors";
import { useResponsive } from "@/hooks/useResponsive";
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";
import { useCart } from "@/features/shop/useCart";
import { useProductOrders } from "@/features/shop/useProductOrders";
import { useAuth } from "@/providers/AuthProvider";
import { trackProductCheckoutStarted, trackProductOrderPlaced } from "@/lib/analytics";

const PRIMARY = Colors.primary;

interface Address {
  id: string;
  label: string | null;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string | null;
  postal_code: string | null;
  is_default: boolean;
}

interface Location {
  id: string;
  name: string;
  address_line1: string;
  city: string;
  phone: string | null;
  working_hours: Record<string, unknown>;
}

interface ShippingConfig {
  offers_delivery: boolean;
  offers_collection: boolean;
  delivery_fee: number;
  free_delivery_threshold: number | null;
  estimated_delivery_days: number;
}

const contentConstraintStyle = (contentMaxWidth: number, isTablet: boolean) =>
  (isTablet || Platform.OS === "web") ? { maxWidth: Math.min(600, contentMaxWidth), alignSelf: "center" as const, width: "100%" as const } : {};

export default function ProductCheckoutScreen() {
  const router = useRouter();
  const { provider_id } = useLocalSearchParams<{ provider_id: string }>();
  const { contentMaxWidth, isTablet, contentPadding } = useResponsive();
  const constraintStyle = contentConstraintStyle(contentMaxWidth, isTablet);
  const cart = useCart();
  const orders = useProductOrders();
  const { user } = useAuth();

  const [fulfillment, setFulfillment] = useState<"collection" | "delivery">("collection");
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
  const [shippingConfig, setShippingConfig] = useState<ShippingConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"paystack" | "card_on_delivery">("paystack");
  const [useWallet, setUseWallet] = useState(false);
  const [walletBalance, setWalletBalance] = useState(0);
  const [platformFeeConfig, setPlatformFeeConfig] = useState<{
    type: string;
    percentage: number;
    fixed: number;
    show: boolean;
  }>({ type: "percentage", percentage: 5, fixed: 0, show: true });

  useEffect(() => {
    if (!provider_id) return;
    (async () => {
      setLoading(true);
      await cart.fetchCart();

      // Fetch addresses
      const addrRes = await api.get<{ addresses: Address[] } | Address[]>("/api/me/addresses");
      const addrData = addrRes.data;
      const addrList = Array.isArray(addrData) ? addrData : addrData?.addresses ?? [];
      setAddresses(addrList);
      const defaultAddr = addrList.find((a) => a.is_default);
      if (defaultAddr) setSelectedAddress(defaultAddr.id);

      // Fetch provider locations (public API by provider_id)
      const locRes = await api.get<{ data?: { locations?: Location[] }; locations?: Location[] }>(
        `/api/public/provider-locations?provider_id=${provider_id}`,
      );
      const locData = locRes.data;
      const locList = Array.isArray(locData)
        ? locData
        : (locData as any)?.locations ?? (locData as any)?.data?.locations ?? [];
      setLocations(locList);
      if (locList.length > 0) setSelectedLocation(locList[0].id);

      // Fetch shipping config (API returns { data: { shipping: config } })
      const shipRes = await api.get<{ data?: { shipping?: ShippingConfig }; shipping?: ShippingConfig }>(
        `/api/public/products/shipping-config?provider_id=${provider_id}`,
      );
      if (shipRes.data) {
        const raw = shipRes.data as any;
        const sc = raw?.shipping ?? raw?.data?.shipping ?? raw?.config ?? raw;
        if (sc && typeof sc === "object" && ("offers_delivery" in sc || "offers_collection" in sc))
          setShippingConfig(sc as ShippingConfig);
        if (!sc.offers_collection && sc.offers_delivery) setFulfillment("delivery");
      }

      // Track checkout started
      if (provider_id) {
        const cartGroup = cart.groupedByProvider[provider_id];
        trackProductCheckoutStarted(provider_id, cartGroup?.items.length ?? 0, cartGroup?.subtotal ?? 0);
      }

      // Fetch platform fee config
      const feeRes = await api.get<{
        platform_service_fee_type: string;
        platform_service_fee_percentage: number;
        platform_service_fee_fixed: number;
        show_service_fee_to_customer: boolean;
      }>("/api/public/platform-fees");
      if (feeRes.data) {
        setPlatformFeeConfig({
          type: (feeRes.data as any).platform_service_fee_type ?? "percentage",
          percentage: (feeRes.data as any).platform_service_fee_percentage ?? 5,
          fixed: (feeRes.data as any).platform_service_fee_fixed ?? 0,
          show: (feeRes.data as any).show_service_fee_to_customer !== false,
        });
      }

      // Fetch wallet balance (for "Use wallet" option)
      if (user) {
        try {
          const walletRes = await api.get<{ wallet: { balance: number } }>("/api/me/wallet");
          const w = (walletRes.data as any)?.wallet ?? walletRes.data;
          if (w?.balance != null) setWalletBalance(Number(w.balance) || 0);
        } catch {
          // ignore
        }
      }

      setLoading(false);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- load by provider_id only
  }, [provider_id]);

  const providerCart = provider_id ? cart.groupedByProvider[provider_id] : null;
  const subtotal = providerCart?.subtotal ?? 0;
  const deliveryFee =
    fulfillment === "delivery" && shippingConfig
      ? shippingConfig.free_delivery_threshold && subtotal >= shippingConfig.free_delivery_threshold
        ? 0
        : Number(shippingConfig.delivery_fee) || 0
      : 0;
  const platformFee =
    paymentMethod === "paystack"
      ? platformFeeConfig.type === "fixed"
        ? platformFeeConfig.fixed
        : Math.round(subtotal * platformFeeConfig.percentage) / 100
      : 0;
  const total = subtotal + deliveryFee + platformFee;

  const handlePlaceOrder = useCallback(async () => {
    if (!provider_id) return;
    if (fulfillment === "delivery" && !selectedAddress) {
      Alert.alert("Address Required", "Please select a delivery address");
      return;
    }
    if (fulfillment === "collection" && !selectedLocation) {
      Alert.alert("Location Required", "Please select a collection location");
      return;
    }

    setPlacing(true);

    // 1. Create the order (payment_status = "pending" or "paid" if wallet covers full amount)
    const result = await orders.createOrder({
      provider_id,
      fulfillment_type: fulfillment,
      delivery_address_id: fulfillment === "delivery" ? selectedAddress! : undefined,
      collection_location_id: fulfillment === "collection" ? selectedLocation! : undefined,
      payment_method: paymentMethod,
      use_wallet: paymentMethod === "paystack" ? useWallet : false,
    });

    if (result.error) {
      setPlacing(false);
      Alert.alert("Order Failed", getApiErrorMessage(result.error, "Your order could not be placed. Please try again."));
      return;
    }

    const order = result.data;
    const paidWithWallet = result.paid_with_wallet === true;
    const amountDue = result.amount_due ?? total;
    const customerEmail = user?.email;

    if (order) {
      trackProductOrderPlaced(order.id, order.order_number, total, paymentMethod, fulfillment);
    }

    // Paid fully with wallet – no Paystack
    if (paidWithWallet) {
      setPlacing(false);
      Alert.alert(
        "Order Placed!",
        `Your order ${order?.order_number} has been paid from your wallet.`,
        [{ text: "View Orders", onPress: () => router.replace("/product-orders" as any) }],
      );
      return;
    }

    // For card_on_delivery, no online payment needed
    if (paymentMethod === "card_on_delivery") {
      setPlacing(false);
      Alert.alert(
        "Order Placed!",
        `Your order ${order?.order_number} has been placed. Please have your card ready at delivery/collection.`,
        [{ text: "View Orders", onPress: () => router.replace("/product-orders" as any) }],
      );
      return;
    }

    if (!customerEmail || !order) {
      setPlacing(false);
      Alert.alert("Order Placed!", `Your order ${order?.order_number} has been placed. Payment pending.`, [
        { text: "View Orders", onPress: () => router.replace("/product-orders" as any) },
      ]);
      return;
    }

    // 2. Initialize Paystack payment for remaining amount (amount in kobo/cents)
    const paystackRes = await api.post<{ authorization_url: string; reference: string }>(
      "/api/paystack/initialize",
      {
        email: customerEmail,
        amount: Math.round(amountDue * 100),
        metadata: {
          product_order_id: order.id,
          order_number: order.order_number,
          type: "product_order",
        },
      },
    );

    setPlacing(false);

    if (paystackRes.error || !paystackRes.data?.authorization_url) {
      Alert.alert(
        "Order Created",
        `Your order ${order.order_number} was placed but payment could not be initialized. You can pay later from your orders.`,
        [{ text: "View Orders", onPress: () => router.replace("/product-orders" as any) }],
      );
      return;
    }

    // 3. Open Paystack payment page (in-app browser on native so user stays in app)
    const url = paystackRes.data.authorization_url;
    if (Platform.OS === "web") {
      window.location.href = url;
    } else {
      router.push({
        pathname: "/(app)/in-app-browser",
        params: { url: encodeURIComponent(url), title: "Complete payment" },
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- orders/paymentMethod from context
  }, [provider_id, fulfillment, selectedAddress, selectedLocation, orders.createOrder, router, user, total, useWallet]);

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" }}>
        <ActivityIndicator size="large" color={PRIMARY} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F9FAFB" }} edges={["top"]}>
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: contentPadding,
          paddingVertical: 14,
          backgroundColor: "#fff",
          borderBottomWidth: 1,
          borderBottomColor: "#F3F4F6",
        }}
      >
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12 }}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: 20, fontWeight: "700", color: "#111827" }}>Checkout</Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: contentPadding,
          paddingBottom: 120,
          ...constraintStyle,
        }}
      >
        {/* Fulfillment type */}
        <View style={{ backgroundColor: "#fff", padding: contentPadding, marginBottom: 12 }}>
          <Text style={{ fontSize: 16, fontWeight: "700", color: "#111827", marginBottom: 14 }}>
            How would you like to receive your order?
          </Text>
          <View style={{ flexDirection: "row" }}>
            {shippingConfig?.offers_collection !== false && (
              <TouchableOpacity
                onPress={() => setFulfillment("collection")}
                style={{
                  flex: 1,
                  padding: contentPadding,
                  borderRadius: 14,
                  borderWidth: 2,
                  borderColor: fulfillment === "collection" ? PRIMARY : "#E5E7EB",
                  backgroundColor: fulfillment === "collection" ? "rgba(255,0,119,0.04)" : "#fff",
                  alignItems: "center",
                  marginRight: 12,
                }}
              >
                <Ionicons
                  name="storefront-outline"
                  size={28}
                  color={fulfillment === "collection" ? PRIMARY : "#9CA3AF"}
                />
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: fulfillment === "collection" ? PRIMARY : "#374151",
                    marginTop: 8,
                  }}
                >
                  Collection
                </Text>
                <Text style={{ fontSize: 11, color: "#9CA3AF", marginTop: 4 }}>Free</Text>
              </TouchableOpacity>
            )}
            {shippingConfig?.offers_delivery && (
              <TouchableOpacity
                onPress={() => setFulfillment("delivery")}
                style={{
                  flex: 1,
                  padding: contentPadding,
                  borderRadius: 14,
                  borderWidth: 2,
                  borderColor: fulfillment === "delivery" ? PRIMARY : "#E5E7EB",
                  backgroundColor: fulfillment === "delivery" ? "rgba(255,0,119,0.04)" : "#fff",
                  alignItems: "center",
                }}
              >
                <Ionicons
                  name="bicycle-outline"
                  size={28}
                  color={fulfillment === "delivery" ? PRIMARY : "#9CA3AF"}
                />
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: fulfillment === "delivery" ? PRIMARY : "#374151",
                    marginTop: 8,
                  }}
                >
                  Delivery
                </Text>
                <Text style={{ fontSize: 11, color: "#9CA3AF", marginTop: 4 }}>
                  {deliveryFee === 0 ? "Free" : `R${deliveryFee.toFixed(2)}`}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Collection location */}
        {fulfillment === "collection" && locations.length > 0 && (
          <View style={{ backgroundColor: "#fff", padding: contentPadding, marginBottom: 12 }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: "#111827", marginBottom: 14 }}>
              Collection Point
            </Text>
            {locations.map((loc) => (
              <TouchableOpacity
                key={loc.id}
                onPress={() => setSelectedLocation(loc.id)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  padding: 14,
                  borderRadius: 12,
                  borderWidth: 1.5,
                  borderColor: selectedLocation === loc.id ? PRIMARY : "#E5E7EB",
                  marginBottom: 8,
                  backgroundColor: selectedLocation === loc.id ? "rgba(255,0,119,0.04)" : "#fff",
                }}
              >
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    borderWidth: 2,
                    borderColor: selectedLocation === loc.id ? PRIMARY : "#D1D5DB",
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: 12,
                  }}
                >
                  {selectedLocation === loc.id && (
                    <View
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: 6,
                        backgroundColor: PRIMARY,
                      }}
                    />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827" }}>{loc.name}</Text>
                  <Text style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>
                    {loc.address_line1}, {loc.city}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Delivery address */}
        {fulfillment === "delivery" && (
          <View style={{ backgroundColor: "#fff", padding: contentPadding, marginBottom: 12 }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: "#111827", marginBottom: 14 }}>
              Delivery Address
            </Text>
            {addresses.length === 0 ? (
              <View style={{ alignItems: "center", padding: contentPadding }}>
                <Text style={{ fontSize: 14, color: "#6B7280", marginBottom: 12 }}>No addresses saved</Text>
                <TouchableOpacity
                  onPress={() => router.push("/account-settings/addresses" as any)}
                  style={{ paddingHorizontal: contentPadding, paddingVertical: 10, borderRadius: 10, backgroundColor: PRIMARY }}
                >
                  <Text style={{ color: "#fff", fontWeight: "600" }}>Add Address</Text>
                </TouchableOpacity>
              </View>
            ) : (
              addresses.map((addr) => (
                <TouchableOpacity
                  key={addr.id}
                  onPress={() => setSelectedAddress(addr.id)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    padding: 14,
                    borderRadius: 12,
                    borderWidth: 1.5,
                    borderColor: selectedAddress === addr.id ? PRIMARY : "#E5E7EB",
                    marginBottom: 8,
                    backgroundColor: selectedAddress === addr.id ? "rgba(255,0,119,0.04)" : "#fff",
                  }}
                >
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      borderWidth: 2,
                      borderColor: selectedAddress === addr.id ? PRIMARY : "#D1D5DB",
                      alignItems: "center",
                      justifyContent: "center",
                      marginRight: 12,
                    }}
                  >
                    {selectedAddress === addr.id && (
                      <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: PRIMARY }} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827" }}>
                      {addr.label ?? "Address"}
                    </Text>
                    <Text style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>
                      {addr.address_line1}, {addr.city}
                      {addr.postal_code ? `, ${addr.postal_code}` : ""}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}

        {/* Payment method */}
        <View style={{ backgroundColor: "#fff", padding: contentPadding, marginBottom: 12 }}>
          <Text style={{ fontSize: 16, fontWeight: "700", color: "#111827", marginBottom: 14 }}>
            Payment Method
          </Text>
          <View>
            <TouchableOpacity
              onPress={() => setPaymentMethod("paystack")}
              style={{
                flexDirection: "row",
                alignItems: "center",
                padding: 14,
                borderRadius: 12,
                borderWidth: 1.5,
                borderColor: paymentMethod === "paystack" ? PRIMARY : "#E5E7EB",
                backgroundColor: paymentMethod === "paystack" ? "rgba(255,0,119,0.04)" : "#fff",
                marginBottom: 8,
              }}
            >
              <Ionicons
                name="card-outline"
                size={22}
                color={paymentMethod === "paystack" ? PRIMARY : "#9CA3AF"}
              />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: paymentMethod === "paystack" ? PRIMARY : "#374151" }}>
                  Pay Online
                </Text>
                <Text style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>
                  Secure payment with card (card, EFT, etc.)
                </Text>
              </View>
              <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: paymentMethod === "paystack" ? PRIMARY : "#D1D5DB", alignItems: "center", justifyContent: "center" }}>
                {paymentMethod === "paystack" && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: PRIMARY }} />}
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setPaymentMethod("card_on_delivery")}
              style={{
                flexDirection: "row",
                alignItems: "center",
                padding: 14,
                borderRadius: 12,
                borderWidth: 1.5,
                borderColor: paymentMethod === "card_on_delivery" ? PRIMARY : "#E5E7EB",
                backgroundColor: paymentMethod === "card_on_delivery" ? "rgba(255,0,119,0.04)" : "#fff",
              }}
            >
              <Ionicons
                name="wallet-outline"
                size={22}
                color={paymentMethod === "card_on_delivery" ? PRIMARY : "#9CA3AF"}
              />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: paymentMethod === "card_on_delivery" ? PRIMARY : "#374151" }}>
                  Pay at {fulfillment === "delivery" ? "Delivery" : "Collection"}
                </Text>
                <Text style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>
                  Cash or card when you receive your order
                </Text>
              </View>
              <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: paymentMethod === "card_on_delivery" ? PRIMARY : "#D1D5DB", alignItems: "center", justifyContent: "center" }}>
                {paymentMethod === "card_on_delivery" && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: PRIMARY }} />}
              </View>
            </TouchableOpacity>

            {paymentMethod === "paystack" && user && walletBalance > 0 && (
              <Pressable
                onPress={() => setUseWallet(!useWallet)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 12,
                  paddingHorizontal: 14,
                  marginTop: 8,
                  borderRadius: 12,
                  borderWidth: 1.5,
                  borderColor: useWallet ? PRIMARY : "#E5E7EB",
                  backgroundColor: useWallet ? "rgba(255,0,119,0.04)" : "#F9FAFB",
                }}
              >
                <View style={{
                  width: 22, height: 22, borderRadius: 6, borderWidth: 2, marginRight: 10,
                  borderColor: useWallet ? PRIMARY : "#9CA3AF",
                  backgroundColor: useWallet ? PRIMARY : "transparent",
                  alignItems: "center", justifyContent: "center",
                }}>
                  {useWallet && <Ionicons name="checkmark" size={14} color="#fff" />}
                </View>
                <Ionicons name="wallet-outline" size={18} color={useWallet ? PRIMARY : "#6B7280"} style={{ marginRight: 10 }} />
                <Text style={{ flex: 1, fontWeight: "500", color: useWallet ? PRIMARY : "#374151", fontSize: 14 }}>
                  Use wallet balance — R{walletBalance.toFixed(2)} available
                </Text>
              </Pressable>
            )}
          </View>

          {paymentMethod === "paystack" && platformFeeConfig.show && platformFee > 0 && (
            <View style={{ marginTop: 12, padding: 12, backgroundColor: "#FFF7ED", borderRadius: 10, flexDirection: "row", alignItems: "center" }}>
              <Ionicons name="information-circle-outline" size={16} color="#F59E0B" />
              <Text style={{ fontSize: 12, color: "#92400E", marginLeft: 8, flex: 1 }}>
                A platform service fee of R{platformFee.toFixed(2)} applies to online payments
              </Text>
            </View>
          )}
        </View>

        {/* Order summary */}
        <View style={{ backgroundColor: "#fff", padding: contentPadding, marginBottom: 12 }}>
          <Text style={{ fontSize: 16, fontWeight: "700", color: "#111827", marginBottom: 14 }}>
            Order Summary
          </Text>
          {providerCart?.items.map((item) => (
            <View
              key={item.id}
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                paddingVertical: 8,
                borderBottomWidth: 1,
                borderBottomColor: "#F9FAFB",
              }}
            >
              <Text style={{ fontSize: 14, color: "#374151", flex: 1 }} numberOfLines={1}>
                {item.product?.name} x{item.quantity}
              </Text>
              <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827" }}>
                R{((item.product?.retail_price ?? 0) * item.quantity).toFixed(2)}
              </Text>
            </View>
          ))}

          <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#E5E7EB" }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
              <Text style={{ fontSize: 14, color: "#6B7280" }}>Subtotal</Text>
              <Text style={{ fontSize: 14, color: "#111827" }}>R{subtotal.toFixed(2)}</Text>
            </View>
            {fulfillment === "delivery" && (
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                <Text style={{ fontSize: 14, color: "#6B7280" }}>Delivery</Text>
                <Text style={{ fontSize: 14, color: deliveryFee === 0 ? "#22C55E" : "#111827" }}>
                  {deliveryFee === 0 ? "Free" : `R${deliveryFee.toFixed(2)}`}
                </Text>
              </View>
            )}
            {platformFee > 0 && platformFeeConfig.show && (
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                <Text style={{ fontSize: 14, color: "#6B7280" }}>Service Fee</Text>
                <Text style={{ fontSize: 14, color: "#111827" }}>R{platformFee.toFixed(2)}</Text>
              </View>
            )}
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#E5E7EB" }}>
              <Text style={{ fontSize: 18, fontWeight: "700", color: "#111827" }}>Total</Text>
              <Text style={{ fontSize: 18, fontWeight: "700", color: PRIMARY }}>R{total.toFixed(2)}</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Place Order button */}
      <View
        style={{
          paddingHorizontal: contentPadding,
          paddingVertical: 14,
          backgroundColor: "#fff",
          borderTopWidth: 1,
          borderTopColor: "#F3F4F6",
          ...Shadows.tabBar,
        }}
      >
        <TouchableOpacity
          onPress={handlePlaceOrder}
          disabled={placing}
          style={{
            backgroundColor: PRIMARY,
            borderRadius: 14,
            paddingVertical: 16,
            alignItems: "center",
            opacity: placing ? 0.7 : 1,
            ...constraintStyle,
          }}
          accessibilityRole="button"
          accessibilityLabel="Place order"
          accessibilityHint="Double tap to submit your order"
        >
          {placing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: "#fff", fontSize: 17, fontWeight: "700" }}>
              {paymentMethod === "paystack" ? "Pay" : "Place"} Order — R{total.toFixed(2)}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
