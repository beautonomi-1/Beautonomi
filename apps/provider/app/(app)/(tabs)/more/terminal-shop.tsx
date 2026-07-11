import { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { twStyle } from "@/lib/twStyle";
import { useFeatureFlag } from "@/providers/ConfigBundleProvider";
import { useProviderStackBack } from "@/lib/provider-tab-navigation";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { pushInAppBrowser } from "@/lib/in-app-web";
import { getRuntimeMarketHost } from "@/config/public-env";
import { downloadTerminalOrderReceipt } from "@/lib/download-terminal-order-receipt";
import { useProvider } from "@/providers/ProviderContext";
import {
  canConfirmTerminalCheckout,
  resolveTerminalShopOrderCta,
} from "@/lib/terminal-shop-cta";
import {
  formatTerminalAssetOwnership,
  formatTerminalCommercialModel,
} from "@/lib/terminal-commerce-labels";

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
  const { execute: postPay, loading: paying } = useApiMutation<{ authorization_url?: string; payment_url?: string }>("post");

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

  function openIntegrationSetup(order: TerminalOrder) {
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
        const payRes = await postPay(`/api/provider/terminal-orders/${order.id}/initialize-payment`, {});
        if (payRes.error) throw new Error(payRes.error);
        const url = payRes.data?.authorization_url ?? payRes.data?.payment_url;
        if (url) {
          pushInAppBrowser(router, url, "Pay for terminal");
        } else {
          Alert.alert("Payment", "Could not start payment. Try again from Your orders.");
        }
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
      const payRes = await postPay(`/api/provider/terminal-orders/${orderId}/initialize-payment`, {});
      if (payRes.error) throw new Error(payRes.error);
      const url = payRes.data?.authorization_url ?? payRes.data?.payment_url;
      if (url) pushInAppBrowser(router, url, "Pay for terminal");
      else Alert.alert("Payment", "Could not start payment.");
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
        subtitle="Order platform card machines"
        showBack
        onBack={handleBack}
      />
      <ScrollView contentContainerStyle={twStyle("px-4 pb-8")}>
        {loading ? (
          <ActivityIndicator style={twStyle("my-8")} />
        ) : (
          <>
            {catalogEnabled && (
              <View style={twStyle("mb-6")}>
                <Text style={twStyle("mb-3 text-base font-semibold text-gray-900")}>Catalog</Text>
                {products.length === 0 ? (
                  <Text style={twStyle("text-sm text-gray-500")}>No products available.</Text>
                ) : (
                  products.map((p) => (
                    <View key={p.id} style={twStyle("mb-3 rounded-2xl border border-gray-200 bg-white p-4")}>
                      <View style={twStyle("flex-row items-start justify-between")}>
                        <View style={twStyle("flex-1 pr-2")}>
                          <Text style={twStyle("font-semibold text-gray-900")}>{p.name}</Text>
                          <Text style={twStyle("text-xs capitalize text-gray-500")}>
                            {p.vendor}
                            {p.model ? ` · ${p.model}` : ""}
                          </Text>
                        </View>
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
                      </View>
                      {(p.checkout_options ?? []).map((opt) => (
                        <Text key={opt.commercial_model} style={twStyle("mt-1 text-sm text-gray-700")}>
                          {opt.label}: {opt.requires_payment ? `${opt.currency} ${opt.price}` : "Included in plan"}
                        </Text>
                      ))}
                      {(() => {
                        const cta = resolveTerminalShopOrderCta({
                          ecommerceEnabled,
                          stockStatus: p.stock_status,
                          checkoutOptionsCount: (p.checkout_options ?? []).length,
                          isOwner,
                        });
                        if (cta.enabled) {
                          return (
                            <TouchableOpacity
                              onPress={() => openCheckout(p)}
                              style={twStyle("mt-3 self-start rounded-xl bg-gray-900 px-4 py-2")}
                            >
                              <Text style={twStyle("text-sm font-medium text-white")}>Order</Text>
                            </TouchableOpacity>
                          );
                        }
                        return (
                          <View style={twStyle("mt-3")}>
                            <View style={twStyle("self-start rounded-xl bg-gray-200 px-4 py-2")}>
                              <Text style={twStyle("text-sm font-medium text-gray-500")}>Order</Text>
                            </View>
                            <Text style={twStyle("mt-1 text-xs text-gray-500")}>{cta.message}</Text>
                          </View>
                        );
                      })()}
                    </View>
                  ))
                )}
              </View>
            )}

            {ecommerceEnabled && (
              <View>
                <Text style={twStyle("mb-3 text-base font-semibold text-gray-900")}>Your orders</Text>
                {orders.length === 0 ? (
                  <Text style={twStyle("text-sm text-gray-500")}>No orders yet.</Text>
                ) : (
                  orders.map((o) => (
                    <View
                      key={o.id}
                      style={twStyle(
                        `mb-3 rounded-2xl border bg-white p-4 ${
                          highlightedOrderId === o.id
                            ? "border-pink-300 bg-pink-50"
                            : "border-gray-200"
                        }`,
                      )}
                    >
                      <Text style={twStyle("font-medium text-gray-900")}>{o.terminal_products?.name ?? "Terminal order"}</Text>
                      <Text style={twStyle("text-xs text-gray-500")}>
                        {formatTerminalCommercialModel(o.commercial_model)} · {o.order_status.replace(/_/g, " ")} · {o.invoice_status.replace(/_/g, " ")}
                      </Text>
                      {o.fulfillment_type === "collection" && o.terminal_collection_locations?.name && (
                        <Text style={twStyle("mt-1 text-xs text-gray-500")}>
                          Pickup: {o.terminal_collection_locations.name}
                        </Text>
                      )}
                      {o.tracking_reference && (
                        <Text style={twStyle("mt-1 text-xs text-gray-500")}>
                          {o.courier_name ? `${o.courier_name}: ` : ""}{o.tracking_reference}
                        </Text>
                      )}
                      {o.integration_setup_status === "pending" && (
                        <TouchableOpacity
                          onPress={() => openIntegrationSetup(o)}
                          style={twStyle("mt-2")}
                        >
                          <Text style={twStyle("text-sm font-medium text-pink-600")}>
                            Complete brand integration setup
                          </Text>
                        </TouchableOpacity>
                      )}
                      {o.invoice_status !== "paid" &&
                        !["cancelled", "refunded", "failed"].includes(o.order_status) &&
                        o.commercial_model !== "subscription_bundle" && (
                        <TouchableOpacity
                          onPress={() => payExisting(o.id)}
                          style={twStyle("mt-2 self-start rounded-xl border border-gray-300 px-3 py-1.5")}
                        >
                          <Text style={twStyle("text-sm text-gray-900")}>Pay now</Text>
                        </TouchableOpacity>
                      )}
                      {o.invoice_status === "paid" && (
                        <TouchableOpacity
                          onPress={() =>
                            void downloadTerminalOrderReceipt(o.id, router, {
                              productName: o.terminal_products?.name ?? "Terminal order",
                            })
                          }
                          style={twStyle("mt-2 self-start rounded-xl border border-gray-300 px-3 py-1.5")}
                        >
                          <Text style={twStyle("text-sm text-gray-900")}>Receipt</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ))
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
                    <View>
                      <Text style={twStyle("text-sm text-gray-900")}>
                        {a.terminal_products?.name ?? "Terminal device"}
                      </Text>
                      {a.ownership_model ? (
                        <Text style={twStyle("text-xs text-gray-500")}>
                          {formatTerminalAssetOwnership(a.ownership_model)}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={twStyle("text-xs capitalize text-gray-500")}>{a.status.replace(/_/g, " ")}</Text>
                  </View>
                ))}
              </View>
            )}

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
              style={twStyle("mt-4")}
            >
              <Text style={twStyle("text-sm text-gray-600 underline")}>
                {paycloudEnabled ? "Manage card machines" : "Manage terminal integrations on web"}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      <Modal visible={!!checkoutProduct} animationType="slide" transparent onRequestClose={() => setCheckoutProduct(null)}>
        <View style={twStyle("flex-1 justify-end bg-black/40")}>
          <View style={twStyle("rounded-t-3xl bg-white p-5")}>
            <Text style={twStyle("text-lg font-semibold text-gray-900")}>Order {checkoutProduct?.name}</Text>
            {(checkoutProduct?.checkout_options ?? []).length === 0 ? (
              <Text style={twStyle("mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800")}>
                This product isn&apos;t configured for checkout. Contact Beautonomi support.
              </Text>
            ) : (
              (checkoutProduct?.checkout_options ?? []).map((opt) => (
                <TouchableOpacity
                  key={opt.commercial_model}
                  onPress={() => setCommercialModel(opt.commercial_model)}
                  style={twStyle(
                    `mt-2 rounded-xl border p-3 ${
                      commercialModel === opt.commercial_model ? "border-gray-900 bg-gray-50" : "border-gray-200"
                    }`,
                  )}
                >
                  <Text style={twStyle("font-medium text-gray-900")}>{opt.label}</Text>
                  <Text style={twStyle("text-sm text-gray-500")}>
                    {opt.requires_payment ? `${opt.currency} ${opt.price}` : "Included in plan"}
                  </Text>
                </TouchableOpacity>
              ))
            )}

            {(fulfillmentType === "shipping" || fulfillmentType === "courier") && (
              <View style={twStyle("mt-3 gap-2")}>
                <TextInput
                  placeholder="Address line 1"
                  value={addressLine1}
                  onChangeText={setAddressLine1}
                  style={twStyle("rounded-xl border border-gray-200 px-3 py-2 text-sm")}
                />
                <TextInput
                  placeholder="City"
                  value={city}
                  onChangeText={setCity}
                  style={twStyle("rounded-xl border border-gray-200 px-3 py-2 text-sm")}
                />
                <TextInput
                  placeholder="Postal code"
                  value={postalCode}
                  onChangeText={setPostalCode}
                  style={twStyle("rounded-xl border border-gray-200 px-3 py-2 text-sm")}
                />
              </View>
            )}

            {fulfillmentType === "collection" && (
              <View style={twStyle("mt-3")}>
                <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>Pickup location</Text>
                {collectionLocations.length === 0 ? (
                  <Text style={twStyle("text-sm text-gray-500")}>No pickup locations configured.</Text>
                ) : (
                  collectionLocations.map((loc) => (
                    <TouchableOpacity
                      key={loc.id}
                      onPress={() => setCollectionLocationId(loc.id)}
                      style={twStyle(
                        `mb-2 rounded-xl border p-3 ${
                          collectionLocationId === loc.id ? "border-gray-900 bg-gray-50" : "border-gray-200"
                        }`,
                      )}
                    >
                      <Text style={twStyle("font-medium text-gray-900")}>{loc.name}</Text>
                    </TouchableOpacity>
                  ))
                )}
              </View>
            )}

            {fulfillmentType === "digital_activation" && (
              <Text style={twStyle("mt-3 text-sm text-gray-600")}>
                This product activates digitally. Complete brand integration after confirmation.
              </Text>
            )}

            <View style={twStyle("mt-4 flex-row justify-end gap-2")}>
              <TouchableOpacity onPress={() => setCheckoutProduct(null)} style={twStyle("rounded-xl border border-gray-200 px-4 py-2")}>
                <Text>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => void submitOrder()}
                disabled={posting || allocating || paying || !checkoutConfirmState.ok}
                style={twStyle(`rounded-xl px-4 py-2 ${checkoutConfirmState.ok ? "bg-gray-900" : "bg-gray-300"}`)}
              >
                <Text style={twStyle("font-medium text-white")}>
                  {posting || allocating || paying ? "Working…" : selectedOption?.requires_payment ? "Place & pay" : "Confirm"}
                </Text>
              </TouchableOpacity>
            </View>
            {!checkoutConfirmState.ok && checkoutConfirmState.message ? (
              <Text style={twStyle("mt-2 text-xs text-amber-700")}>{checkoutConfirmState.message}</Text>
            ) : null}
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}
