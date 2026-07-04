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
import { useRouter } from "expo-router";
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
  terminal_products?: { name?: string };
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
  const catalogEnabled = useFeatureFlag("terminal_product_catalog_enabled");
  const ecommerceEnabled = useFeatureFlag("terminal_ecommerce_enabled");

  const productsUrl = catalogEnabled ? "/api/provider/terminal-products" : null;
  const ordersUrl = ecommerceEnabled ? "/api/provider/terminal-orders" : null;
  const locationsUrl = ecommerceEnabled ? "/api/provider/terminal-collection-locations" : null;
  const assetsUrl = ecommerceEnabled ? "/api/provider/terminal-assets" : null;

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
    if (!checkoutProduct || !selectedOption) return;

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
        order = res?.order;
        requiresPayment = false;
      } else {
        const res = await postOrder("/api/provider/terminal-orders", {
          ...payload,
          commercial_model: commercialModel,
        });
        order = res?.order;
        requiresPayment = res?.requires_payment ?? true;
      }

      setCheckoutProduct(null);
      await refreshAll();

      if (order?.id && requiresPayment) {
        const payRes = await postPay(`/api/provider/terminal-orders/${order.id}/initialize-payment`, {});
        const url = payRes?.authorization_url ?? payRes?.payment_url;
        if (url) {
          pushInAppBrowser(router, url, "Pay for terminal");
        } else {
          Alert.alert("Payment", "Could not start payment. Try again from Your orders.");
        }
      } else {
        Alert.alert("Success", "Terminal order confirmed.");
      }
    } catch (e) {
      Alert.alert("Order failed", e instanceof Error ? e.message : "Could not place order");
    }
  }

  async function payExisting(orderId: string) {
    try {
      const payRes = await postPay(`/api/provider/terminal-orders/${orderId}/initialize-payment`, {});
      const url = payRes?.authorization_url ?? payRes?.payment_url;
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
                      <Text style={twStyle("font-semibold text-gray-900")}>{p.name}</Text>
                      <Text style={twStyle("text-xs capitalize text-gray-500")}>{p.vendor}{p.model ? ` · ${p.model}` : ""}</Text>
                      {(p.checkout_options ?? []).map((opt) => (
                        <Text key={opt.commercial_model} style={twStyle("mt-1 text-sm text-gray-700")}>
                          {opt.label}: {opt.requires_payment ? `${opt.currency} ${opt.price}` : "Included in plan"}
                        </Text>
                      ))}
                      {ecommerceEnabled && p.stock_status !== "out_of_stock" && (
                        <TouchableOpacity
                          onPress={() => openCheckout(p)}
                          style={twStyle("mt-3 self-start rounded-xl bg-gray-900 px-4 py-2")}
                        >
                          <Text style={twStyle("text-sm font-medium text-white")}>Order</Text>
                        </TouchableOpacity>
                      )}
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
                    <View key={o.id} style={twStyle("mb-3 rounded-2xl border border-gray-200 bg-white p-4")}>
                      <Text style={twStyle("font-medium text-gray-900")}>{o.terminal_products?.name ?? "Terminal order"}</Text>
                      <Text style={twStyle("text-xs text-gray-500 capitalize")}>
                        {o.commercial_model.replace(/_/g, " ")} · {o.order_status.replace(/_/g, " ")} · {o.invoice_status.replace(/_/g, " ")}
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
                      {o.integration_setup_status === "pending" && o.integration_setup_url && (
                        <TouchableOpacity
                          onPress={() => pushInAppBrowser(router, o.integration_setup_url!, "Integration setup")}
                          style={twStyle("mt-2")}
                        >
                          <Text style={twStyle("text-sm font-medium text-pink-600")}>Complete integration setup</Text>
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

            {ecommerceEnabled && assets.length > 0 && (
              <View style={twStyle("mb-6")}>
                <Text style={twStyle("mb-3 text-base font-semibold text-gray-900")}>Your devices</Text>
                {assets.map((a) => (
                  <View
                    key={a.id}
                    style={twStyle("mb-2 flex-row items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3")}
                  >
                    <Text style={twStyle("text-sm text-gray-900")}>
                      {a.terminal_products?.name ?? "Terminal device"}
                    </Text>
                    <Text style={twStyle("text-xs capitalize text-gray-500")}>{a.status.replace(/_/g, " ")}</Text>
                  </View>
                ))}
              </View>
            )}

            <TouchableOpacity
              onPress={() =>
                pushInAppBrowser(
                  router,
                  `${getRuntimeMarketHost()}/provider/settings/sales/terminal-integrations`,
                  "Terminal integrations",
                )
              }
              style={twStyle("mt-4")}
            >
              <Text style={twStyle("text-sm text-gray-600 underline")}>Manage terminal integrations on web</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      <Modal visible={!!checkoutProduct} animationType="slide" transparent onRequestClose={() => setCheckoutProduct(null)}>
        <View style={twStyle("flex-1 justify-end bg-black/40")}>
          <View style={twStyle("rounded-t-3xl bg-white p-5")}>
            <Text style={twStyle("text-lg font-semibold text-gray-900")}>Order {checkoutProduct?.name}</Text>
            {(checkoutProduct?.checkout_options ?? []).map((opt) => (
              <TouchableOpacity
                key={opt.commercial_model}
                onPress={() => setCommercialModel(opt.commercial_model)}
                style={twStyle(
                  "mt-2 rounded-xl border p-3",
                  commercialModel === opt.commercial_model ? "border-gray-900 bg-gray-50" : "border-gray-200",
                )}
              >
                <Text style={twStyle("font-medium text-gray-900")}>{opt.label}</Text>
                <Text style={twStyle("text-sm text-gray-500")}>
                  {opt.requires_payment ? `${opt.currency} ${opt.price}` : "Included in plan"}
                </Text>
              </TouchableOpacity>
            ))}

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
                        "mb-2 rounded-xl border p-3",
                        collectionLocationId === loc.id ? "border-gray-900 bg-gray-50" : "border-gray-200",
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
                disabled={posting || allocating || paying}
                style={twStyle("rounded-xl bg-gray-900 px-4 py-2")}
              >
                <Text style={twStyle("font-medium text-white")}>
                  {posting || allocating || paying ? "Working…" : selectedOption?.requires_payment ? "Place & pay" : "Confirm"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}
