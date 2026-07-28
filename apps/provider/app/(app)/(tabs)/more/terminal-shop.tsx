import { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Alert,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { twStyle } from "@/lib/twStyle";
import { useFeatureFlag } from "@/providers/ConfigBundleProvider";
import { useProviderStackBack } from "@/lib/provider-tab-navigation";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { pushInAppBrowser } from "@/lib/in-app-web";
import { getRuntimeMarketHost } from "@/config/public-env";
import { downloadTerminalOrderReceipt } from "@/lib/download-terminal-order-receipt";
import { useProvider } from "@/providers/ProviderContext";
import { useInAppPaystackCheckout } from "@/hooks/useInAppPaystackCheckout";
import { verifyPaystackWithRetry } from "@/lib/payments/verifyPaystackWithRetry";
import { extractPaystackReferenceFromUrl } from "@/lib/payments/paystackRefFromUrl";
import {
  getTerminalPaystackReturnUrl,
  matchesTerminalPaystackReturnUrl,
  pollTerminalOrderPaid,
  terminalOrderFailedCopy,
  terminalOrderPendingCopy,
  terminalOrderSuccessCopy,
} from "@/lib/payments/providerPaystackReturn";
import {
  canConfirmTerminalCheckout,
  resolveTerminalShopOrderCta,
} from "@/lib/terminal-shop-cta";
import {
  formatTerminalAssetOwnership,
  formatTerminalCommercialModel,
} from "@/lib/terminal-commerce-labels";
import {
  getTerminalOrderProgressSteps,
  resolveTerminalOrderPrimaryAction,
} from "@/lib/terminal-order-progress";

type CheckoutOption = {
  commercial_model: string;
  label: string;
  price: number | null;
  currency: string;
  requires_payment: boolean;
  description?: string;
};

type TerminalProduct = {
  id: string;
  name: string;
  vendor: string;
  model: string | null;
  description: string | null;
  currency: string;
  stock_status: string;
  fulfillment_type?: string | null;
  requires_integration_setup?: boolean;
  checkout_options?: CheckoutOption[];
};

type TerminalOrder = {
  id: string;
  order_status: string;
  invoice_status: string;
  commercial_model: string;
  total_amount: number;
  currency: string;
  created_at: string;
  integration_setup_status?: string | null;
  integration_setup_url?: string | null;
  fulfillment_type?: string | null;
  fulfillment_status?: string | null;
  tracking_reference?: string | null;
  courier_name?: string | null;
  terminal_products?: { name?: string; vendor?: string; integration_vendor_slug?: string | null };
  terminal_collection_locations?: { name?: string } | null;
};

type ProductsResponse = { products: TerminalProduct[] };
type OrdersResponse = { orders: TerminalOrder[] };
type CollectionLocation = { id: string; name: string; address: Record<string, unknown> };
type LocationsResponse = { locations: CollectionLocation[] };

type TerminalAsset = {
  id: string;
  serial_number: string | null;
  status: string;
  ownership_model: string;
  terminal_products?: { name?: string; vendor?: string };
};

type AssetsResponse = { assets: TerminalAsset[] };

const FULFILLMENT_META: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  shipping: { label: "Shipped to you", icon: "cube-outline" },
  courier: { label: "Courier delivery", icon: "cube-outline" },
  collection: { label: "Collect in person", icon: "location-outline" },
  digital_activation: { label: "Instant digital activation", icon: "flash-outline" },
};

