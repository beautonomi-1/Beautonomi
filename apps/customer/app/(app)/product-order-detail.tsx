import { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Image,
  Platform,
  Share,
  Alert,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import { api } from "@/lib/api-client";
import { Colors } from "@/constants/colors";
import { useResponsive } from "@/hooks/useResponsive";
import { useProductOrders, type ProductOrder } from "@/features/shop/useProductOrders";
import { getTenantLocaleTag } from "@/lib/locale";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";
import { formatMoney } from "@beautonomi/utils";

const PRIMARY = Colors.primary;
const RETURN_WINDOW_DAYS = 14;

function isWithinReturnWindow(order: ProductOrder): boolean {
  const from = order.delivered_at || order.created_at;
  if (!from) return false;
  const delivered = new Date(from);
  const days = (Date.now() - delivered.getTime()) / (1000 * 60 * 60 * 24);
  return days <= RETURN_WINDOW_DAYS;
}

function getStatusTimeline(fulfillmentType?: string) {
  const isCollection = fulfillmentType === "collection" || fulfillmentType === "pickup";
  return [
    { key: "pending", label: "Order Placed", icon: "receipt-outline" },
    { key: "confirmed", label: "Confirmed", icon: "checkmark-circle-outline" },
    { key: "processing", label: "Processing", icon: "construct-outline" },
    { key: isCollection ? "ready_for_collection" : "shipped", label: isCollection ? "Ready for Collection" : "Shipped", icon: isCollection ? "storefront-outline" : "airplane-outline" },
    { key: "delivered", label: isCollection ? "Collected" : "Delivered", icon: "checkmark-done-circle-outline" },
  ];
}

function formatDate(date: string | null) {
  if (!date) return null;
  const parsed = new Date(date);
  if (!Number.isFinite(parsed.getTime())) return "—";
  return parsed.toLocaleString(getTenantLocaleTag(), {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getTimelineIndex(status: string, fulfillmentType?: string): number {
  if (status === "cancelled" || status === "refunded") return -1;
  const timeline = getStatusTimeline(fulfillmentType);
  const idx = timeline.findIndex((s) => s.key === status);
  if (status === "ready_for_collection") return 3;
  return idx;
}

export default function ProductOrderDetailScreen() {
  const router = useRouter();
  const rawId = useLocalSearchParams<{ id?: string | string[] }>().id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  const { contentMaxWidth, isTablet, contentPadding } = useResponsive();
  const { fetchOrderDetail } = useProductOrders();
  const [order, setOrder] = useState<ProductOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const constraint = (isTablet || Platform.OS === "web") ? { maxWidth: Math.min(600, contentMaxWidth), alignSelf: "center" as const, width: "100%" as const } : {};

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setErrorMsg("Order ID is missing");
      return;
    }
    (async () => {
      setLoading(true);
      setErrorMsg(null);
      try {
        const result = await fetchOrderDetail(id);
        if (result.data) {
          setOrder(result.data);
        } else {
          setErrorMsg(result.error || "Order not found");
        }
      } catch {
        setErrorMsg("Unable to load order. Please check your connection.");
      }
      setLoading(false);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch when id changes
  }, [id]);

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" }}>
        <ActivityIndicator size="large" color={PRIMARY} />
      </SafeAreaView>
    );
  }

  if (!order) {
    return (
      <SafeAreaView style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" }}>
        <Text style={{ fontSize: 16, color: "#6B7280" }}>{errorMsg || "Order not found"}</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: PRIMARY, fontWeight: "600" }}>Go back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const isCancelled = order.status === "cancelled" || order.status === "refunded";
  const statusTimeline = getStatusTimeline((order as { fulfillment_type?: string }).fulfillment_type);
  const currentIdx = getTimelineIndex(order.status, (order as { fulfillment_type?: string }).fulfillment_type);
  const fb = getTenantDefaultCurrency();
  const cur = order.currency;
  const fmt = (amount: number) => formatMoney(amount, cur ?? fb);

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
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: "700", color: "#111827" }}>{order.order_number}</Text>
          <Text style={{ fontSize: 12, color: "#9CA3AF" }}>{formatDate(order.created_at)}</Text>
        </View>
        {/*
          §Customer-launch (audit 2026-04): web exposes a JSON receipt
          endpoint (/api/me/orders/[id]/receipt) but mobile had no way to
          surface/share one. Provide a native share action that builds a
          text receipt from the already-fetched order so customers can
          AirDrop / email / message it like a booking receipt.
        */}
        <TouchableOpacity
          onPress={async () => {
            try {
              const lines = [
                `Beautonomi Order`,
                `Order #${order.order_number}`,
                order.created_at ? `Placed: ${formatDate(order.created_at)}` : null,
                order.provider?.business_name ? `Seller: ${order.provider.business_name}` : null,
                `Status: ${order.status}`,
                ``,
                ...(order.items ?? []).map((it) => {
                  const variant = it.product_variant?.option_values
                    ? ` · ${Object.values(it.product_variant.option_values).join(", ")}`
                    : "";
                  return `• ${it.product_name}${variant} — ${it.quantity} × ${fmt(Number(it.unit_price ?? 0))}`;
                }),
                ``,
                `Subtotal: ${fmt(Number(order.subtotal ?? 0))}`,
                Number(order.delivery_fee ?? 0) > 0 ? `Delivery: ${fmt(Number(order.delivery_fee ?? 0))}` : null,
                Number(order.tax_amount ?? 0) > 0 ? `Tax: ${fmt(Number(order.tax_amount ?? 0))}` : null,
                `Total: ${fmt(Number(order.total_amount ?? 0))}`,
              ].filter(Boolean);
              await Share.share({
                message: lines.join("\n"),
                title: `Order ${order.order_number}`,
              });
            } catch (e) {
              Alert.alert("Share", e instanceof Error ? e.message : "Couldn't share this receipt.");
            }
          }}
          style={{ padding: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Share order receipt"
        >
          <Ionicons name="share-outline" size={22} color="#111827" />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={async () => {
            try {
              const res = await api.post<{ url?: string }>(
                `/api/me/orders/${order.id}/receipt/signed-url`,
                {},
              );
              const signedUrl = res.data?.url;
              if (res.error || !signedUrl) {
                const msg =
                  (res.error as { message?: string } | null)?.message ??
                  "Could not generate this receipt. Please try again.";
                Alert.alert("Download receipt", msg);
                return;
              }
              if (Platform.OS === "web") {
                await Linking.openURL(signedUrl);
                return;
              }
              const fileUri = `${FileSystem.cacheDirectory}order_${order.order_number || order.id}.pdf`;
              await FileSystem.downloadAsync(signedUrl, fileUri);
              await Share.share({
                url: fileUri,
                message: `Order ${order.order_number}`,
              });
            } catch (e) {
              Alert.alert(
                "Download receipt",
                e instanceof Error ? e.message : "Something went wrong.",
              );
            }
          }}
          style={{ padding: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Download order receipt"
        >
          <Ionicons name="download-outline" size={22} color="#111827" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: contentPadding,
          paddingBottom: 40,
          ...constraint,
        }}
      >
        {/* Status timeline */}
        <View style={{ backgroundColor: "#fff", padding: contentPadding, marginBottom: 12 }}>
          <Text style={{ fontSize: 16, fontWeight: "700", color: "#111827", marginBottom: 16 }}>
            Order Status
          </Text>
          {isCancelled ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                padding: contentPadding,
                borderRadius: 12,
                backgroundColor: "#FEF2F2",
              }}
            >
              <Ionicons name="close-circle" size={24} color="#EF4444" />
              <View style={{ marginLeft: 12 }}>
                <Text style={{ fontSize: 15, fontWeight: "600", color: "#EF4444" }}>
                  {order.status === "refunded" ? "Refunded" : "Cancelled"}
                </Text>
                {order.cancellation_reason && (
                  <Text style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>
                    {order.cancellation_reason}
                  </Text>
                )}
              </View>
            </View>
          ) : (
            statusTimeline.map((step, i) => {
              const completed = i <= currentIdx;
              const isActive = i === currentIdx;
              return (
                <View key={step.key} style={{ flexDirection: "row", marginBottom: i < statusTimeline.length - 1 ? 0 : 0 }}>
                  <View style={{ alignItems: "center", width: 32 }}>
                    <View
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 12,
                        backgroundColor: completed ? PRIMARY : "#E5E7EB",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Ionicons
                        name={completed ? "checkmark" : (step.icon as any)}
                        size={14}
                        color={completed ? "#fff" : "#9CA3AF"}
                      />
                    </View>
                    {i < statusTimeline.length - 1 && (
                      <View
                        style={{
                          width: 2,
                          height: 28,
                          backgroundColor: completed && i < currentIdx ? PRIMARY : "#E5E7EB",
                        }}
                      />
                    )}
                  </View>
                  <View style={{ flex: 1, marginLeft: 12, paddingBottom: 20 }}>
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: isActive ? "700" : "500",
                        color: completed ? "#111827" : "#9CA3AF",
                      }}
                    >
                      {step.label}
                    </Text>
                  </View>
                </View>
              );
            })
          )}

          {/* §Customer-audit 2026-04 (follow-up): when the provider records a
              `tracking_url`, render the whole row as a tappable link. Otherwise
              fall back to the existing number-only display. */}
          {order.tracking_number || order.tracking_url ? (
            (() => {
              const label = [
                order.carrier,
                order.tracking_number ? `#${order.tracking_number}` : null,
              ]
                .filter(Boolean)
                .join(" ");
              const display = label || "Track shipment";
              if (order.tracking_url) {
                return (
                  <TouchableOpacity
                    accessibilityRole="link"
                    accessibilityLabel={`Open tracking${order.carrier ? ` with ${order.carrier}` : ""}`}
                    onPress={async () => {
                      try {
                        await Linking.openURL(order.tracking_url!);
                      } catch {
                        Alert.alert("Could not open link", "Please copy the tracking number manually.");
                      }
                    }}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      marginTop: 12,
                      padding: 12,
                      borderRadius: 10,
                      backgroundColor: "#EFF6FF",
                    }}
                  >
                    <Ionicons name="location-outline" size={18} color="#3B82F6" />
                    <Text style={{ flex: 1, fontSize: 13, color: "#3B82F6", fontWeight: "600", marginLeft: 8 }} numberOfLines={1}>
                      Tracking: {display}
                    </Text>
                    <Ionicons name="open-outline" size={16} color="#3B82F6" />
                  </TouchableOpacity>
                );
              }
              return (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginTop: 12,
                    padding: 12,
                    borderRadius: 10,
                    backgroundColor: "#EFF6FF",
                  }}
                >
                  <Ionicons name="location-outline" size={18} color="#3B82F6" />
                  <Text style={{ fontSize: 13, color: "#3B82F6", fontWeight: "600", marginLeft: 8 }}>
                    Tracking: {display}
                  </Text>
                </View>
              );
            })()
          ) : null}
        </View>

        {/* Items */}
        <View style={{ backgroundColor: "#fff", padding: contentPadding, marginBottom: 12 }}>
          <Text style={{ fontSize: 16, fontWeight: "700", color: "#111827", marginBottom: 14 }}>
            Items
          </Text>
          {order.items?.map((item) => (
            <View
              key={item.id}
              style={{
                flexDirection: "row",
                paddingVertical: 10,
                borderBottomWidth: 1,
                borderBottomColor: "#F9FAFB",
              }}
            >
              <View
                style={{
                  width: 50,
                  height: 50,
                  borderRadius: 8,
                  overflow: "hidden",
                  backgroundColor: "#F3F4F6",
                }}
              >
                {item.product_image_url ? (
                  <Image
                    source={{ uri: item.product_image_url }}
                    style={{ width: "100%", height: "100%" }}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="cube-outline" size={20} color="#D1D5DB" />
                  </View>
                )}
              </View>
              <View style={{ flex: 1, marginLeft: 12, justifyContent: "center" }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827" }}>
                  {item.product_name}
                  {item.product_variant?.option_values && Object.keys(item.product_variant.option_values).length > 0 && (
                    <Text style={{ fontWeight: "400", color: "#9CA3AF" }}> · {Object.values(item.product_variant.option_values).join(", ")}</Text>
                  )}
                </Text>
                <Text style={{ fontSize: 12, color: "#9CA3AF" }}>
                  {item.quantity} x {fmt(Number(item.unit_price))}
                </Text>
              </View>
              <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827", alignSelf: "center" }}>
                {fmt(Number(item.total_price))}
              </Text>
            </View>
          ))}
        </View>

        {/* Fulfillment details */}
        <View style={{ backgroundColor: "#fff", padding: contentPadding, marginBottom: 12 }}>
          <Text style={{ fontSize: 16, fontWeight: "700", color: "#111827", marginBottom: 14 }}>
            {order.fulfillment_type === "delivery" ? "Delivery Details" : "Collection Details"}
          </Text>
          {order.fulfillment_type === "delivery" && order.delivery_address && (
            <View style={{ flexDirection: "row" }}>
              <Ionicons name="location-outline" size={20} color="#6B7280" />
              <View style={{ marginLeft: 10 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827" }}>
                  {order.delivery_address.label ?? "Delivery Address"}
                </Text>
                <Text style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>
                  {order.delivery_address.address_line1}, {order.delivery_address.city}
                </Text>
              </View>
            </View>
          )}
          {order.fulfillment_type === "collection" && order.collection_location && (
            <View style={{ flexDirection: "row" }}>
              <Ionicons name="storefront-outline" size={20} color="#6B7280" />
              <View style={{ marginLeft: 10 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827" }}>
                  {order.collection_location.name}
                </Text>
                <Text style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>
                  {order.collection_location.address_line1}, {order.collection_location.city}
                </Text>
                {order.collection_location.phone && (
                  <Text style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>
                    Tel: {order.collection_location.phone}
                  </Text>
                )}
              </View>
            </View>
          )}
        </View>

        {/* Payment summary — line items above + full breakdown */}
        <View style={{ backgroundColor: "#fff", padding: contentPadding }}>
          <Text style={{ fontSize: 16, fontWeight: "700", color: "#111827", marginBottom: 14 }}>
            Payment summary
          </Text>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
            <Text style={{ fontSize: 14, color: "#6B7280" }}>Items subtotal</Text>
            <Text style={{ fontSize: 14, color: "#111827", fontWeight: "600" }}>{fmt(Number(order.subtotal ?? 0))}</Text>
          </View>
          {Number(order.discount_amount ?? 0) > 0 && (
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
              <Text style={{ fontSize: 14, color: "#059669" }}>Discount</Text>
              <Text style={{ fontSize: 14, color: "#059669" }}>-{fmt(Number(order.discount_amount ?? 0))}</Text>
            </View>
          )}
          {Number(order.delivery_fee ?? 0) > 0 && (
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
              <Text style={{ fontSize: 14, color: "#6B7280" }}>Delivery</Text>
              <Text style={{ fontSize: 14, color: "#111827" }}>{fmt(Number(order.delivery_fee ?? 0))}</Text>
            </View>
          )}
          {Number(order.tax_amount ?? 0) > 0 && (
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
              <Text style={{ fontSize: 14, color: "#6B7280" }}>Tax</Text>
              <Text style={{ fontSize: 14, color: "#111827" }}>{fmt(Number(order.tax_amount ?? 0))}</Text>
            </View>
          )}
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#E5E7EB" }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151" }}>Calculated total</Text>
            <Text style={{ fontSize: 13, fontWeight: "700", color: "#111827" }}>
              {fmt(
                Math.max(
                  0,
                  Number(order.subtotal ?? 0) -
                    Number(order.discount_amount ?? 0) +
                    Number(order.delivery_fee ?? 0) +
                    Number(order.tax_amount ?? 0),
                ),
              )}
            </Text>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontSize: 18, fontWeight: "700", color: "#111827" }}>Charged total</Text>
            <Text style={{ fontSize: 18, fontWeight: "700", color: PRIMARY }}>{fmt(Number(order.total_amount ?? 0))}</Text>
          </View>
          {Math.abs(
            Number(order.total_amount ?? 0) -
              (Number(order.subtotal ?? 0) -
                Number(order.discount_amount ?? 0) +
                Number(order.delivery_fee ?? 0) +
                Number(order.tax_amount ?? 0)),
          ) > 0.02 && (
            <Text style={{ fontSize: 11, color: "#9CA3AF", marginTop: 8 }}>
              Small differences can come from rounding or wallet/promotions applied at checkout.
            </Text>
          )}
        </View>

        {/* Provider */}
        {order.provider && (
          <TouchableOpacity
            onPress={() => router.push({ pathname: "/(app)/partner-profile", params: { slug: order.provider.slug } } as never)}
            style={{ backgroundColor: "#fff", padding: contentPadding, marginBottom: 12, flexDirection: "row", alignItems: "center" }}
            activeOpacity={0.7}
          >
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center", marginRight: 12 }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: "#6B7280" }}>{(order.provider.business_name ?? "P").charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, color: "#9CA3AF" }}>Sold by</Text>
              <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827" }}>{order.provider.business_name}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
          </TouchableOpacity>
        )}

        {/* Return request action: only when delivered/ready_for_collection and within return window */}
        {["delivered", "ready_for_collection"].includes(order.status) && isWithinReturnWindow(order) && (
          <View style={{ padding: contentPadding, backgroundColor: "#fff", marginTop: 12 }}>
            <TouchableOpacity
              onPress={() =>
                router.push({ pathname: "/(app)/request-return", params: { order_id: order.id } } as any)
              }
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1.5,
                borderColor: "#EF4444",
                borderRadius: 12,
                paddingVertical: 14,
              }}
            >
              <Ionicons name="arrow-undo-outline" size={18} color="#EF4444" style={{ marginRight: 8 }} />
              <Text style={{ color: "#EF4444", fontWeight: "600", fontSize: 15 }}>
                Request Return / Refund
              </Text>
            </TouchableOpacity>
          </View>
        )}
        {["delivered", "ready_for_collection"].includes(order.status) && !isWithinReturnWindow(order) && (
          <View style={{ padding: contentPadding, marginTop: 12 }}>
            <Text style={{ fontSize: 13, color: "#6B7280", textAlign: "center" }}>
              Return window ({RETURN_WINDOW_DAYS} days) has passed. For help, contact support.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
