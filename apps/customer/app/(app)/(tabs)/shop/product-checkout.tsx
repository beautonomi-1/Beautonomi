import { useEffect, useRef, useState, useCallback } from "react";
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
import { useInAppPaystackCheckout } from "@/hooks/useInAppPaystackCheckout";
import {
  extractPaystackReferenceFromUrl,
  isCancelledPaystackUrl,
  matchesExpoReturnUrl,
} from "@/lib/paystack-webview-utils";
import * as ExpoLinking from "expo-linking";
import { Colors, Shadows } from "@/constants/colors";
import { useResponsive } from "@/hooks/useResponsive";
import { api } from "@/lib/api-client";
import { verifyPaystackWithRetry } from "@/lib/payments/verifyPaystackWithRetry";
import { getApiErrorMessage } from "@/lib/api-error";
import { useCart } from "@/features/shop/useCart";
import { emitCartUpdated } from "@/lib/cart-events";
import { markReferenceProcessing } from "@/lib/paystack-verify-guard";
import { useProductOrders } from "@/features/shop/useProductOrders";
import { useAuth } from "@/providers/AuthProvider";
import { haptic } from "@/lib/haptics";
import { trackProductCheckoutStarted, trackProductOrderPlaced } from "@/lib/analytics";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";
import { formatMoney } from "@beautonomi/utils";
import { useTranslation } from "@beautonomi/i18n";
import { useSavedCards } from "@/hooks/useSavedCards";
import { usePaystackPayment } from "@/hooks/usePaystackPayment";
import { PaymentProcessingOverlay } from "@/components/payment/PaymentProcessingOverlay";
import {
  PaymentSuccessOverlay,
  type PaymentSuccessSummaryRow,
} from "@/components/payment/PaymentSuccessOverlay";

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
  collection_notes?: string | null;
  delivery_notes?: string | null;
  delivery_radius_km?: number | null;
}

const contentConstraintStyle = (contentMaxWidth: number, isTablet: boolean) =>
  isTablet || Platform.OS === "web"
    ? {
        maxWidth: Math.min(600, contentMaxWidth),
        alignSelf: "center" as const,
        width: "100%" as const,
      }
    : {};

function normalizeSavedAddressList(raw: unknown): Address[] {
  if (Array.isArray(raw)) return raw as Address[];
  if (raw && typeof raw === "object") {
    const o = raw as { data?: unknown; addresses?: unknown };
    if (Array.isArray(o.data)) return o.data as Address[];
    if (Array.isArray(o.addresses)) return o.addresses as Address[];
  }
  return [];
}

/** Matches web/customer booking: check res.error, retry once on transient failure. */
async function fetchSavedAddressesWithRetry(): Promise<{ list: Address[]; error: string | null }> {
  let lastError: string | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await api.get<Address[] | { data?: Address[] } | { addresses?: Address[] }>(
      "/api/me/addresses"
    );
    if (!res.error) {
      const list = normalizeSavedAddressList(res.data);
      return { list, error: null };
    }
    const status = (res.error as { status?: number }).status;
    if (status === 401 || status === 403) {
      return { list: [], error: null };
    }
    if (attempt === 0) {
      await new Promise((r) => setTimeout(r, 450));
    } else {
      lastError = getApiErrorMessage(res.error, "Failed to load addresses");
    }
  }
  return { list: [], error: lastError };
}