function formatMoney(currency: string, amount: number | null | undefined) {
  if (amount == null) return "—";
  return `${currency} ${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

function FulfillmentChip({ type }: { type: string | null | undefined }) {
  const meta = FULFILLMENT_META[type ?? ""];
  if (!meta) return null;
  return (
    <View style={twStyle("mt-2 flex-row items-center self-start rounded-full bg-gray-50 border border-gray-200 px-2.5 py-1")}>
      <Ionicons name={meta.icon} size={12} color="#6b7280" />
      <Text style={twStyle("ml-1 text-[11px] text-gray-600")}>{meta.label}</Text>
    </View>
  );
}

function OrderTimeline({ order }: { order: TerminalOrder }) {
  const steps = getTerminalOrderProgressSteps(order);
  return (
    <View style={twStyle("mt-2 flex-row flex-wrap items-center")}>
      {steps.map((step, idx) => (
        <View key={step.label} style={twStyle("flex-row items-center")}>
          {idx > 0 ? (
            <View
              style={twStyle(
                `mx-1 h-px w-4 ${step.state === "upcoming" ? "bg-gray-200" : "bg-pink-300"}`,
              )}
            />
          ) : null}
          {step.state === "done" ? (
            <Ionicons name="checkmark-circle" size={14} color="#16a34a" />
          ) : step.state === "current" ? (
            <View style={twStyle("h-3.5 w-3.5 items-center justify-center")}>
              <View style={twStyle("h-2 w-2 rounded-full bg-pink-500")} />
            </View>
          ) : (
            <View style={twStyle("h-3.5 w-3.5 items-center justify-center")}>
              <View style={twStyle("h-1.5 w-1.5 rounded-full bg-gray-300")} />
            </View>
          )}
          <Text
            style={twStyle(
              `ml-1 text-[10px] font-medium ${
                step.state === "done"
                  ? "text-green-700"
                  : step.state === "current"
                    ? "text-pink-700"
                    : "text-gray-400"
              }`,
            )}
          >
            {step.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

export default function TerminalShopScreen() {
  const router = useRouter();
  const handleBack = useProviderStackBack();
  const { role } = useProvider();
  const { order: orderParam, order_id: orderIdParam } = useLocalSearchParams<{
    order?: string;
    order_id?: string;
  }>();
  const highlightedOrderId =
    (Array.isArray(orderParam) ? orderParam[0] : orderParam) ||
    (Array.isArray(orderIdParam) ? orderIdParam[0] : orderIdParam) ||
    null;
  const catalogEnabled = useFeatureFlag("terminal_product_catalog_enabled");
  const ecommerceEnabled = useFeatureFlag("terminal_ecommerce_enabled");
  const paycloudEnabled = useFeatureFlag("payment_paycloud");

  const { data: teamAccess } = useApi<{ is_business_owner?: boolean }>("/api/provider/team-access", {
    staleTimeMs: 60_000,
  });
  const isOwner =
    role === "provider_owner" ||
    role === "superadmin" ||
    teamAccess?.is_business_owner === true;

  const productsUrl = catalogEnabled ? "/api/provider/terminal-products" : null;
  const ordersUrl = ecommerceEnabled ? "/api/provider/terminal-orders" : null;
  const locationsUrl = ecommerceEnabled ? "/api/provider/terminal-collection-locations" : null;
  const shopUsable = catalogEnabled || ecommerceEnabled;
  const assetsUrl = shopUsable ? "/api/provider/terminal-assets" : null;

  const { data: productsData, loading: productsLoading, refresh: refreshProducts } = useApi<ProductsResponse>(
    productsUrl ?? "",
    { enabled: !!productsUrl },
  );
  const { data: ordersData, loading: ordersLoading, refresh: refreshOrders } = useApi<OrdersResponse>(
    ordersUrl ?? "",
    { enabled: !!ordersUrl },
  );
  const { data: locationsData } = useApi<LocationsResponse>(locationsUrl ?? "", { enabled: !!locationsUrl });
  const { data: assetsData, refresh: refreshAssets } = useApi<AssetsResponse>(assetsUrl ?? "", {
    enabled: !!assetsUrl,
  });

  const { execute: postOrder, loading: posting } = useApiMutation<{ order: TerminalOrder; requires_payment?: boolean }>("post");
  const { execute: postAllocate, loading: allocating } = useApiMutation<{ order: TerminalOrder }>("post");
  const { execute: postPay, loading: paying } = useApiMutation<{
    authorization_url?: string;
    payment_url?: string;
    reference?: string;
  }>("post");

  const terminalReturnUrl = getTerminalPaystackReturnUrl();
  const paystackCheckout = useInAppPaystackCheckout();
  const [paymentOutcome, setPaymentOutcome] = useState<{
    phase: "idle" | "success" | "pending" | "failed";
    title?: string;
    body?: string;
  }>({ phase: "idle" });
  const [verifyingPayment, setVerifyingPayment] = useState(false);

  const [checkoutProduct, setCheckoutProduct] = useState<TerminalProduct | null>(null);
  const [commercialModel, setCommercialModel] = useState("once_off_purchase");
  const [addressLine1, setAddressLine1] = useState("");
  const [city, setCity] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [collectionLocationId, setCollectionLocationId] = useState("");

  const products = productsData?.products ?? [];
  const orders = ordersData?.orders ?? [];
  const assets = assetsData?.assets ?? [];
  const collectionLocations = locationsData?.locations ?? [];

  const selectedOption = useMemo(
    () => checkoutProduct?.checkout_options?.find((o) => o.commercial_model === commercialModel),
    [checkoutProduct, commercialModel],
  );

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshProducts(), refreshOrders(), refreshAssets()]);
  }, [refreshProducts, refreshOrders, refreshAssets]);

  const fulfillmentType = checkoutProduct?.fulfillment_type ?? "courier";

  const checkoutConfirmState = useMemo(
    () =>
      canConfirmTerminalCheckout({
        selectedOption,
        checkoutOptionsCount: checkoutProduct?.checkout_options?.length ?? 0,
        fulfillmentType,
        collectionLocationsCount: collectionLocations.length,
        collectionLocationId,
        addressLine1,
        city,
        postalCode,
      }),
    [
      selectedOption,
      checkoutProduct?.checkout_options?.length,
      fulfillmentType,
      collectionLocations.length,
      collectionLocationId,
      addressLine1,
      city,
      postalCode,
    ],
  );

  const activeDeviceCount = useMemo(
    () => assets.filter((a) => a.status === "active").length,
    [assets],
  );

  const pendingActivationOrder = useMemo(
    () =>
      orders.find((o) => {
        if (o.invoice_status !== "paid") return false;
        if (o.integration_setup_status === "awaiting_merchant_onboarding") return true;
        if (o.integration_setup_status !== "pending") return false;
        const vendor = (o.terminal_products?.vendor ?? "").toLowerCase();
        return !vendor || vendor === "paycloud";
      }) ?? null,
    [orders],
  );

  function openIntegrationSetup(order: TerminalOrder) {
    if (order.integration_setup_status === "awaiting_merchant_onboarding") {
      router.push(
        `/(app)/(tabs)/more/terminal-merchant-application?order_id=${encodeURIComponent(order.id)}` as never,
      );
      return;
    }
    const vendor = (
      order.terminal_products?.integration_vendor_slug ??
      order.terminal_products?.vendor ??
      ""
    ).toLowerCase();
    if (vendor === "paycloud") {
      router.push(`/(app)/(tabs)/more/card-machines?order=${encodeURIComponent(order.id)}` as never);
      return;
    }
    if (order.integration_setup_url) {
      pushInAppBrowser(router, order.integration_setup_url, "Integration setup");
    } else if (paycloudEnabled) {
      router.push(`/(app)/(tabs)/more/card-machines?order=${encodeURIComponent(order.id)}` as never);
    }
  }

  function openCheckout(product: TerminalProduct) {
    setCheckoutProduct(product);
    setCommercialModel(product.checkout_options?.[0]?.commercial_model ?? "once_off_purchase");
    setAddressLine1("");
    setCity("");
    setPostalCode("");
    setCollectionLocationId(collectionLocations[0]?.id ?? "");
  }

  function validateCheckout(): string | null {
    if (fulfillmentType === "collection") {
      if (collectionLocations.length === 0) {
        return "No pickup locations are configured yet. Use the web terminal shop or contact support.";
      }
      if (!collectionLocationId) {
        return "Select a pickup location.";
      }
    }
    if (fulfillmentType === "shipping" || fulfillmentType === "courier") {
      if (!addressLine1.trim() || !city.trim() || !postalCode.trim()) {
        return "Enter a delivery address (line 1, city, and postal code).";
      }
    }
    return null;
  }

  const openTerminalPaystack = useCallback(
    async (orderId: string, url: string, reference?: string | null) => {
      const result = await paystackCheckout.waitForCheckout(url, {
        title: "Pay for terminal",
        returnUrl: terminalReturnUrl,
        matchSuccess: (rawUrl) => matchesTerminalPaystackReturnUrl(rawUrl, { success: true }),
        matchCancel: (rawUrl) => matchesTerminalPaystackReturnUrl(rawUrl, { cancelled: true }),
      });

      if (result?.outcome === "cancel") {
        const failed = terminalOrderFailedCopy("Payment wasn't completed.");
        setPaymentOutcome({ phase: "failed", ...failed });
        await refreshAll();
        return;
      }

      const isClosed = result?.outcome === "closed";
      if (result.outcome !== "success" && !isClosed) {
        await refreshAll();
        return;
      }

      setVerifyingPayment(true);
      try {
        let payReference = reference?.trim() || null;
        if (result.outcome === "success" && result.url) {
          if (matchesTerminalPaystackReturnUrl(result.url, { cancelled: true })) {
            const failed = terminalOrderFailedCopy("Payment wasn't completed.");
            setPaymentOutcome({ phase: "failed", ...failed });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            await refreshAll();
            return;
          }
          const extracted = extractPaystackReferenceFromUrl(result.url);
          if (extracted) payReference = extracted;
        }

        const verifyResult = payReference ? await verifyPaystackWithRetry(payReference) : null;
        if (verifyResult?.status === "failed") {
          const failed = terminalOrderFailedCopy(verifyResult.errorMessage ?? null);
          setPaymentOutcome({ phase: "failed", ...failed });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          await refreshAll();
          return;
        }

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        const provisioned = await pollTerminalOrderPaid(orderId);
        if (provisioned.state === "provisioned") {
          setPaymentOutcome({ phase: "success", ...terminalOrderSuccessCopy() });
        } else {
          setPaymentOutcome({ phase: "pending", ...terminalOrderPendingCopy() });
        }
        await refreshAll();
      } finally {
        setVerifyingPayment(false);
      }
    },
    [paystackCheckout, refreshAll, terminalReturnUrl],
  );

  async function startTerminalPayment(orderId: string) {
    const payRes = await postPay(`/api/provider/terminal-orders/${orderId}/initialize-payment`, {
      in_app: true,
      callback_url: terminalReturnUrl,
    });
    if (payRes.error) throw new Error(payRes.error);
    const url = payRes.data?.authorization_url ?? payRes.data?.payment_url;
    if (!url) {
      Alert.alert("Payment", "Could not start payment. Try again from Your orders.");
      return;
    }
    await openTerminalPaystack(orderId, url, payRes.data?.reference ?? null);
  }

  async function submitOrder() {
    if (!checkoutProduct) return;
    if (!checkoutConfirmState.ok) {
      Alert.alert("Checkout", checkoutConfirmState.message ?? "Complete the form to continue.");
      return;
    }
    if (!selectedOption) return;

    const validationError = validateCheckout();
    if (validationError) {
      Alert.alert("Checkout", validationError);
      return;
    }

    const payload: Record<string, unknown> = {
      product_id: checkoutProduct.id,
      quantity: 1,
      fulfillment_type: fulfillmentType,
    };

    if (fulfillmentType === "shipping" || fulfillmentType === "courier") {
      payload.delivery_address = {
        line1: addressLine1.trim(),
        city: city.trim(),
        postal_code: postalCode.trim(),
        country: "ZA",
      };
    } else if (fulfillmentType === "collection") {
      payload.collection_location_id = collectionLocationId;
    }

    try {
      let order: TerminalOrder | undefined;
      let requiresPayment = selectedOption.requires_payment;

      if (commercialModel === "subscription_bundle") {
        const res = await postAllocate("/api/provider/terminal-orders/allocate-from-subscription", payload);
        if (res.error) throw new Error(res.error);
        order = res.data?.order;
        requiresPayment = false;
      } else {
        const res = await postOrder("/api/provider/terminal-orders", {
          ...payload,
          commercial_model: commercialModel,
        });
        if (res.error) throw new Error(res.error);
        order = res.data?.order;
        requiresPayment = res.data?.requires_payment ?? true;
      }

      setCheckoutProduct(null);
      await refreshAll();

      if (order?.id && requiresPayment) {
        await startTerminalPayment(order.id);
      } else {
        Alert.alert("Success", "Terminal order confirmed.");
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not place order";
      if (message.toLowerCase().includes("forbidden") || message.includes("403")) {
        Alert.alert("Order not allowed", "Only the business owner can place terminal orders.");
      } else {
        Alert.alert("Order failed", message);
      }
    }
  }

  async function payExisting(orderId: string) {
    try {
      await startTerminalPayment(orderId);
    } catch (e) {
      Alert.alert("Payment failed", e instanceof Error ? e.message : "Try again");
    }
  }

  if (!catalogEnabled && !ecommerceEnabled) {
    return (
      <ScreenContainer>
        <ScreenHeader title="Terminal Shop" showBack onBack={handleBack} />
        <Text style={twStyle("px-4 text-sm text-gray-600")}>Terminal shop is not enabled for your account.</Text>
      </ScreenContainer>
    );
  }

  const loading = productsLoading || ordersLoading;

  return (
    <ScreenContainer>
      <ScreenHeader
        title="Terminal Shop"
        subtitle="Card machines by Beautonomi"
        showBack
        onBack={handleBack}
      />
      <ScrollView contentContainerStyle={twStyle("px-4 pb-8")}>
        {verifyingPayment ? (
          <View style={twStyle("mb-4 flex-row items-center rounded-2xl border border-indigo-200 bg-indigo-50 p-4")}>
            <ActivityIndicator color="#4338ca" />
            <Text style={twStyle("ml-3 flex-1 text-sm text-indigo-900")}>
              Confirming your payment with Paystack…
            </Text>
          </View>
        ) : null}
        {paymentOutcome.phase !== "idle" ? (
          <View
            style={twStyle(
              `mb-4 rounded-2xl border p-4 ${
                paymentOutcome.phase === "success"
                  ? "border-emerald-200 bg-emerald-50"
                  : paymentOutcome.phase === "pending"
                    ? "border-amber-200 bg-amber-50"
                    : "border-red-200 bg-red-50"
              }`,
            )}
          >
            <Text
              style={twStyle(
                `text-sm font-semibold ${
                  paymentOutcome.phase === "success"
                    ? "text-emerald-900"
                    : paymentOutcome.phase === "pending"
                      ? "text-amber-900"
                      : "text-red-900"
                }`,
              )}
            >
              {paymentOutcome.title}
            </Text>
            {paymentOutcome.body ? (
              <Text
                style={twStyle(
                  `mt-1 text-xs ${
                    paymentOutcome.phase === "success"
                      ? "text-emerald-800"
                      : paymentOutcome.phase === "pending"
                        ? "text-amber-800"
                        : "text-red-800"
                  }`,
                )}
              >
                {paymentOutcome.body}
              </Text>
            ) : null}
            <TouchableOpacity
              onPress={() => setPaymentOutcome({ phase: "idle" })}
              style={twStyle("mt-3 self-start")}
            >
              <Text style={twStyle("text-xs font-semibold text-gray-700")}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        {loading ? (
          <ActivityIndicator style={twStyle("my-8")} />
        ) : (
          <>
            {/* Hero / value strip */}
            <View style={twStyle("mb-5 rounded-2xl border border-pink-100 bg-pink-50 p-4")}>
              <View style={twStyle("flex-row items-center self-start rounded-full bg-white px-2.5 py-1")}>
                <Ionicons name="sparkles-outline" size={12} color="#db2777" />
                <Text style={twStyle("ml-1 text-[11px] font-semibold text-pink-700")}>
                  Beautonomi card machines
                </Text>
              </View>
              <Text style={twStyle("mt-2.5 text-lg font-bold text-gray-900")}>
                Get paid in person — tap, insert, swipe, and QR
              </Text>
              <Text style={twStyle("mt-1 text-xs text-gray-600")}>
                Order a machine, activate it with its serial number, and charges flow straight from
                your bookings and sales checkout.
              </Text>
              <View style={twStyle("mt-3 flex-row flex-wrap")}>
                {[
                  { icon: "flash-outline" as const, label: "Charges from checkout" },
                  { icon: "checkmark-done-outline" as const, label: "Auto-reconciled" },
                  { icon: "shield-checkmark-outline" as const, label: "Beautonomi support" },
                ].map((chip) => (
                  <View
                    key={chip.label}
                    style={[
                      twStyle("flex-row items-center rounded-full bg-white px-2.5 py-1"),
                      { marginRight: 6, marginBottom: 6 },
                    ]}
                  >
                    <Ionicons name={chip.icon} size={11} color="#db2777" />
                    <Text style={twStyle("ml-1 text-[10px] font-medium text-gray-700")}>{chip.label}</Text>
                  </View>
                ))}
              </View>
              {activeDeviceCount > 0 ? (
                <View style={twStyle("mt-1 flex-row items-center")}>
                  <Ionicons name="checkmark-circle" size={13} color="#16a34a" />
                  <Text style={twStyle("ml-1 text-[11px] font-medium text-green-700")}>
                    {activeDeviceCount} device{activeDeviceCount === 1 ? "" : "s"} active on your account
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Pending activation nudge */}
            {pendingActivationOrder && paycloudEnabled ? (
              <TouchableOpacity
                onPress={() => openIntegrationSetup(pendingActivationOrder)}
                style={twStyle("mb-5 flex-row items-center rounded-2xl border border-pink-200 bg-white p-4")}
                accessibilityRole="button"
                accessibilityLabel={
                  pendingActivationOrder.integration_setup_status === "awaiting_merchant_onboarding"
                    ? "Complete card machine application"
                    : "Activate your card machine"
                }
              >
                <View style={twStyle("h-10 w-10 items-center justify-center rounded-xl bg-pink-50")}>
                  <Ionicons name="cube-outline" size={20} color="#db2777" />
                </View>
                <View style={twStyle("ml-3 flex-1")}>
                  <Text style={twStyle("text-sm font-semibold text-gray-900")}>
                    {pendingActivationOrder.integration_setup_status === "awaiting_merchant_onboarding"
                      ? "Complete your card machine application"
                      : `${pendingActivationOrder.terminal_products?.name ?? "Your card machine"} is ready to activate`}
                  </Text>
                  <Text style={twStyle("text-xs text-gray-500")}>
                    {pendingActivationOrder.integration_setup_status === "awaiting_merchant_onboarding"
                      ? "We need a few details before we can ship your device."
                      : "Enter the serial number from the device label to finish setup."}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#db2777" />
              </TouchableOpacity>
            ) : null}

            {catalogEnabled && (
              <View style={twStyle("mb-6")}>
                <Text style={twStyle("mb-1 text-base font-semibold text-gray-900")}>Choose your machine</Text>
                <Text style={twStyle("mb-3 text-xs text-gray-500")}>
                  Every machine works with Beautonomi checkout out of the box.
                </Text>
                {products.length === 0 ? (
                  <View style={twStyle("items-center rounded-2xl border border-dashed border-gray-200 p-8")}>
                    <Ionicons name="phone-portrait-outline" size={28} color="#d1d5db" />
                    <Text style={twStyle("mt-2 text-sm text-gray-500")}>
                      No products available yet — check back soon.
                    </Text>
                  </View>
                ) : (
                  products.map((p) => {
                    const options = p.checkout_options ?? [];
                    const includedOption = options.find((o) => !o.requires_payment);
                    const cta = resolveTerminalShopOrderCta({
                      ecommerceEnabled,
                      stockStatus: p.stock_status,
                      checkoutOptionsCount: options.length,
                      isOwner,
                    });
                    return (
                      <View key={p.id} style={twStyle("mb-3 rounded-2xl border border-gray-200 bg-white p-4")}>
                        <View style={twStyle("flex-row items-start justify-between")}>
                          <View style={twStyle("flex-1 pr-2")}>
                            <Text style={twStyle("text-base font-semibold text-gray-900")}>{p.name}</Text>
                            <Text style={twStyle("text-xs capitalize text-gray-500")}>
                              {p.vendor}
                              {p.model ? ` · ${p.model}` : ""}
                            </Text>
                          </View>
                          {includedOption ? (
                            <View style={twStyle("rounded-full bg-pink-600 px-2.5 py-1")}>
                              <Text style={twStyle("text-[10px] font-semibold text-white")}>In your plan</Text>
                            </View>
                          ) : p.stock_status !== "in_stock" ? (
                            <View
                              style={twStyle(
                                `rounded-full px-2 py-0.5 ${
                                  p.stock_status === "out_of_stock" ? "bg-rose-50" : "bg-gray-100"
                                }`,
                              )}
                            >
                              <Text
                                style={twStyle(
                                  `text-[10px] font-semibold capitalize ${
                                    p.stock_status === "out_of_stock" ? "text-rose-700" : "text-gray-600"
                                  }`,
                                )}
                              >
                                {p.stock_status.replace(/_/g, " ")}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                        {p.description ? (
                          <Text style={twStyle("mt-1.5 text-xs text-gray-600")} numberOfLines={2}>
                            {p.description}
                          </Text>
                        ) : null}
                        <FulfillmentChip type={p.fulfillment_type} />
                        {options.length > 0 ? (
                          <View style={twStyle("mt-3")}>
                            {options.map((opt, idx) => (
                              <View
                                key={opt.commercial_model}
                                style={[
                                  twStyle(
                                    `flex-row items-center justify-between rounded-xl border px-3 py-2 ${
                                      !opt.requires_payment
                                        ? "border-pink-200 bg-pink-50"
                                        : "border-gray-100 bg-gray-50"
                                    }`,
                                  ),
                                  idx > 0 ? { marginTop: 6 } : undefined,
                                ]}
                              >
                                <Text
                                  style={twStyle(
                                    `text-xs font-medium ${
                                      !opt.requires_payment ? "text-pink-900" : "text-gray-700"
                                    }`,
                                  )}
                                >
                                  {opt.label}
                                </Text>
                                <Text
                                  style={twStyle(
                                    `text-xs font-semibold ${
                                      !opt.requires_payment ? "text-pink-700" : "text-gray-900"
                                    }`,
                                  )}
                                >
                                  {opt.requires_payment
                                    ? formatMoney(opt.currency, opt.price)
                                    : "R 0 — in plan"}
                                </Text>
                              </View>
                            ))}
                          </View>
                        ) : null}
                        {cta.enabled ? (
                          <TouchableOpacity
                            onPress={() => openCheckout(p)}
                            style={twStyle("mt-3 flex-row items-center justify-center rounded-xl bg-pink-600 px-4 py-3")}
                            accessibilityRole="button"
                            accessibilityLabel={`Order ${p.name}`}
                          >
                            <Text style={twStyle("text-sm font-semibold text-white")}>Order this machine</Text>
                            <Ionicons name="arrow-forward" size={15} color="#ffffff" style={{ marginLeft: 6 }} />
                          </TouchableOpacity>
                        ) : (
                          <View style={twStyle("mt-3")}>
                            <View style={twStyle("items-center rounded-xl bg-gray-200 px-4 py-3")}>
                              <Text style={twStyle("text-sm font-semibold text-gray-500")}>
                                {cta.kind === "out_of_stock" ? "Out of stock" : "Order this machine"}
                              </Text>
                            </View>
                            {cta.kind !== "out_of_stock" ? (
                              <Text style={twStyle("mt-1 text-center text-xs text-gray-500")}>{cta.message}</Text>
                            ) : null}
                          </View>
                        )}
                        <Text style={twStyle("mt-2 text-center text-[10px] text-gray-400")}>
                          Sold and supported by Beautonomi
                        </Text>
                      </View>
                    );
                  })
                )}
              </View>
            )}

            {ecommerceEnabled && (
              <View style={twStyle("mb-6")}>
                <Text style={twStyle("mb-1 text-base font-semibold text-gray-900")}>Your orders</Text>
                <Text style={twStyle("mb-3 text-xs text-gray-500")}>
                  Track payment, integration, and delivery.
                </Text>
                {orders.length === 0 ? (
                  <View style={twStyle("items-center rounded-2xl border border-dashed border-gray-200 p-8")}>
                    <Ionicons name="cube-outline" size={28} color="#d1d5db" />
                    <Text style={twStyle("mt-2 text-center text-sm text-gray-500")}>
                      No orders yet — pick a machine above to get started.
                    </Text>
                  </View>
                ) : (
                  orders.map((o) => {
                    const primaryAction = resolveTerminalOrderPrimaryAction(o);
                    const highlighted = highlightedOrderId === o.id;
                    return (
                      <View
                        key={o.id}
                        style={twStyle(
                          `mb-3 rounded-2xl border bg-white p-4 ${
                            highlighted ? "border-pink-300 bg-pink-50" : "border-gray-200"
                          }`,
                        )}
                      >
                        <Text style={twStyle("text-sm font-semibold text-gray-900")}>
                          {o.terminal_products?.name ?? "Terminal order"}
                        </Text>
                        <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>
                          {new Date(o.created_at).toLocaleDateString()} ·{" "}
                          {formatTerminalCommercialModel(o.commercial_model)} · {o.currency}{" "}
                          {Number(o.total_amount).toLocaleString()}
                        </Text>
                        <OrderTimeline order={o} />
                        {o.fulfillment_type === "collection" && o.terminal_collection_locations?.name ? (
                          <Text style={twStyle("mt-1.5 text-xs text-gray-500")}>
                            Pickup: {o.terminal_collection_locations.name}
                          </Text>
                        ) : null}
                        {o.tracking_reference ? (
                          <Text style={twStyle("mt-1.5 text-xs text-gray-500")}>
                            {o.courier_name ? `${o.courier_name}: ` : "Tracking: "}
                            {o.tracking_reference}
                          </Text>
                        ) : null}
                        {["cancelled", "refunded", "failed"].includes(o.order_status) ? (
                          <Text style={twStyle("mt-1.5 text-xs capitalize text-rose-600")}>
                            {o.order_status.replace(/_/g, " ")}
                          </Text>
                        ) : null}
                        <View style={twStyle("mt-3 flex-row flex-wrap items-center")}>
                          {primaryAction === "pay" ? (
                            <TouchableOpacity
                              onPress={() => payExisting(o.id)}
                              disabled={paying}
                              style={[
                                twStyle("flex-row items-center rounded-xl bg-pink-600 px-4 py-2"),
                                { marginRight: 8, marginBottom: 4 },
                              ]}
                              accessibilityRole="button"
                              accessibilityLabel="Pay for this order"
                            >
                              <Ionicons name="card-outline" size={14} color="#ffffff" />
                              <Text style={twStyle("ml-1.5 text-sm font-semibold text-white")}>
                                {paying ? "Starting…" : "Pay now"}
                              </Text>
                            </TouchableOpacity>
                          ) : null}
                          {primaryAction === "setup" ? (
                            <TouchableOpacity
                              onPress={() => openIntegrationSetup(o)}
                              style={[
                                twStyle("flex-row items-center rounded-xl bg-pink-600 px-4 py-2"),
                                { marginRight: 8, marginBottom: 4 },
                              ]}
                              accessibilityRole="button"
                              accessibilityLabel="Complete integration setup"
                            >
                              <Ionicons name="construct-outline" size={14} color="#ffffff" />
                              <Text style={twStyle("ml-1.5 text-sm font-semibold text-white")}>
                                Complete setup
                              </Text>
                            </TouchableOpacity>
                          ) : null}
                          {o.invoice_status === "paid" ? (
                            <TouchableOpacity
                              onPress={() =>
                                void downloadTerminalOrderReceipt(o.id, router, {
                                  productName: o.terminal_products?.name ?? "Terminal order",
                                })
                              }
                              style={[
                                twStyle("flex-row items-center rounded-xl border border-gray-300 px-4 py-2"),
                                { marginBottom: 4 },
                              ]}
                              accessibilityRole="button"
                              accessibilityLabel="Download receipt"
                            >
                              <Ionicons name="download-outline" size={14} color="#374151" />
                              <Text style={twStyle("ml-1.5 text-sm font-medium text-gray-900")}>Receipt</Text>
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            )}

            {shopUsable && assets.length > 0 && (
              <View style={twStyle("mb-6")}>
                <Text style={twStyle("mb-3 text-base font-semibold text-gray-900")}>Your devices</Text>
                {assets.map((a) => (
                  <View
                    key={a.id}
                    style={twStyle("mb-2 flex-row items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3")}
                  >
                    <View style={twStyle("flex-row items-center flex-1 pr-2")}>
                      <View style={twStyle("h-9 w-9 items-center justify-center rounded-lg bg-gray-50")}>
                        <Ionicons name="phone-portrait-outline" size={16} color="#9ca3af" />
                      </View>
                      <View style={twStyle("ml-3 flex-1")}>
                        <Text style={twStyle("text-sm font-medium text-gray-900")}>
                          {a.terminal_products?.name ?? "Terminal device"}
                        </Text>
                        <Text style={twStyle("text-xs text-gray-500")}>
                          {formatTerminalAssetOwnership(a.ownership_model)}
                          {a.serial_number ? ` · ${a.serial_number}` : ""}
                        </Text>
                      </View>
                    </View>
                    <View
                      style={twStyle(
                        `rounded-full px-2 py-0.5 ${a.status === "active" ? "bg-green-50" : "bg-gray-100"}`,
                      )}
                    >
                      <Text
                        style={twStyle(
                          `text-[10px] font-semibold capitalize ${
                            a.status === "active" ? "text-green-700" : "text-gray-500"
                          }`,
                        )}
                      >
                        {a.status.replace(/_/g, " ")}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* What happens after purchase */}
            <View style={twStyle("mb-4 rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-4")}>
              <Text style={twStyle("text-sm font-semibold text-gray-900")}>What happens after purchase</Text>
              {[
                "Pay for your order — we prepare it for delivery, pickup, or instant activation.",
                "Activate the machine with its serial number in Card machines.",
                "Turn on in-person acceptance and start charging at bookings and sales.",
              ].map((step, idx) => (
                <View key={step} style={twStyle("mt-2.5 flex-row items-start")}>
                  <View style={twStyle("h-5 w-5 items-center justify-center rounded-full bg-pink-100")}>
                    <Text style={twStyle("text-[10px] font-bold text-pink-700")}>{idx + 1}</Text>
                  </View>
                  <Text style={twStyle("ml-2 flex-1 text-xs text-gray-600")}>{step}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity
              onPress={() =>
                paycloudEnabled
                  ? router.push("/(app)/(tabs)/more/card-machines" as never)
                  : pushInAppBrowser(
                      router,
                      `${getRuntimeMarketHost()}/provider/settings/sales/terminal-integrations`,
                      "Terminal integrations",
                    )
              }
              style={twStyle("mb-2 flex-row items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-3")}
              accessibilityRole="button"
            >
              <Ionicons name="settings-outline" size={15} color="#374151" />
              <Text style={twStyle("ml-2 text-sm font-medium text-gray-900")}>
                {paycloudEnabled ? "Manage card machines" : "Manage terminal integrations on web"}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      <BottomSheet
        visible={!!checkoutProduct}
        onClose={() => setCheckoutProduct(null)}
        title={checkoutProduct ? `Order ${checkoutProduct.name}` : undefined}
        subtitle={
          checkoutProduct
            ? `${checkoutProduct.vendor}${checkoutProduct.model ? ` · ${checkoutProduct.model}` : ""}`
            : undefined
        }
        snapHeight="full"
        footer={
          <View>
            {!checkoutConfirmState.ok && checkoutConfirmState.message ? (
              <Text style={twStyle("mb-2 text-center text-xs text-amber-700")}>
                {checkoutConfirmState.message}
              </Text>
            ) : null}
            <View style={twStyle("flex-row justify-end")}>
              <TouchableOpacity
                onPress={() => setCheckoutProduct(null)}
                style={[twStyle("rounded-xl border border-gray-200 px-4 py-2.5"), { marginRight: 8 }]}
                accessibilityRole="button"
              >
                <Text style={twStyle("text-sm text-gray-700")}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => void submitOrder()}
                disabled={posting || allocating || paying || !checkoutConfirmState.ok}
                style={twStyle(
                  `rounded-xl px-4 py-2.5 ${checkoutConfirmState.ok ? "bg-pink-600" : "bg-gray-300"}`,
                )}
                accessibilityRole="button"
              >
                <Text style={twStyle("text-sm font-semibold text-white")}>
                  {posting || allocating || paying
                    ? "Working…"
                    : selectedOption?.requires_payment
                      ? "Place & pay"
                      : "Confirm"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        }
      >
        {(checkoutProduct?.checkout_options ?? []).length === 0 ? (
          <Text style={twStyle("rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800")}>
            This product isn&apos;t configured for checkout. Contact Beautonomi support.
          </Text>
        ) : (
          <>
            <Text style={twStyle("mb-1 text-sm font-medium text-gray-900")}>
              How would you like to get it?
            </Text>
            {(checkoutProduct?.checkout_options ?? []).map((opt) => {
              const selected = commercialModel === opt.commercial_model;
              return (
                <TouchableOpacity
                  key={opt.commercial_model}
                  onPress={() => setCommercialModel(opt.commercial_model)}
                  style={twStyle(
                    `mt-2 flex-row items-start rounded-xl border p-3 ${
                      selected ? "border-pink-400 bg-pink-50" : "border-gray-200"
                    }`,
                  )}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                >
                  <View
                    style={twStyle(
                      `mt-0.5 h-4 w-4 items-center justify-center rounded-full border-2 ${
                        selected ? "border-pink-600" : "border-gray-300"
                      }`,
                    )}
                  >
                    {selected ? <View style={twStyle("h-2 w-2 rounded-full bg-pink-600")} /> : null}
                  </View>
                  <View style={twStyle("ml-2.5 flex-1")}>
                    <View style={twStyle("flex-row items-center justify-between")}>
                      <Text style={twStyle("text-sm font-medium text-gray-900")}>{opt.label}</Text>
                      <Text
                        style={twStyle(
                          `text-sm font-semibold ${opt.requires_payment ? "text-gray-900" : "text-pink-700"}`,
                        )}
                      >
                        {opt.requires_payment ? formatMoney(opt.currency, opt.price) : "R 0 — in plan"}
                      </Text>
                    </View>
                    {opt.description ? (
                      <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>{opt.description}</Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </>
        )}

        {(fulfillmentType === "shipping" || fulfillmentType === "courier") && (
          <View style={twStyle("mt-4")}>
            <Text style={twStyle("mb-1 text-sm font-medium text-gray-900")}>Delivery address</Text>
            <TextInput
              placeholder="Address line 1"
              placeholderTextColor="#9ca3af"
              value={addressLine1}
              onChangeText={setAddressLine1}
              style={twStyle("mt-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900")}
            />
            <TextInput
              placeholder="City"
              placeholderTextColor="#9ca3af"
              value={city}
              onChangeText={setCity}
              style={twStyle("mt-2 rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900")}
            />
            <TextInput
              placeholder="Postal code"
              placeholderTextColor="#9ca3af"
              value={postalCode}
              onChangeText={setPostalCode}
              style={twStyle("mt-2 rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900")}
            />
          </View>
        )}

        {fulfillmentType === "collection" && (
          <View style={twStyle("mt-4")}>
            <Text style={twStyle("mb-1 text-sm font-medium text-gray-900")}>Pickup location</Text>
            {collectionLocations.length === 0 ? (
              <Text style={twStyle("text-sm text-gray-500")}>No pickup locations configured.</Text>
            ) : (
              collectionLocations.map((loc) => {
                const selected = collectionLocationId === loc.id;
                return (
                  <TouchableOpacity
                    key={loc.id}
                    onPress={() => setCollectionLocationId(loc.id)}
                    style={twStyle(
                      `mt-2 flex-row items-center rounded-xl border p-3 ${
                        selected ? "border-pink-400 bg-pink-50" : "border-gray-200"
                      }`,
                    )}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                  >
                    <Ionicons
                      name="location-outline"
                      size={15}
                      color={selected ? "#db2777" : "#9ca3af"}
                    />
                    <Text style={twStyle("ml-2 text-sm font-medium text-gray-900")}>{loc.name}</Text>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        )}

        {fulfillmentType === "digital_activation" && (
          <View style={twStyle("mt-4 flex-row items-start rounded-xl bg-gray-50 p-3")}>
            <Ionicons name="flash-outline" size={15} color="#db2777" />
            <Text style={twStyle("ml-2 flex-1 text-xs text-gray-600")}>
              This product activates digitally — nothing gets shipped. Complete brand integration
              after confirmation.
            </Text>
          </View>
        )}

        {selectedOption ? (
          <View style={twStyle("mt-4 flex-row items-center justify-between rounded-xl bg-gray-50 px-3 py-2.5")}>
            <Text style={twStyle("text-sm text-gray-500")}>Total today</Text>
            <Text style={twStyle("text-sm font-bold text-gray-900")}>
              {selectedOption.requires_payment
                ? formatMoney(selectedOption.currency, selectedOption.price)
                : "R 0 — in your plan"}
            </Text>
          </View>
        ) : null}
      </BottomSheet>
    </ScreenContainer>
  );
}
