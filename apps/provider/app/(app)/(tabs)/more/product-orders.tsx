import { useCallback, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  RefreshControl,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { api } from "@/lib/api-client";
import { useResponsive } from "@/hooks/useResponsive";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ActionButton } from "@/components/ui/ActionButton";
import { formatCurrency } from "@/lib/format";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";
import { twStyle } from "@/lib/twStyle";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface OrderItem {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  product_variant?: { option_values?: Record<string, string> } | null;
}

interface Order {
  id: string;
  order_number: string;
  total_amount: number | string;
  status: string;
  payment_status?: string;
  fulfillment_type?: string;
  tracking_number?: string | null;
  carrier?: string | null;
  created_at: string;
  items?: OrderItem[];
  customer?: { full_name?: string | null; email?: string | null; phone?: string | null };
}

interface OrdersListResponse {
  orders: Order[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const STATUS_OPTIONS = [
  { value: "", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "processing", label: "Processing" },
  { value: "ready_for_collection", label: "Ready" },
  { value: "shipped", label: "Shipped" },
  { value: "delivered", label: "Delivered" },
];

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  pending:               { bg: "#fef3c7", text: "#92400e" },
  confirmed:             { bg: "#dbeafe", text: "#1e40af" },
  processing:            { bg: "#ede9fe", text: "#5b21b6" },
  ready_for_collection:  { bg: "#d1fae5", text: "#065f46" },
  shipped:               { bg: "#e0f2fe", text: "#0369a1" },
  delivered:             { bg: "#dcfce7", text: "#166534" },
  cancelled:             { bg: "#fee2e2", text: "#991b1b" },
  refunded:              { bg: "#f3f4f6", text: "#374151" },
};

/* ------------------------------------------------------------------ */
/*  Status state machine                                               */
/* ------------------------------------------------------------------ */

function getNextStatusOptions(current: string): string[] {
  const map: Record<string, string[]> = {
    pending:              ["confirmed", "cancelled"],
    confirmed:            ["processing", "cancelled"],
    processing:           ["ready_for_collection", "shipped", "cancelled"],
    ready_for_collection: ["delivered", "cancelled"],
    shipped:              ["delivered"],
    delivered:            ["refunded"],
  };
  return map[current] ?? [];
}

/* ------------------------------------------------------------------ */
/*  Component (exported for embedding in hub tabs)                     */
/* ------------------------------------------------------------------ */

export function ProductOrdersContent() {
  const { screenPadding } = useResponsive();
  const currency = getTenantDefaultCurrency();

  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");

  const [viewOrder, setViewOrder] = useState<Order | null>(null);
  const [orderDetail, setOrderDetail] = useState<Order | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Tracking number sheet (shown when marking "shipped")
  const [trackingSheetOpen, setTrackingSheetOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [trackingNumber, setTrackingNumber] = useState("");
  const [carrier, setCarrier] = useState("");

  const url = `/api/provider/product-orders?limit=100${statusFilter ? `&status=${statusFilter}` : ""}`;
  const { data, loading, error, refresh } = useApi<OrdersListResponse>(url);
  const { execute: patchOrder, loading: patching } = useApiMutation<{ order: Order }>("patch");

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const allOrders = data?.orders ?? [];
  const orders = search.trim()
    ? allOrders.filter((o) => {
        const q = search.toLowerCase();
        return (
          o.order_number.toLowerCase().includes(q) ||
          (o.customer?.full_name ?? "").toLowerCase().includes(q) ||
          (o.customer?.email ?? "").toLowerCase().includes(q)
        );
      })
    : allOrders;

  const openOrder = useCallback(async (order: Order) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setViewOrder(order);
    setOrderDetail(null);
    setLoadingDetail(true);
    try {
      const res = await api.get<{ order: Order }>(`/api/provider/product-orders/${order.id}`);
      setOrderDetail(res.data?.order ?? order);
    } catch {
      setOrderDetail(order);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  const doUpdateStatus = useCallback(
    async (orderId: string, status: string, extra?: { tracking_number?: string; carrier?: string }) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const { error: err } = await patchOrder(`/api/provider/product-orders/${orderId}`, {
        status,
        ...extra,
      });
      if (err) {
        Alert.alert("Error", err);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setViewOrder(null);
        setOrderDetail(null);
        setTrackingSheetOpen(false);
        setPendingStatus(null);
        setTrackingNumber("");
        setCarrier("");
        refresh();
      }
    },
    [patchOrder, refresh]
  );

  const handleStatusTap = useCallback(
    (orderId: string, status: string) => {
      if (status === "shipped") {
        setPendingStatus(orderId + "|" + status);
        setTrackingNumber("");
        setCarrier("");
        setTrackingSheetOpen(true);
      } else if (status === "cancelled") {
        Alert.alert(
          "Cancel order",
          "Are you sure you want to cancel this order? Stock will be restored.",
          [
            { text: "No", style: "cancel" },
            { text: "Cancel order", style: "destructive", onPress: () => doUpdateStatus(orderId, status) },
          ]
        );
      } else if (status === "refunded") {
        Alert.alert(
          "Mark as refunded",
          "Confirm that this order has been refunded to the customer.",
          [
            { text: "No", style: "cancel" },
            { text: "Mark refunded", style: "destructive", onPress: () => doUpdateStatus(orderId, status) },
          ]
        );
      } else {
        doUpdateStatus(orderId, status);
      }
    },
    [doUpdateStatus]
  );

  const handleConfirmShipped = useCallback(() => {
    if (!pendingStatus) return;
    const [orderId] = pendingStatus.split("|");
    doUpdateStatus(orderId, "shipped", {
      tracking_number: trackingNumber.trim() || undefined,
      carrier: carrier.trim() || undefined,
    });
  }, [pendingStatus, trackingNumber, carrier, doUpdateStatus]);

  if (loading && !data) {
    return (
      <View style={twStyle("flex-1 items-center justify-center py-12")}>
        <LoadingState />
      </View>
    );
  }
  if (error && !data) {
    return (
      <View style={twStyle("flex-1 justify-center px-4")}>
        <ErrorState message={error} onRetry={refresh} />
      </View>
    );
  }

  const activeOrder = orderDetail ?? viewOrder;

  return (
    <>
      {/* ── Search ── */}
      <View style={[twStyle("mx-4 mb-2 flex-row items-center rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2.5")]}>
        <Ionicons name="search-outline" size={15} color="#9ca3af" />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search by order number or customer…"
          placeholderTextColor="#9ca3af"
          style={twStyle("ml-2 flex-1 text-sm text-gray-900")}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          accessibilityLabel="Search orders"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch("")} accessibilityLabel="Clear search">
            <Ionicons name="close-circle" size={16} color="#9ca3af" />
          </TouchableOpacity>
        )}
      </View>

      {/* ── Status filter chips ── */}
      <View style={twStyle("mb-2")}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: screenPadding, gap: 8 }}
        >
          {STATUS_OPTIONS.map((opt) => {
            const active = statusFilter === opt.value;
            return (
              <TouchableOpacity
                key={opt.value || "all"}
                onPress={() => setStatusFilter(opt.value)}
                style={twStyle(
                  `rounded-full px-3.5 py-1.5 ${active ? "bg-pink-600" : "border border-gray-200 bg-white"}`
                )}
                accessibilityLabel={`Filter by ${opt.label}`}
              >
                <Text style={twStyle(`text-xs font-semibold ${active ? "text-white" : "text-gray-600"}`)}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Order list ── */}
      <ScrollView
        style={twStyle("flex-1")}
        contentContainerStyle={{ paddingHorizontal: screenPadding, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {orders.length === 0 ? (
          <View style={twStyle("items-center py-16")}>
            <View style={twStyle("mb-4 h-16 w-16 items-center justify-center rounded-full bg-pink-100")}>
              <Ionicons name="bag-handle-outline" size={32} color="#ec4899" />
            </View>
            <Text style={twStyle("text-center font-semibold text-gray-900")}>No orders</Text>
            <Text style={twStyle("mt-1 text-center text-sm text-gray-500")}>
              {search || statusFilter
                ? "No orders match your search or filter."
                : "Customer product orders will appear here."}
            </Text>
          </View>
        ) : (
          orders.map((order) => {
            const st = STATUS_STYLE[order.status] ?? { bg: "#f3f4f6", text: "#374151" };
            return (
              <TouchableOpacity
                key={order.id}
                onPress={() => openOrder(order)}
                activeOpacity={0.7}
                style={twStyle("mb-2.5 rounded-2xl border border-gray-100 bg-white p-4")}
                accessibilityLabel={`Order ${order.order_number}`}
                accessibilityRole="button"
              >
                <View style={twStyle("flex-row items-center")}>
                  <View style={twStyle("h-10 w-10 items-center justify-center rounded-xl bg-pink-100")}>
                    <Ionicons name="receipt-outline" size={20} color="#ec4899" />
                  </View>
                  <View style={twStyle("ml-3 flex-1 min-w-0")}>
                    <View style={twStyle("flex-row items-center justify-between")}>
                      <Text style={twStyle("font-semibold text-gray-900")} numberOfLines={1}>
                        {order.order_number}
                      </Text>
                      <View style={[twStyle("rounded-full px-2.5 py-0.5"), { backgroundColor: st.bg }]}>
                        <Text style={[twStyle("text-xs font-medium capitalize"), { color: st.text }]}>
                          {order.status.replace(/_/g, " ")}
                        </Text>
                      </View>
                    </View>
                    <Text style={twStyle("mt-0.5 text-sm text-gray-600")} numberOfLines={1}>
                      {order.customer?.full_name ?? "Customer"}{" "}
                      · {formatCurrency(Number(order.total_amount), currency)}
                    </Text>
                    {order.tracking_number && (
                      <Text style={twStyle("mt-0.5 text-xs text-gray-400")}>
                        Tracking: {order.tracking_number}
                      </Text>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#d1d5db" style={{ marginLeft: 8 }} />
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* ── Order detail bottom sheet ── */}
      {viewOrder && (
        <BottomSheet
          visible={!!viewOrder}
          onClose={() => { setViewOrder(null); setOrderDetail(null); }}
          title={viewOrder.order_number}
          subtitle={activeOrder?.customer?.full_name ?? "Order details"}
          snapHeight="full"
        >
          {loadingDetail ? (
            <View style={twStyle("items-center py-6")}>
              <LoadingState />
            </View>
          ) : activeOrder ? (
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
              {/* Status + payment status badges */}
              <View style={twStyle("mb-3 flex-row flex-wrap gap-2")}>
                {(() => {
                  const st = STATUS_STYLE[activeOrder.status] ?? { bg: "#f3f4f6", text: "#374151" };
                  return (
                    <View style={[twStyle("rounded-full px-3 py-1"), { backgroundColor: st.bg }]}>
                      <Text style={[twStyle("text-sm font-semibold capitalize"), { color: st.text }]}>
                        {activeOrder.status.replace(/_/g, " ")}
                      </Text>
                    </View>
                  );
                })()}
                {activeOrder.payment_status && (
                  <View style={twStyle("rounded-full bg-emerald-100 px-3 py-1")}>
                    <Text style={twStyle("text-sm font-semibold capitalize text-emerald-800")}>
                      {activeOrder.payment_status}
                    </Text>
                  </View>
                )}
                {activeOrder.fulfillment_type && (
                  <View style={twStyle("rounded-full bg-gray-100 px-3 py-1")}>
                    <Text style={twStyle("text-xs font-medium text-gray-600 capitalize")}>
                      {activeOrder.fulfillment_type.replace(/_/g, " ")}
                    </Text>
                  </View>
                )}
              </View>

              {/* Customer info */}
              {(activeOrder.customer?.email || activeOrder.customer?.phone) && (
                <View style={twStyle("mb-3 rounded-xl bg-gray-50 px-4 py-3")}>
                  <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1")}>
                    Customer
                  </Text>
                  {activeOrder.customer?.email && (
                    <Text style={twStyle("text-sm text-gray-700")}>{activeOrder.customer.email}</Text>
                  )}
                  {activeOrder.customer?.phone && (
                    <Text style={twStyle("text-sm text-gray-700")}>{activeOrder.customer.phone}</Text>
                  )}
                </View>
              )}

              {/* Tracking info */}
              {activeOrder.tracking_number && (
                <View style={twStyle("mb-3 rounded-xl bg-blue-50 px-4 py-3")}>
                  <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-blue-400 mb-1")}>
                    Tracking
                  </Text>
                  {activeOrder.carrier && (
                    <Text style={twStyle("text-sm font-medium text-blue-800")}>{activeOrder.carrier}</Text>
                  )}
                  <Text style={twStyle("text-sm text-blue-700")}>{activeOrder.tracking_number}</Text>
                </View>
              )}

              {/* Line items */}
              <Text style={twStyle("mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400")}>
                Items
              </Text>
              {(activeOrder.items ?? []).map((item) => {
                const variantLabel =
                  item.product_variant?.option_values &&
                  Object.keys(item.product_variant.option_values).length > 0
                    ? " · " + Object.values(item.product_variant.option_values).join(", ")
                    : "";
                return (
                  <View
                    key={item.id}
                    style={twStyle("mb-2 flex-row items-center justify-between rounded-xl bg-gray-50 px-3 py-2.5")}
                  >
                    <Text style={twStyle("flex-1 text-sm text-gray-900")} numberOfLines={2}>
                      {item.product_name}
                      {variantLabel}
                      {" × "}
                      {item.quantity}
                    </Text>
                    <Text style={twStyle("ml-3 text-sm font-semibold text-gray-800")}>
                      {formatCurrency(Number(item.total_price), currency)}
                    </Text>
                  </View>
                );
              })}
              <View style={twStyle("mb-4 flex-row justify-end")}>
                <Text style={twStyle("text-base font-bold text-gray-900")}>
                  Total {formatCurrency(Number(activeOrder.total_amount), currency)}
                </Text>
              </View>

              {/* Status action buttons */}
              {getNextStatusOptions(activeOrder.status).length > 0 && (
                <View>
                  <Text style={twStyle("mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400")}>
                    Update status
                  </Text>
                  <View style={twStyle("flex-row flex-wrap gap-2")}>
                    {getNextStatusOptions(activeOrder.status).map((status) => {
                      const isCancel = status === "cancelled";
                      const isShip = status === "shipped";
                      const isRefund = status === "refunded";
                      const bgClass = isCancel || isRefund
                        ? "border border-red-200 bg-red-50"
                        : isShip
                          ? "bg-blue-600"
                          : "bg-pink-600";
                      const iconMap: Record<string, string> = {
                        confirmed: "✅",
                        processing: "🔄",
                        ready_for_collection: "🏪",
                        shipped: "📦",
                        delivered: "🎉",
                        refunded: "↩️",
                        cancelled: "✕",
                      };
                      return (
                        <TouchableOpacity
                          key={status}
                          onPress={() => handleStatusTap(activeOrder.id, status)}
                          disabled={patching}
                          style={[
                            twStyle(`rounded-xl px-4 py-2.5 ${bgClass}`),
                            patching ? { opacity: 0.6 } : undefined,
                          ]}
                          accessibilityLabel={`Mark as ${status}`}
                        >
                          <Text
                            style={twStyle(
                              `text-sm font-semibold capitalize ${
                                isCancel || isRefund ? "text-red-600" : "text-white"
                              }`
                            )}
                          >
                            {iconMap[status] ?? ""} Mark {status.replace(/_/g, " ")}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}
            </KeyboardAvoidingView>
          ) : null}
        </BottomSheet>
      )}

      {/* ── Tracking number sheet (shown when marking shipped) ── */}
      <BottomSheet
        visible={trackingSheetOpen}
        onClose={() => { setTrackingSheetOpen(false); setPendingStatus(null); }}
        title="Mark as shipped"
        subtitle="Add tracking details (optional)"
      >
        <View style={twStyle("gap-3 pb-6")}>
          <View>
            <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Tracking number</Text>
            <TextInput
              value={trackingNumber}
              onChangeText={setTrackingNumber}
              placeholder="e.g. 1Z999AA10123456784"
              placeholderTextColor="#9ca3af"
              autoCapitalize="characters"
              returnKeyType="next"
              style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
              accessibilityLabel="Tracking number"
            />
          </View>
          <View>
            <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Carrier / courier</Text>
            <TextInput
              value={carrier}
              onChangeText={setCarrier}
              placeholder="e.g. Aramex, DHL, Paxi"
              placeholderTextColor="#9ca3af"
              returnKeyType="done"
              style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
              accessibilityLabel="Carrier name"
            />
          </View>
          <ActionButton
            label={patching ? "Saving…" : "Confirm shipped"}
            onPress={handleConfirmShipped}
            loading={patching}
            disabled={patching}
            fullWidth
          />
          <TouchableOpacity
            onPress={() => { setTrackingSheetOpen(false); setPendingStatus(null); }}
            style={twStyle("items-center py-2")}
          >
            <Text style={twStyle("text-sm text-gray-400")}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </BottomSheet>
    </>
  );
}

export default function ProductOrdersScreen() {
  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader title="Product Orders" showBack subtitle="Customer orders" />
      <ProductOrdersContent />
    </ScreenContainer>
  );
}