export default function ProductCheckoutScreen() {
  const router = useRouter();
  const { provider_id } = useLocalSearchParams<{ provider_id: string }>();
  const { contentMaxWidth, isTablet, contentPadding } = useResponsive();
  const constraintStyle = contentConstraintStyle(contentMaxWidth, isTablet);
  const cart = useCart();
  const { fetchCart } = cart;
  const orders = useProductOrders();
  const { user, refreshSession } = useAuth();
  const { t } = useTranslation();
  const errTitle = t("customer.mobile.screens.authLogin.errorTitle");
  const pc = useCallback(
    (key: string, options?: Record<string, string | number>, fallback?: string) => {
      const fullKey = `customer.mobile.tabs.productCheckout.${key}`;
      return t(fullKey, {
        ...(options ?? {}),
        defaultValue: fallback ?? "",
      }) as string;
    },
    [t],
  );

  const [fulfillment, setFulfillment] = useState<"collection" | "delivery">("collection");
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
  const [shippingConfig, setShippingConfig] = useState<ShippingConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [processingMessage, setProcessingMessage] = useState("Processing payment…");
  const [orderSuccessData, setOrderSuccessData] = useState<{
    orderNumber?: string;
    total: number;
    currency: string;
    items: string;
    status: "success" | "pending";
    subtitle?: string;
  } | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"paystack" | "card_on_delivery">("paystack");
  const [cashEnabledOnPlatform, setCashEnabledOnPlatform] = useState(false);
  const [useWallet, setUseWallet] = useState(false);
  const [walletBalance, setWalletBalance] = useState(0);
  const [platformFeeConfig, setPlatformFeeConfig] = useState<{
    type: string;
    percentage: number;
    fixed: number;
    show: boolean;
  }>({ type: "percentage", percentage: 5, fixed: 0, show: true });
  const [addressesLoadError, setAddressesLoadError] = useState<string | null>(null);
  const [refetchingAddresses, setRefetchingAddresses] = useState(false);
  const { cards: savedCards, defaultCard, refresh: refreshSavedCards } = useSavedCards(!!user);
  const { payWithSavedCard } = usePaystackPayment();
  const paystackHostedCheckout = useInAppPaystackCheckout();
  const [useNewCard, setUseNewCard] = useState(true);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  /**
   * §Customer-audit 2026-04 (C5 CRITICAL — checkout hang): `cart.groupedByProvider`
   * is recomputed from scratch every render inside `useCart`, so the derived
   * `providerCartForTracking` was a new object reference on every render.
   * The data-fetch useEffect below listed it in its dep array and called
   * `fetchCart()` which triggered `setItems` → new grouping → new reference
   * → effect re-ran → fetchCart again → infinite loop and the page stuck
   * on the loading spinner forever.
   *
   * We don't need the cart tracking snapshot to be reactive inside the
   * effect — we just read it once when firing the analytics event. Hold
   * it in a ref synced on every render and consume the ref inside the
   * effect, then drop the dependency.
   */
  const providerCartForTracking = provider_id ? cart.groupedByProvider[provider_id] : null;
  const providerCartForTrackingRef = useRef(providerCartForTracking);
  useEffect(() => {
    providerCartForTrackingRef.current = providerCartForTracking;
  }, [providerCartForTracking]);

  useEffect(() => {
    if (!cashEnabledOnPlatform && paymentMethod === "card_on_delivery") {
      setPaymentMethod("paystack");
    }
  }, [cashEnabledOnPlatform, paymentMethod]);

  useEffect(() => {
    if (savedCards.length === 0) {
      setUseNewCard(true);
      return;
    }
    if (defaultCard?.id && !selectedCardId) {
      setSelectedCardId(defaultCard.id);
      setUseNewCard(false);
    }
  }, [savedCards.length, defaultCard?.id, selectedCardId]);

  const reloadAddressesOnly = useCallback(async () => {
    if (!user) return;
    setRefetchingAddresses(true);
    setAddressesLoadError(null);
    try {
      const { list, error } = await fetchSavedAddressesWithRetry();
      setAddresses(list);
      setAddressesLoadError(error);
      setSelectedAddress((prev) => {
        if (prev && list.some((a) => a.id === prev)) return prev;
        const defaultAddr = list.find((a) => a.is_default);
        return defaultAddr?.id ?? list[0]?.id ?? null;
      });
    } finally {
      setRefetchingAddresses(false);
    }
  }, [user]);

  useEffect(() => {
    if (!provider_id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setAddressesLoadError(null);
      await fetchCart();
      if (cancelled) return;

      if (user) {
        const { list, error } = await fetchSavedAddressesWithRetry();
        if (cancelled) return;
        setAddresses(list);
        setAddressesLoadError(error);
        setSelectedAddress((prev) => {
          if (prev && list.some((a) => a.id === prev)) return prev;
          const defaultAddr = list.find((a) => a.is_default);
          return defaultAddr?.id ?? list[0]?.id ?? null;
        });
      } else {
        setAddresses([]);
        setAddressesLoadError(null);
        setSelectedAddress(null);
      }
      if (cancelled) return;

      // Fetch provider locations (public API by provider_id)
      const locRes = await api.get<{ data?: { locations?: Location[] }; locations?: Location[] }>(
        `/api/public/provider-locations?provider_id=${provider_id}`
      );
      const locData = locRes.data;
      const locList = Array.isArray(locData)
        ? locData
        : ((locData as any)?.locations ?? (locData as any)?.data?.locations ?? []);
      setLocations(locList);
      if (locList.length > 0) setSelectedLocation(locList[0].id);

      // Fetch shipping config (API returns { data: { shipping: config } })
      const shipRes = await api.get<{
        data?: { shipping?: ShippingConfig };
        shipping?: ShippingConfig;
      }>(`/api/public/products/shipping-config?provider_id=${provider_id}`);
      if (shipRes.data) {
        const raw = shipRes.data as any;
        const sc = raw?.shipping ?? raw?.data?.shipping ?? raw?.config ?? raw;
        if (
          sc &&
          typeof sc === "object" &&
          ("offers_delivery" in sc || "offers_collection" in sc)
        ) {
          setShippingConfig(sc as ShippingConfig);
          if (!sc.offers_collection && sc.offers_delivery) setFulfillment("delivery");
        }
      }

      // Track checkout started
      if (provider_id) {
        const snap = providerCartForTrackingRef.current;
        trackProductCheckoutStarted(provider_id, snap?.items.length ?? 0, snap?.subtotal ?? 0);
      }

      // Fetch platform fee config — pass provider_id so provider-specific overrides are respected
      const feeUrl = provider_id
        ? `/api/public/platform-fees?provider_id=${encodeURIComponent(provider_id)}`
        : "/api/public/platform-fees";
      const feeRes = await api.get<{
        platform_service_fee_type: string;
        platform_service_fee_percentage: number;
        platform_service_fee_fixed: number;
        show_service_fee_to_customer: boolean;
      }>(feeUrl);
      if (feeRes.data) {
        setPlatformFeeConfig({
          type: (feeRes.data as any).platform_service_fee_type ?? "fixed",
          percentage: (feeRes.data as any).platform_service_fee_percentage ?? 0,
          fixed: (feeRes.data as any).platform_service_fee_fixed ?? 0,
          show: (feeRes.data as any).show_service_fee_to_customer !== false,
        });
        setCashEnabledOnPlatform((feeRes.data as any).cash_enabled_on_platform === true);
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

      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [provider_id, user, fetchCart]);

  const providerCart = provider_id ? cart.groupedByProvider[provider_id] : null;
  const providerItems = providerCart?.items ?? [];
  const subtotal = providerCart?.subtotal ?? 0;
  const taxAmount = providerItems.reduce((s, i) => {
    const rate = parseFloat(String(i.product?.tax_rate || "0")) || 0;
    const linePrice = (i.effective_price ?? i.product?.retail_price ?? 0) * i.quantity;
    return s + Math.round(((linePrice * rate) / 100) * 100) / 100;
  }, 0);
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
  const total = subtotal + taxAmount + deliveryFee + platformFee;
  const fb = getTenantDefaultCurrency();
  const fmt = (amount: number) => formatMoney(amount, fb);

  const handlePlaceOrder = useCallback(async () => {
    if (!provider_id) return;
    if (!user) {
      Alert.alert(pc("signInToCheckoutTitle"), pc("signInToCheckoutBody"), [
        { text: pc("notNow"), style: "cancel" },
        {
          text: pc("signInCta"),
          onPress: () =>
            router.push({
              pathname: "/(auth)/login",
              params: {
                return_to: `/(app)/(tabs)/shop/product-checkout?provider_id=${encodeURIComponent(provider_id)}`,
              },
            } as any),
        },
      ]);
      return;
    }
    if (providerItems.length === 0) {
      Alert.alert(pc("cartEmptyTitle"), pc("cartEmptyBody"));
      return;
    }
    if (fulfillment === "delivery" && !selectedAddress) {
      Alert.alert(pc("addressRequiredTitle"), pc("addressRequiredBody"));
      return;
    }
    if (fulfillment === "collection" && !selectedLocation) {
      Alert.alert(pc("locationRequiredTitle"), pc("locationRequiredBody"));
      return;
    }

    setPlacing(true);
    setProcessingPayment(true);
    setProcessingMessage(pc("placingOrder", undefined, "Placing your order…"));
    await refreshSession().catch(() => {});

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
      setProcessingPayment(false);
      Alert.alert(pc("orderFailedTitle"), getApiErrorMessage(result.error, pc("orderFailedBody")));
      return;
    }

    const order = result.data;
    const paidWithWallet = result.paid_with_wallet === true;
    const amountDue = result.amount_due ?? total;
    const customerEmail = user?.email;

    if (order) {
      trackProductOrderPlaced(order.id, order.order_number, total, paymentMethod, fulfillment);
    }

    const itemsSummary =
      providerItems.length === 0
        ? ""
        : providerItems
            .map((i) => `${i.quantity}× ${i.product?.name ?? "Item"}`)
            .slice(0, 4)
            .join(", ") + (providerItems.length > 4 ? "…" : "");

    // Paid fully with wallet – no Paystack
    if (paidWithWallet) {
      setPlacing(false);
      setProcessingPayment(false);
      setOrderSuccessData({
        orderNumber: order?.order_number,
        total,
        currency: fb,
        items: itemsSummary,
        status: "success",
        subtitle: pc("orderPlacedWalletBody", { orderNumber: String(order?.order_number ?? "") }),
      });
      return;
    }

    // For card_on_delivery, no online payment needed
    if (paymentMethod === "card_on_delivery") {
      setPlacing(false);
      setProcessingPayment(false);
      await fetchCart().catch(() => {});
      emitCartUpdated();
      setOrderSuccessData({
        orderNumber: order?.order_number,
        total,
        currency: fb,
        items: itemsSummary,
        status: "success",
        subtitle: pc("orderPlacedCardOnDeliveryBody", {
          orderNumber: String(order?.order_number ?? ""),
        }),
      });
      return;
    }

    if (!order) {
      setPlacing(false);
      setProcessingPayment(false);
      Alert.alert(errTitle, pc("orderConfirmFailedBody"));
      return;
    }
    if (!customerEmail) {
      setPlacing(false);
      setProcessingPayment(false);
      await fetchCart().catch(() => {});
      emitCartUpdated();
      setOrderSuccessData({
        orderNumber: order.order_number,
        total,
        currency: fb,
        items: itemsSummary,
        status: "success",
        subtitle: pc("orderPlacedNoEmailBody", { orderNumber: String(order.order_number) }),
      });
      return;
    }

    if (
      paymentMethod === "paystack" &&
      !useNewCard &&
      selectedCardId &&
      savedCards.some((c) => c.id === selectedCardId) &&
      amountDue > 0.005
    ) {
      setProcessingMessage(pc("processingPayment", undefined, "Processing payment…"));
      const cardCharge = await payWithSavedCard({
        payment_method_id: selectedCardId,
        amount: amountDue,
        email: customerEmail,
        metadata: {
          product_order_id: order.id,
          type: "product_order",
        },
      });
      void refreshSavedCards();
      if (cardCharge.success) {
        await fetchCart();
        emitCartUpdated();
        haptic.success();
        setPlacing(false);
        setProcessingPayment(false);
        setOrderSuccessData({
          orderNumber: order.order_number,
          total: amountDue,
          currency: fb,
          items: itemsSummary,
          status: "success",
          subtitle: pc("paymentSuccessConfirmedBody", { orderNumber: String(order.order_number) }),
        });
        return;
      }
      setPlacing(false);
      setProcessingPayment(false);
      Alert.alert(
        errTitle,
        pc(
          "savedCardChargeFailed",
          undefined,
          "Could not charge your saved card. Try again or use a different payment method.",
        ) ||
          "We could not charge your saved card. Try paying with a new card or another method."
      );
      return;
    }

    // 2. Initialize Paystack payment for remaining amount (amount in kobo/cents)
    const paystackReturnPath =
      Platform.OS === "web" ? undefined : ExpoLinking.createURL("shop/paystack");
    const paystackRes = await api.post<{ authorization_url: string; reference: string }>(
      "/api/paystack/initialize",
      {
        email: customerEmail,
        amount: Math.round(amountDue * 100),
        ...(paystackReturnPath ? { callback_url: paystackReturnPath } : {}),
        metadata: {
          product_order_id: order.id,
          order_number: order.order_number,
          type: "product_order",
          mobile_app: "customer",
        },
      }
    );

    setPlacing(false);

    if (paystackRes.error || !paystackRes.data?.authorization_url) {
      setProcessingPayment(false);
      Alert.alert(
        pc("orderCreatedPayFailedTitle"),
        pc("orderCreatedPayFailedBody", { orderNumber: String(order.order_number) }),
        [
          {
            text: pc("viewOrdersCta"),
            onPress: () => router.replace("/(app)/product-orders" as any),
          },
        ]
      );
      return;
    }

    // 3. In-app Paystack WebView; return URL matches `callback_url` above.
    const url = paystackRes.data.authorization_url;
    setProcessingMessage(pc("openingPaymentPage", undefined, "Opening payment page…"));
    if (Platform.OS === "web") {
      setProcessingPayment(false);
      window.location.href = url;
    } else {
      if (!paystackReturnPath) {
        setProcessingPayment(false);
        return;
      }
      // Important: close the blocking overlay before opening Paystack WebView.
      // Two RN modals competing can leave users stuck on "opening payment page".
      setProcessingPayment(false);
      const reference = paystackRes.data.reference;
      if (reference) {
        markReferenceProcessing(reference);
      }
      const pr = await paystackHostedCheckout.waitForCheckout(url, {
        title: pc("securePaymentTitle", undefined, "Secure payment"),
        returnUrl: paystackReturnPath,
        matchSuccess: (u) =>
          matchesExpoReturnUrl(u, paystackReturnPath) && !isCancelledPaystackUrl(u),
        matchCancel: (u) => isCancelledPaystackUrl(u),
      });

      if (pr.outcome === "cancel") {
        setProcessingPayment(false);
        Alert.alert("Payment cancelled", "You cancelled the payment.");
        return;
      }

      setProcessingPayment(true);
      setProcessingMessage(pc("confirmingPayment", undefined, "Confirming your payment…"));
      let resolvedReference = paystackRes.data.reference;
      if (pr.outcome === "success" && pr.url) {
        if (isCancelledPaystackUrl(pr.url)) {
          setProcessingPayment(false);
          Alert.alert("Payment cancelled", "You cancelled the payment.");
          return;
        }
        const extracted = extractPaystackReferenceFromUrl(pr.url);
        if (extracted) resolvedReference = extracted;
      }
      if (resolvedReference) {
        await verifyPaystackWithRetry(resolvedReference);
      }

      let paid = false;
      const MAX_ATTEMPTS = 10;
      const POLL_INTERVAL_MS = 2000;
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const check = await orders.fetchOrderDetail(order.id);
        if (check.data?.payment_status === "paid") {
          paid = true;
          break;
        }
        if (attempt < MAX_ATTEMPTS - 1) {
          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        }
      }

      setProcessingPayment(false);
      if (paid) {
        await fetchCart();
        emitCartUpdated();
        haptic.success();
        setOrderSuccessData({
          orderNumber: order.order_number,
          total: amountDue,
          currency: fb,
          items: itemsSummary,
          status: "success",
          subtitle: pc("paymentSuccessConfirmedBody", { orderNumber: String(order.order_number) }),
        });
      } else {
        await fetchCart().catch(() => {});
        emitCartUpdated();
        setOrderSuccessData({
          orderNumber: order.order_number,
          total: amountDue,
          currency: fb,
          items: itemsSummary,
          status: "pending",
          subtitle: pc("paymentPendingCheckoutBody"),
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- orders/paymentMethod from context
  }, [
    provider_id,
    fulfillment,
    selectedAddress,
    selectedLocation,
    providerItems,
    orders.createOrder,
    orders.fetchOrderDetail,
    router,
    user,
    total,
    useWallet,
    useNewCard,
    selectedCardId,
    savedCards,
    payWithSavedCard,
    refreshSavedCards,
    refreshSession,
    fetchCart,
    pc,
    errTitle,
    t,
    paymentMethod,
    fb,
    paystackHostedCheckout,
  ]);

  if (loading) {
    return (
      <SafeAreaView
        style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" }}
      >
        <ActivityIndicator size="large" color={PRIMARY} />
      </SafeAreaView>
    );
  }

  if (!provider_id) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#F9FAFB" }} edges={["top"]}>
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
          <Text style={{ flex: 1, fontSize: 20, fontWeight: "700", color: "#111827" }}>
            Checkout
          </Text>
        </View>
        <View
          style={{
            flex: 1,
            padding: contentPadding,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Text style={{ fontSize: 16, color: "#6B7280", textAlign: "center" }}>
            Missing seller information. Open checkout from your cart.
          </Text>
          <TouchableOpacity
            onPress={() => router.replace("/(app)/(tabs)/cart" as any)}
            style={{
              marginTop: 20,
              paddingVertical: 12,
              paddingHorizontal: 24,
              backgroundColor: PRIMARY,
              borderRadius: 12,
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "700" }}>Go to cart</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!providerCart?.items?.length && !orderSuccessData && !processingPayment) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#F9FAFB" }} edges={["top"]}>
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
          <Text style={{ flex: 1, fontSize: 20, fontWeight: "700", color: "#111827" }}>
            Checkout
          </Text>
        </View>
        <View
          style={{
            flex: 1,
            padding: contentPadding,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Ionicons name="cart-outline" size={56} color="#D1D5DB" />
          <Text style={{ fontSize: 18, fontWeight: "700", color: "#111827", marginTop: 16 }}>
            No items for this seller
          </Text>
          <Text style={{ fontSize: 14, color: "#6B7280", marginTop: 8, textAlign: "center" }}>
            Add products from this provider to your cart first.
          </Text>
          <TouchableOpacity
            onPress={() => router.replace("/(app)/(tabs)/cart" as any)}
            style={{
              marginTop: 24,
              paddingVertical: 14,
              paddingHorizontal: 28,
              backgroundColor: PRIMARY,
              borderRadius: 12,
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "700" }}>View cart</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <>
      <SafeAreaView style={{ flex: 1, backgroundColor: "#F9FAFB" }} edges={["top"]}>
        <PaymentProcessingOverlay visible={processingPayment} message={processingMessage} />
        <PaymentSuccessOverlay
          visible={orderSuccessData !== null}
          title={
            orderSuccessData?.status === "pending"
              ? pc("paymentPendingTitle")
              : pc("orderPlacedTitle")
          }
          subtitle={orderSuccessData?.subtitle}
          status={orderSuccessData?.status === "pending" ? "pending" : "success"}
          summaryRows={(() => {
            if (!orderSuccessData) return undefined;
            const rows: PaymentSuccessSummaryRow[] = [
              {
                icon: "receipt-outline",
                label: pc("orderNumberLabel", undefined, "Order number"),
                value: orderSuccessData.orderNumber ?? "—",
              },
            ];
            if (orderSuccessData.items) {
              rows.push({
                icon: "bag-outline",
                label: pc("itemsLabel", undefined, "Items"),
                value: orderSuccessData.items,
              });
            }
            return rows;
          })()}
          amountPaid={orderSuccessData?.total}
          currency={orderSuccessData?.currency}
          footerHint={pc(
            "orderSuccessFooterHint",
            undefined,
            "Tap continue to view your orders.",
          )}
          onDismiss={() => {
            setOrderSuccessData(null);
            router.replace("/(app)/product-orders" as any);
          }}
        />
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
          <Text style={{ flex: 1, fontSize: 20, fontWeight: "700", color: "#111827" }}>
            Checkout
          </Text>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: contentPadding,
            paddingBottom: 120,
            ...constraintStyle,
          }}
        >
          {!user ? (
            <View
              style={{
                backgroundColor: "#EFF6FF",
                borderRadius: 14,
                padding: contentPadding,
                marginBottom: 12,
                borderWidth: 1,
                borderColor: "#BFDBFE",
              }}
            >
              <Text style={{ fontSize: 15, fontWeight: "700", color: "#1E40AF" }}>
                Sign in to place your order
              </Text>
              <Text style={{ fontSize: 13, color: "#1E3A8A", marginTop: 6, lineHeight: 18 }}>
                You can review delivery options below. When you are ready, sign in to pay and
                confirm.
              </Text>
              <TouchableOpacity
                onPress={() =>
                  router.push({
                    pathname: "/(auth)/login",
                    params: {
                      return_to: `/(app)/(tabs)/shop/product-checkout?provider_id=${encodeURIComponent(provider_id)}`,
                    },
                  } as any)
                }
                style={{
                  alignSelf: "flex-start",
                  marginTop: 12,
                  paddingVertical: 10,
                  paddingHorizontal: 18,
                  backgroundColor: PRIMARY,
                  borderRadius: 10,
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "700" }}>Sign in</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {/* Fulfillment type */}
          {(() => {
            const sc = shippingConfig;
            const pickupOnly = sc ? sc.offers_collection && !sc.offers_delivery : false;
            const deliveryOnly = sc ? !sc.offers_collection && sc.offers_delivery : false;
            const bothAvailable = sc ? sc.offers_collection && sc.offers_delivery : !sc;

            if (pickupOnly) {
              return (
                <View
                  style={{
                    backgroundColor: "#FFF7ED",
                    marginBottom: 12,
                    borderWidth: 1,
                    borderColor: "#FED7AA",
                    borderRadius: 14,
                    padding: contentPadding,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        backgroundColor: "#FFEDD5",
                        alignItems: "center",
                        justifyContent: "center",
                        marginRight: 12,
                      }}
                    >
                      <Ionicons name="storefront" size={22} color="#C2410C" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 16, fontWeight: "700", color: "#C2410C" }}>
                        In-store pickup only
                      </Text>
                      <Text style={{ fontSize: 13, color: "#92400E", marginTop: 2 }}>
                        This provider does not offer delivery. You must collect your order in
                        person.
                      </Text>
                    </View>
                  </View>
                  {sc?.collection_notes ? (
                    <View
                      style={{
                        backgroundColor: "#FFEDD5",
                        borderRadius: 10,
                        padding: 10,
                        marginTop: 4,
                      }}
                    >
                      <Text style={{ fontSize: 13, color: "#7C2D12", lineHeight: 18 }}>
                        {sc.collection_notes}
                      </Text>
                    </View>
                  ) : null}
                </View>
              );
            }

            if (deliveryOnly) {
              return (
                <View
                  style={{
                    backgroundColor: "#EFF6FF",
                    marginBottom: 12,
                    borderWidth: 1,
                    borderColor: "#BFDBFE",
                    borderRadius: 14,
                    padding: contentPadding,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        backgroundColor: "#DBEAFE",
                        alignItems: "center",
                        justifyContent: "center",
                        marginRight: 12,
                      }}
                    >
                      <Ionicons name="bicycle" size={22} color="#1D4ED8" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 16, fontWeight: "700", color: "#1D4ED8" }}>
                        Delivery only
                      </Text>
                      <Text style={{ fontSize: 13, color: "#1E40AF", marginTop: 2 }}>
                        {deliveryFee === 0
                          ? "Free delivery to your address."
                          : `Delivery fee: ${fmt(deliveryFee)}`}
                      </Text>
                    </View>
                  </View>
                  {sc?.delivery_notes ? (
                    <View
                      style={{
                        backgroundColor: "#DBEAFE",
                        borderRadius: 10,
                        padding: 10,
                        marginTop: 8,
                      }}
                    >
                      <Text style={{ fontSize: 13, color: "#1E3A8A", lineHeight: 18 }}>
                        {sc.delivery_notes}
                      </Text>
                    </View>
                  ) : null}
                  {sc && sc.estimated_delivery_days != null && sc.estimated_delivery_days > 0 && (
                    <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8 }}>
                      <Ionicons
                        name="time-outline"
                        size={14}
                        color="#6B7280"
                        style={{ marginRight: 6 }}
                      />
                      <Text style={{ fontSize: 13, color: "#6B7280" }}>
                        Estimated delivery: {sc.estimated_delivery_days}{" "}
                        {sc.estimated_delivery_days === 1 ? "day" : "days"}
                      </Text>
                    </View>
                  )}
                </View>
              );
            }

            return (
              <View style={{ backgroundColor: "#fff", padding: contentPadding, marginBottom: 12 }}>
                <Text
                  style={{ fontSize: 16, fontWeight: "700", color: "#111827", marginBottom: 14 }}
                >
                  How would you like to receive your order?
                </Text>
                <View style={{ flexDirection: "row" }}>
                  {(bothAvailable || sc?.offers_collection !== false) && (
                    <TouchableOpacity
                      onPress={() => setFulfillment("collection")}
                      style={{
                        flex: 1,
                        padding: contentPadding,
                        borderRadius: 14,
                        borderWidth: 2,
                        borderColor: fulfillment === "collection" ? PRIMARY : "#E5E7EB",
                        backgroundColor:
                          fulfillment === "collection" ? "rgba(255,0,119,0.04)" : "#fff",
                        alignItems: "center",
                        marginRight: sc?.offers_delivery ? 12 : 0,
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
                      <Text style={{ fontSize: 11, color: "#9CA3AF", marginTop: 4 }}>
                        Free · In-store
                      </Text>
                    </TouchableOpacity>
                  )}
                  {sc?.offers_delivery && (
                    <TouchableOpacity
                      onPress={() => setFulfillment("delivery")}
                      style={{
                        flex: 1,
                        padding: contentPadding,
                        borderRadius: 14,
                        borderWidth: 2,
                        borderColor: fulfillment === "delivery" ? PRIMARY : "#E5E7EB",
                        backgroundColor:
                          fulfillment === "delivery" ? "rgba(255,0,119,0.04)" : "#fff",
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
                        {deliveryFee === 0 ? "Free" : fmt(deliveryFee)}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })()}

          {/* Collection location */}
          {fulfillment === "collection" && locations.length === 0 && (
            <View style={{ backgroundColor: "#fff", padding: contentPadding, marginBottom: 12 }}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: "#111827", marginBottom: 14 }}>
                Collection Point
              </Text>
              <View style={{ backgroundColor: "#FEF3C7", borderRadius: 10, padding: 14 }}>
                <Text style={{ fontSize: 13, color: "#92400E", lineHeight: 18 }}>
                  No collection locations are available for this provider. Please switch to delivery
                  or contact the provider.
                </Text>
              </View>
            </View>
          )}
          {fulfillment === "collection" && locations.length > 0 && (
            <View style={{ backgroundColor: "#fff", padding: contentPadding, marginBottom: 12 }}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: "#111827", marginBottom: 14 }}>
                Collection Point
              </Text>
              {shippingConfig?.collection_notes &&
              !(shippingConfig.offers_collection && !shippingConfig.offers_delivery) ? (
                <View
                  style={{
                    backgroundColor: "#FFF7ED",
                    borderRadius: 10,
                    padding: 10,
                    marginBottom: 12,
                    flexDirection: "row",
                    alignItems: "flex-start",
                  }}
                >
                  <Ionicons
                    name="information-circle-outline"
                    size={16}
                    color="#C2410C"
                    style={{ marginRight: 6, marginTop: 1 }}
                  />
                  <Text style={{ flex: 1, fontSize: 13, color: "#92400E", lineHeight: 18 }}>
                    {shippingConfig.collection_notes}
                  </Text>
                </View>
              ) : null}
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
                    <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827" }}>
                      {loc.name}
                    </Text>
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
              {user && addressesLoadError ? (
                <View
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    backgroundColor: "#FEF2F2",
                    borderWidth: 1,
                    borderColor: "#FECACA",
                    marginBottom: 8,
                  }}
                >
                  <Text style={{ fontSize: 14, color: "#991B1B", marginBottom: 10 }}>
                    {addressesLoadError}
                  </Text>
                  <TouchableOpacity
                    onPress={() => void reloadAddressesOnly()}
                    disabled={refetchingAddresses}
                    style={{ alignSelf: "flex-start", opacity: refetchingAddresses ? 0.6 : 1 }}
                  >
                    {refetchingAddresses ? (
                      <ActivityIndicator size="small" color={PRIMARY} />
                    ) : (
                      <Text style={{ fontSize: 14, fontWeight: "600", color: PRIMARY }}>
                        Try again
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              ) : null}
              {!addressesLoadError && addresses.length === 0 ? (
                <View style={{ alignItems: "center", padding: contentPadding }}>
                  <Text
                    style={{
                      fontSize: 14,
                      color: "#6B7280",
                      marginBottom: 12,
                      textAlign: "center",
                    }}
                  >
                    {user ? "No addresses saved" : "Sign in to add a delivery address"}
                  </Text>
                  {user ? (
                    <TouchableOpacity
                      onPress={() => router.push("/(app)/account-settings/addresses" as any)}
                      style={{
                        paddingHorizontal: contentPadding,
                        paddingVertical: 10,
                        borderRadius: 10,
                        backgroundColor: PRIMARY,
                      }}
                    >
                      <Text style={{ color: "#fff", fontWeight: "600" }}>Add Address</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      onPress={() =>
                        router.push({
                          pathname: "/(auth)/login",
                          params: {
                            return_to: `/(app)/(tabs)/shop/product-checkout?provider_id=${encodeURIComponent(provider_id)}`,
                          },
                        } as any)
                      }
                      style={{
                        paddingHorizontal: contentPadding,
                        paddingVertical: 10,
                        borderRadius: 10,
                        backgroundColor: PRIMARY,
                      }}
                    >
                      <Text style={{ color: "#fff", fontWeight: "600" }}>Sign in</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : null}
              {!addressesLoadError && addresses.length > 0
                ? addresses.map((addr) => (
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
                        backgroundColor:
                          selectedAddress === addr.id ? "rgba(255,0,119,0.04)" : "#fff",
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
                : null}
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
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: paymentMethod === "paystack" ? PRIMARY : "#374151",
                    }}
                  >
                    Pay Online
                  </Text>
                  <Text style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>
                    Secure payment with card (card, EFT, etc.)
                  </Text>
                </View>
                <View
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    borderWidth: 2,
                    borderColor: paymentMethod === "paystack" ? PRIMARY : "#D1D5DB",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {paymentMethod === "paystack" && (
                    <View
                      style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: PRIMARY }}
                    />
                  )}
                </View>
              </TouchableOpacity>

              {cashEnabledOnPlatform && (
                <TouchableOpacity
                  onPress={() => setPaymentMethod("card_on_delivery")}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    padding: 14,
                    borderRadius: 12,
                    borderWidth: 1.5,
                    borderColor: paymentMethod === "card_on_delivery" ? PRIMARY : "#E5E7EB",
                    backgroundColor:
                      paymentMethod === "card_on_delivery" ? "rgba(255,0,119,0.04)" : "#fff",
                  }}
                >
                  <Ionicons
                    name="wallet-outline"
                    size={22}
                    color={paymentMethod === "card_on_delivery" ? PRIMARY : "#9CA3AF"}
                  />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "600",
                        color: paymentMethod === "card_on_delivery" ? PRIMARY : "#374151",
                      }}
                    >
                      Pay at {fulfillment === "delivery" ? "Delivery" : "Collection"}
                    </Text>
                    <Text style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>
                      Cash or card when you receive your order
                    </Text>
                  </View>
                  <View
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 10,
                      borderWidth: 2,
                      borderColor: paymentMethod === "card_on_delivery" ? PRIMARY : "#D1D5DB",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {paymentMethod === "card_on_delivery" && (
                      <View
                        style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: PRIMARY }}
                      />
                    )}
                  </View>
                </TouchableOpacity>
              )}

              {paymentMethod === "paystack" && user && savedCards.length > 0 && (
                <View style={{ marginTop: 12 }}>
                  <Text
                    style={{ fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 8 }}
                  >
                    Card
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      setUseNewCard(false);
                    }}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      padding: 12,
                      borderRadius: 10,
                      borderWidth: 1.5,
                      borderColor: !useNewCard ? PRIMARY : "#E5E7EB",
                      marginBottom: 6,
                    }}
                  >
                    <View
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 9,
                        borderWidth: 2,
                        borderColor: !useNewCard ? PRIMARY : "#D1D5DB",
                        marginRight: 10,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {!useNewCard ? (
                        <View
                          style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: PRIMARY }}
                        />
                      ) : null}
                    </View>
                    <Text style={{ flex: 1, fontSize: 14, color: "#374151" }}>Use saved card</Text>
                  </TouchableOpacity>
                  {!useNewCard
                    ? savedCards.map((c) => {
                        const expiry =
                          c.expiry_label ??
                          (c.expiry_month && c.expiry_year
                            ? `${String(c.expiry_month).padStart(2, "0")}/${String(c.expiry_year).slice(-2)}`
                            : null);
                        return (
                          <TouchableOpacity
                            key={c.id}
                            onPress={() => setSelectedCardId(c.id)}
                            style={{ paddingVertical: 6, paddingLeft: 32 }}
                          >
                            <Text
                              style={{
                                fontSize: 13,
                                color: selectedCardId === c.id ? PRIMARY : "#6B7280",
                                fontWeight: selectedCardId === c.id ? "700" : "400",
                              }}
                            >
                              •••• {c.last4 ?? "0000"}
                              {c.is_default ? " · default" : ""}
                            </Text>
                            {expiry ? (
                              <Text style={{ fontSize: 11, color: "#9CA3AF", paddingTop: 2 }}>
                                Expires {expiry}
                              </Text>
                            ) : null}
                          </TouchableOpacity>
                        );
                      })
                    : null}
                  {!useNewCard ? (
                    <TouchableOpacity
                      onPress={() => router.push("/account-settings/payments")}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={{ paddingVertical: 6, paddingLeft: 32, marginBottom: 4 }}
                      accessibilityRole="link"
                      accessibilityLabel="Manage saved cards"
                    >
                      <Text style={{ fontSize: 12, color: PRIMARY, fontWeight: "600" }}>
                        Manage saved cards
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    onPress={() => setUseNewCard(true)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      padding: 12,
                      borderRadius: 10,
                      borderWidth: 1.5,
                      borderColor: useNewCard ? PRIMARY : "#E5E7EB",
                      marginTop: 4,
                    }}
                  >
                    <View
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 9,
                        borderWidth: 2,
                        borderColor: useNewCard ? PRIMARY : "#D1D5DB",
                        marginRight: 10,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {useNewCard ? (
                        <View
                          style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: PRIMARY }}
                        />
                      ) : null}
                    </View>
                    <Text style={{ flex: 1, fontSize: 14, color: "#374151" }}>
                      Use a different card (secure browser)
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

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
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 6,
                      borderWidth: 2,
                      marginRight: 10,
                      borderColor: useWallet ? PRIMARY : "#9CA3AF",
                      backgroundColor: useWallet ? PRIMARY : "transparent",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {useWallet && <Ionicons name="checkmark" size={14} color="#fff" />}
                  </View>
                  <Ionicons
                    name="wallet-outline"
                    size={18}
                    color={useWallet ? PRIMARY : "#6B7280"}
                    style={{ marginRight: 10 }}
                  />
                  <Text
                    style={{
                      flex: 1,
                      fontWeight: "500",
                      color: useWallet ? PRIMARY : "#374151",
                      fontSize: 14,
                    }}
                  >
                    Use wallet balance — {fmt(walletBalance)} available
                  </Text>
                </Pressable>
              )}
              {paymentMethod === "paystack" && useWallet && walletBalance > 0 && (
                <Text style={{ fontSize: 12, color: "#6B7280", marginTop: 6, paddingHorizontal: 4 }}>
                  {`Wallet applies first; you pay ${fmt(Math.max(0, total - Math.min(walletBalance, total)))} by card.`}
                </Text>
              )}
            </View>

            {paymentMethod === "paystack" && platformFeeConfig.show && platformFee > 0 && (
              <View
                style={{
                  marginTop: 12,
                  padding: 12,
                  backgroundColor: "#FFF7ED",
                  borderRadius: 10,
                  flexDirection: "row",
                  alignItems: "center",
                }}
              >
                <Ionicons name="information-circle-outline" size={16} color="#F59E0B" />
                <Text style={{ fontSize: 12, color: "#92400E", marginLeft: 8, flex: 1 }}>
                  A platform fee of {fmt(platformFee)} applies to online payments
                </Text>
              </View>
            )}
            {!cashEnabledOnPlatform && (
              <View
                style={{
                  marginTop: 12,
                  padding: 12,
                  backgroundColor: "#EFF6FF",
                  borderRadius: 10,
                  flexDirection: "row",
                  alignItems: "center",
                }}
              >
                <Ionicons name="information-circle-outline" size={16} color="#1D4ED8" />
                <Text style={{ fontSize: 12, color: "#1E3A8A", marginLeft: 8, flex: 1 }}>
                  Pay-at-collection/delivery is disabled by platform policy. Please pay online.
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
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={{ fontSize: 14, color: "#374151" }} numberOfLines={1}>
                    {item.product?.name} x{item.quantity}
                  </Text>
                  {(item as any).product_variant?.option_values &&
                    Object.keys((item as any).product_variant.option_values).length > 0 && (
                      <Text style={{ fontSize: 12, color: "#9CA3AF" }} numberOfLines={1}>
                        {Object.values((item as any).product_variant.option_values).join(", ")}
                      </Text>
                    )}
                </View>
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827" }}>
                  {fmt(
                    (typeof item.effective_price === "number"
                      ? item.effective_price
                      : (item.product?.retail_price ?? 0)) * item.quantity
                  )}
                </Text>
              </View>
            ))}

            <View
              style={{
                marginTop: 12,
                paddingTop: 12,
                borderTopWidth: 1,
                borderTopColor: "#E5E7EB",
              }}
            >
              <View
                style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}
              >
                <Text style={{ fontSize: 14, color: "#6B7280" }}>Subtotal</Text>
                <Text style={{ fontSize: 14, color: "#111827" }}>{fmt(subtotal)}</Text>
              </View>
              {taxAmount > 0 && (
                <View
                  style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}
                >
                  <Text style={{ fontSize: 14, color: "#6B7280" }}>Tax</Text>
                  <Text style={{ fontSize: 14, color: "#111827" }}>{fmt(taxAmount)}</Text>
                </View>
              )}
              {fulfillment === "delivery" && (
                <View
                  style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}
                >
                  <Text style={{ fontSize: 14, color: "#6B7280" }}>Delivery</Text>
                  <Text style={{ fontSize: 14, color: deliveryFee === 0 ? "#22C55E" : "#111827" }}>
                    {deliveryFee === 0 ? "Free" : fmt(deliveryFee)}
                  </Text>
                </View>
              )}
              {platformFee > 0 && platformFeeConfig.show && (
                <View
                  style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}
                >
                  <Text style={{ fontSize: 14, color: "#6B7280" }}>Platform Fee</Text>
                  <Text style={{ fontSize: 14, color: "#111827" }}>{fmt(platformFee)}</Text>
                </View>
              )}
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  marginTop: 8,
                  paddingTop: 8,
                  borderTopWidth: 1,
                  borderTopColor: "#E5E7EB",
                }}
              >
                <Text style={{ fontSize: 18, fontWeight: "700", color: "#111827" }}>Total</Text>
                <Text style={{ fontSize: 18, fontWeight: "700", color: PRIMARY }}>
                  {fmt(total)}
                </Text>
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
                {paymentMethod === "paystack" ? "Pay" : "Place"} Order — {fmt(total)}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
      {paystackHostedCheckout.modal}
    </>
  );
}
