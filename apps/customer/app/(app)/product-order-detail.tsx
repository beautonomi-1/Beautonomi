import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Image,
  Platform,
  Alert,
  Linking,
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
import { api } from "@/lib/api-client";
import { emitNotificationBadgeRefresh } from "@/lib/notification-badge-events";
import { verifyPaystackWithRetry } from "@/lib/payments/verifyPaystackWithRetry";
import { downloadPdf } from "@/lib/pdf-file";
import { shareCustomerOrderReceipt } from "@/lib/share-receipt";
import { Colors } from "@/constants/colors";
import { useResponsive } from "@/hooks/useResponsive";
import { useProductOrders, type ProductOrder } from "@/features/shop/useProductOrders";
import { getTenantLocaleTag } from "@/lib/locale";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";
import { formatMoney } from "@beautonomi/utils";
import { useAuth } from "@/providers/AuthProvider";
import { useTranslation } from "@beautonomi/i18n";

const PRIMARY = Colors.primary;

function formatPaymentMethod(method: string | null | undefined): string | null {
  if (!method || typeof method !== "string") return null;
  const m = method.toLowerCase().trim();
  const labels: Record<string, string> = {
    paystack: "Card (Pay online)",
    wallet: "Wallet",
    cash: "Cash",
    yoco: "Yoco",
    card_on_delivery: "Card on delivery / collection",
  };
  return labels[m] ?? method.replace(/_/g, " ");
}
const RETURN_WINDOW_DAYS = 14;

const RETURN_BLOCKING_STATUSES = new Set([
  "pending",
  "approved",
  "item_received",
  "refunded",
  "escalated",
  "resolved_by_admin",
]);

function isWithinReturnWindow(order: ProductOrder): boolean {
  const from = order.delivered_at || order.created_at;
  if (!from) return false;
  const delivered = new Date(from);
  const days = (Date.now() - delivered.getTime()) / (1000 * 60 * 60 * 24);
  return days <= RETURN_WINDOW_DAYS;
}

/** True if at least one line item can still open a new return (aligned with customer web API rules). */
function customerHasReturnableLineItem(order: ProductOrder): boolean {
  const items = order.items ?? [];
  const returns = order.returns ?? [];
  return items.some((item) => {
    const blocked = returns.some((r) => {
      if (!RETURN_BLOCKING_STATUSES.has(r.status)) return false;
      const oid = r.order_item_id;
      return oid == null || oid === item.id;
    });
    return !blocked;
  });
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

/** `estimated_delivery_date` is often a DATE (yyyy-mm-dd) without time. */
function formatEstimatedDeliveryDate(date: string | null | undefined): string | null {
  if (!date || typeof date !== "string") return null;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(date.trim()) ? `${date.trim()}T12:00:00` : date.trim();
  const parsed = new Date(iso);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toLocaleDateString(getTenantLocaleTag(), {
    day: "numeric",
    month: "short",
    year: "numeric",
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
  const { user } = useAuth();
  const { t } = useTranslation();
  const pod = useCallback(
    (key: string, options?: Record<string, string | number>) => {
      const fullKey = `customer.mobile.screens.productOrderDetail.${key}`;
      return (options != null ? t(fullKey, options as never) : t(fullKey)) as string;
    },
    [t],
  );
  const rawId = useLocalSearchParams<{ id?: string | string[] }>().id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  const { contentMaxWidth, isTablet, contentPadding } = useResponsive();
  const { fetchOrderDetail } = useProductOrders();
  const [order, setOrder] = useState<ProductOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const paystackHostedCheckout = useInAppPaystackCheckout();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const constraint = (isTablet || Platform.OS === "web") ? { maxWidth: Math.min(600, contentMaxWidth), alignSelf: "center" as const, width: "100%" as const } : {};

  const openTrackingUrl = useCallback(
    async (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) return;
      const url = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
      try {
        const ok = await Linking.canOpenURL(url);
        if (ok) await Linking.openURL(url);
        else Alert.alert(pod("openLinkTitle"), pod("couldNotOpenUrl"));
      } catch {
        Alert.alert(pod("openLinkTitle"), pod("copyTrackingHint"));
      }
    },
    [pod],
  );

  const loadOrder = useCallback(async () => {
    if (!id) {
      setLoading(false);
      setErrorMsg(pod("orderIdMissing"));
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const result = await fetchOrderDetail(id);
      if (result.data) {
        setOrder(result.data);
      } else {
        setErrorMsg(result.error || pod("orderNotFound"));
      }
    } catch {
      setErrorMsg(pod("loadOrderError"));
    }
    setLoading(false);
  }, [id, fetchOrderDetail, pod]);

  useEffect(() => {
    void loadOrder();
  }, [loadOrder]);

  useEffect(() => {
    if (!id || typeof id !== "string") return;
    void api
      .post("/api/me/notifications/mark-related-read", { order_id: id })
      .then(() => emitNotificationBadgeRefresh())
      .catch(() => {});
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
        <Text style={{ fontSize: 16, color: "#6B7280" }}>{errorMsg || pod("orderNotFound")}</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: PRIMARY, fontWeight: "600" }}>{t("common.back")}</Text>
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
  const platformFee = Number(order.platform_fee ?? 0);
  const walletAmt = Number(order.wallet_amount ?? 0);
  const buyerName =
    order.customer?.full_name?.trim() ||
    order.customer_name?.trim() ||
    (typeof user?.user_metadata?.full_name === "string" ? user.user_metadata.full_name.trim() : "") ||
    null;
  const buyerEmail = order.customer?.email?.trim() || user?.email?.trim() || null;
  const buyerPhone =
    order.customer?.phone?.trim() ||
    order.customer_phone?.trim() ||
    user?.phone?.trim() ||
    null;
  const paymentMethodLabel = formatPaymentMethod(order.payment_method ?? undefined);
  const onlineAmountDue = Math.max(0, Number(order.total_amount ?? 0) - walletAmt);
  const canPayOnline =
    order.payment_status === "pending" &&
    (order.payment_method === "paystack" || order.payment_method == null) &&
    onlineAmountDue > 0;

  const handlePayOnline = async () => {
    if (!canPayOnline || paying) return;
    const email = buyerEmail;
    if (!email) {
      Alert.alert(pod("emailRequiredTitle"), pod("emailRequiredBody"));
      return;
    }

    setPaying(true);
    try {
      const paystackReturnPath =
        Platform.OS === "web" ? undefined : ExpoLinking.createURL("shop/paystack");
      const paystackRes = await api.post<{ authorization_url: string; reference: string }>(
        "/api/paystack/initialize",
        {
          email,
          amount: Math.round(onlineAmountDue * 100),
          ...(paystackReturnPath ? { callback_url: paystackReturnPath } : {}),
          metadata: {
            product_order_id: order.id,
            order_number: order.order_number,
            type: "product_order",
            mobile_app: "customer",
          },
        },
      );

      if (paystackRes.error || !paystackRes.data?.authorization_url) {
        Alert.alert(
          pod("paymentUnavailableTitle"),
          (paystackRes.error as { message?: string } | null)?.message ?? pod("paymentUnavailableBody"),
        );
        return;
      }

      const url = paystackRes.data.authorization_url;
      if (Platform.OS === "web") {
        window.location.href = url;
        return;
      }

      const pr = await paystackHostedCheckout.waitForCheckout(url, {
        title: pod("securePaymentTitle") || "Secure payment",
        returnUrl: paystackReturnPath ?? undefined,
        matchSuccess: (u) =>
          !!paystackReturnPath && matchesExpoReturnUrl(u, paystackReturnPath) && !isCancelledPaystackUrl(u),
        matchCancel: (u) => isCancelledPaystackUrl(u),
      });

      if (pr.outcome === "cancel") {
        Alert.alert(pod("paymentCancelledTitle"), pod("paymentCancelledBody"));
        return;
      }

      let reference = paystackRes.data.reference;
      if (pr.outcome === "success" && pr.url && !isCancelledPaystackUrl(pr.url)) {
        const extracted = extractPaystackReferenceFromUrl(pr.url);
        if (extracted) reference = extracted;
      }
      if (reference) {
        await verifyPaystackWithRetry(reference);
      }

      let paid = false;
      const maxAttempts = 10;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const check = await fetchOrderDetail(order.id);
        if (check.data) setOrder(check.data);
        if (check.data?.payment_status === "paid") {
          paid = true;
          break;
        }
        if (attempt < maxAttempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }

      if (paid) {
        Alert.alert(pod("paymentSuccessTitle"), pod("paymentSuccessBody", { orderNumber: order.order_number }));
      } else {
        Alert.alert(pod("paymentPendingTitle"), pod("paymentPendingBody"));
      }
    } catch (e) {
      Alert.alert(pod("paymentFailedTitle"), e instanceof Error ? e.message : pod("paymentFailedBody"));
    } finally {
      setPaying(false);
    }
  };

  return (
    <>
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
          onPress={() => {
            void shareCustomerOrderReceipt(order.id, order.order_number).catch((e) =>
              Alert.alert(pod("shareErrorTitle"), e instanceof Error ? e.message : pod("shareErrorBody")),
            );
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
              await downloadPdf({
                router,
                pdfPath: `/api/me/orders/${encodeURIComponent(order.id)}/receipt/pdf`,
                signedUrlPath: `/api/me/orders/${encodeURIComponent(order.id)}/receipt/signed-url`,
                filename: `order_${order.order_number || order.id}.pdf`,
                title: `Order ${order.order_number}`,
                label: pod("downloadReceiptTitle"),
              });
            } catch (e) {
              Alert.alert(pod("downloadReceiptTitle"), e instanceof Error ? e.message : pod("downloadUnknownError"));
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

          {/* When the provider sets tracking_url, the row opens the carrier page; otherwise number-only. */}
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
                    onPress={() => {
                      void openTrackingUrl(order.tracking_url!);
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

        {/* Returns */}
        {order.returns && order.returns.length > 0 ? (
          <View style={{ backgroundColor: "#fff", padding: contentPadding, marginBottom: 12 }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: "#111827", marginBottom: 14 }}>
              Returns & Refunds
            </Text>
            {order.returns.map((ret) => {
              const isApproved = ret.status === "approved";
              const isRefunded = ret.status === "refunded";
              const isRejected = ret.status === "rejected";
              const isPending = ret.status === "pending";
              const isReceived = ret.status === "item_received";
              const isEscalated = ret.status === "escalated";
              const isCancelled = ret.status === "cancelled";
              const isResolvedAdmin = ret.status === "resolved_by_admin";

              let statusColor = "#6B7280";
              let bgColor = "#F3F4F6";
              let iconName = "time-outline";
              
              if (isApproved || isRefunded || isReceived) {
                statusColor = "#059669";
                bgColor = "#D1FAE5";
                iconName = "checkmark-circle-outline";
              } else if (isRejected || isEscalated) {
                statusColor = "#DC2626";
                bgColor = "#FEE2E2";
                iconName = "close-circle-outline";
              } else if (isPending) {
                statusColor = "#D97706";
                bgColor = "#FEF3C7";
              }

              let title = "Return Request";
              if (isRefunded) title = "Refund Processed";
              else if (isApproved) title = "Return Approved";
              else if (isReceived) title = "Item Received";
              else if (isRejected) title = "Return Rejected";
              else if (isEscalated) title = "Return Escalated";
              else if (isCancelled) title = "Return Cancelled";

              return (
                <View key={ret.id} style={{ marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <Text style={{ fontSize: 14, fontWeight: "600", color: "#374151" }}>{title}</Text>
                    <View style={{ backgroundColor: bgColor, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, flexDirection: "row", alignItems: "center" }}>
                      <Ionicons name={iconName as any} size={14} color={statusColor} style={{ marginRight: 4 }} />
                      <Text style={{ fontSize: 12, fontWeight: "600", color: statusColor, textTransform: "capitalize" }}>
                        {ret.status}
                      </Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 13, color: "#6B7280", marginBottom: 4 }}>
                    <Text style={{ fontWeight: "600" }}>Reason:</Text> {ret.reason.replace(/_/g, " ")}
                  </Text>
                  {ret.description ? (
                    <Text style={{ fontSize: 13, color: "#6B7280", marginBottom: 4 }}>
                      <Text style={{ fontWeight: "600" }}>Details:</Text> {ret.description}
                    </Text>
                  ) : null}
                  {ret.refund_amount ? (
                    <Text style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>
                      <Text style={{ fontWeight: "600" }}>Refund Amount:</Text> {fmt(ret.refund_amount)}
                    </Text>
                  ) : null}
                  <Text style={{ fontSize: 12, color: "#9CA3AF", marginTop: 8 }}>
                    Requested on {formatDate(ret.created_at)}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : null}

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

        {/* Buyer / contact on this order */}
        <View style={{ backgroundColor: "#fff", padding: contentPadding, marginBottom: 12 }}>
          <Text style={{ fontSize: 16, fontWeight: "700", color: "#111827", marginBottom: 14 }}>
            Your details
          </Text>
          {buyerName ? (
            <View style={{ marginBottom: 10 }}>
              <Text style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 2 }}>Name</Text>
              <Text style={{ fontSize: 14, color: "#111827", fontWeight: "600" }}>{buyerName}</Text>
            </View>
          ) : null}
          {buyerEmail ? (
            <View style={{ marginBottom: 10 }}>
              <Text style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 2 }}>Email</Text>
              <Text style={{ fontSize: 14, color: "#111827" }}>{buyerEmail}</Text>
            </View>
          ) : null}
          {buyerPhone ? (
            <View style={{ marginBottom: 10 }}>
              <Text style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 2 }}>Phone</Text>
              <Text style={{ fontSize: 14, color: "#111827" }}>{buyerPhone}</Text>
            </View>
          ) : null}
          {!buyerName && !buyerEmail && !buyerPhone ? (
            <Text style={{ fontSize: 13, color: "#6B7280" }}>No contact details on file for this order.</Text>
          ) : null}
          {paymentMethodLabel ? (
            <View style={{ marginTop: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#F3F4F6" }}>
              <Text style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 2 }}>Payment method</Text>
              <Text style={{ fontSize: 14, color: "#111827" }}>{paymentMethodLabel}</Text>
            </View>
          ) : null}
          {order.payment_status ? (
            <View style={{ marginTop: 10 }}>
              <Text style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 2 }}>Payment status</Text>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "700",
                  color: order.payment_status === "paid" ? "#059669" : order.payment_status === "failed" ? "#DC2626" : "#D97706",
                }}
              >
                {order.payment_status.replace(/_/g, " ")}
              </Text>
            </View>
          ) : null}
          {canPayOnline ? (
            <TouchableOpacity
              onPress={handlePayOnline}
              disabled={paying}
              style={{
                marginTop: 14,
                borderRadius: 12,
                backgroundColor: paying ? "#D1D5DB" : PRIMARY,
                paddingVertical: 13,
                alignItems: "center",
                justifyContent: "center",
              }}
              accessibilityRole="button"
              accessibilityLabel="Pay order online"
            >
              {paying ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={{ color: "#fff", fontWeight: "700" }}>
                  Pay {fmt(onlineAmountDue)} online
                </Text>
              )}
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Fulfillment details */}
        <View style={{ backgroundColor: "#fff", padding: contentPadding, marginBottom: 12 }}>
          <Text style={{ fontSize: 16, fontWeight: "700", color: "#111827", marginBottom: 14 }}>
            {order.fulfillment_type === "delivery" ? "Delivery Details" : "Collection Details"}
          </Text>
          {order.fulfillment_type === "delivery" && order.delivery_address && (
            <View style={{ flexDirection: "row" }}>
              <Ionicons name="location-outline" size={20} color="#6B7280" />
              <View style={{ marginLeft: 10, flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827" }}>
                  {order.delivery_address.label ?? "Delivery Address"}
                </Text>
                <Text style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>
                  {order.delivery_address.address_line1}
                  {order.delivery_address.address_line2 ? `, ${order.delivery_address.address_line2}` : ""}
                </Text>
                <Text style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>
                  {[order.delivery_address.city, order.delivery_address.state, order.delivery_address.postal_code]
                    .filter(Boolean)
                    .join(", ")}
                  {order.delivery_address.country ? ` · ${order.delivery_address.country}` : ""}
                </Text>
              </View>
            </View>
          )}
          {order.fulfillment_type === "collection" && order.collection_location && (
            <View style={{ flexDirection: "row" }}>
              <Ionicons name="storefront-outline" size={20} color="#6B7280" />
              <View style={{ marginLeft: 10, flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827" }}>
                  {order.collection_location.name}
                </Text>
                <Text style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>
                  {order.collection_location.address_line1}
                  {order.collection_location.address_line2 ? `, ${order.collection_location.address_line2}` : ""}
                </Text>
                <Text style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>
                  {[order.collection_location.city, order.collection_location.state, order.collection_location.postal_code]
                    .filter(Boolean)
                    .join(", ")}
                </Text>
                {order.collection_location.phone && (
                  <Text style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>
                    Tel: {order.collection_location.phone}
                  </Text>
                )}
              </View>
            </View>
          )}
          {(formatEstimatedDeliveryDate(order.estimated_delivery_date) || order.delivery_instructions?.trim()) &&
          order.fulfillment_type === "delivery" ? (
            <View style={{ marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: "#F3F4F6" }}>
              <Text style={{ fontSize: 13, fontWeight: "600", color: "#111827", marginBottom: 6 }}>Delivery notes</Text>
              {formatEstimatedDeliveryDate(order.estimated_delivery_date) ? (
                <Text style={{ fontSize: 13, color: "#6B7280" }}>
                  Estimated delivery: {formatEstimatedDeliveryDate(order.estimated_delivery_date)}
                </Text>
              ) : null}
              {order.delivery_instructions?.trim() ? (
                <Text style={{ fontSize: 13, color: "#4B5563", marginTop: 6 }}>{order.delivery_instructions.trim()}</Text>
              ) : null}
            </View>
          ) : null}
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
          {platformFee > 0 && (
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
              <Text style={{ fontSize: 14, color: "#6B7280" }}>Platform fee</Text>
              <Text style={{ fontSize: 14, color: "#111827" }}>{fmt(platformFee)}</Text>
            </View>
          )}
          {walletAmt > 0 && (
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
              <Text style={{ fontSize: 14, color: "#6B7280" }}>Paid from wallet</Text>
              <Text style={{ fontSize: 14, color: "#059669" }}>{fmt(walletAmt)}</Text>
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
                    Number(order.tax_amount ?? 0) +
                    platformFee,
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
                Number(order.tax_amount ?? 0) +
                platformFee),
          ) > 0.02 && (
            <Text style={{ fontSize: 11, color: "#9CA3AF", marginTop: 8 }}>
              Small differences can come from rounding or promotions applied at checkout.
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
        {["delivered", "ready_for_collection"].includes(order.status) &&
          isWithinReturnWindow(order) &&
          customerHasReturnableLineItem(order) && (
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
              Return window ({RETURN_WINDOW_DAYS} days) has passed. For help, open Profile → Help centre → New ticket.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
    {paystackHostedCheckout.modal}
    </>
  );
}
