import { useCallback, useState, useEffect, useRef } from "react";
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
  Linking,
  Share as RNShare,
} from "react-native";
import { cacheDirectory, downloadAsync } from "expo-file-system/legacy";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { api } from "@/lib/api-client";
import { pushInAppBrowser } from "@/lib/in-app-web";
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

interface OrderAddress {
  id?: string;
  label?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
  apartment_unit?: string | null;
  building_name?: string | null;
  floor_number?: string | null;
  parking_instructions?: string | null;
  location_landmarks?: string | null;
}

interface OrderCollectionLocation {
  id?: string;
  name?: string | null;
  address_line1?: string | null;
  city?: string | null;
}

interface Order {
  id: string;
  order_number: string;
  total_amount: number | string;
  subtotal?: number | string | null;
  tax_amount?: number | string | null;
  delivery_fee?: number | string | null;
  discount_amount?: number | string | null;
  currency?: string | null;
  status: string;
  payment_status?: string;
  fulfillment_type?: string;
  order_source?: string | null;
  tracking_number?: string | null;
  carrier?: string | null;
  tracking_url?: string | null;
  delivery_instructions?: string | null;
  estimated_delivery_date?: string | null;
  confirmed_at?: string | null;
  shipped_at?: string | null;
  delivered_at?: string | null;
  cancelled_at?: string | null;
  cancellation_reason?: string | null;
  created_at: string;
  items?: OrderItem[];
  customer?: { full_name?: string | null; email?: string | null; phone?: string | null } | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  delivery_address?: OrderAddress | OrderAddress[] | null;
  collection_location?: OrderCollectionLocation | OrderCollectionLocation[] | null;
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

/** Ionicons for status transitions (replaces emoji-only labels). */
const STATUS_ACTION_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  confirmed: "checkmark-circle-outline",
  processing: "construct-outline",
  ready_for_collection: "storefront-outline",
  shipped: "cube-outline",
  delivered: "checkmark-done-outline",
  refunded: "return-down-back-outline",
  cancelled: "close-circle-outline",
};

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

function numOrZero(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function formatOrderDateLabel(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function unwrapOne<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function formatAddressLines(addr: OrderAddress | null): string[] {
  if (!addr) return [];
  const lines: string[] = [];
  const line1 = [addr.apartment_unit, addr.building_name, addr.address_line1].filter(Boolean).join(", ").trim();
  if (line1) lines.push(line1);
  if (addr.address_line2?.trim()) lines.push(addr.address_line2.trim());
  const cityLine = [addr.city, addr.state, addr.postal_code].filter(Boolean).join(", ").trim();
  if (cityLine) lines.push(cityLine);
  if (addr.country?.trim()) lines.push(addr.country.trim());
  if (addr.parking_instructions?.trim()) lines.push(`Parking: ${addr.parking_instructions.trim()}`);
  if (addr.location_landmarks?.trim()) lines.push(`Landmarks: ${addr.location_landmarks.trim()}`);
  return lines;
}

async function openExternalUrl(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const ok = await Linking.canOpenURL(withScheme);
    if (ok) await Linking.openURL(withScheme);
    else Alert.alert("Open link", "This device cannot open that URL.");
  } catch {
    Alert.alert("Open link", "Could not open the tracking page.");
  }
}

/* ------------------------------------------------------------------ */
/*  Component (exported for embedding in hub tabs)                     */
/* ------------------------------------------------------------------ */

export function ProductOrdersContent({ deepLinkOrderId }: { deepLinkOrderId?: string }) {
  const router = useRouter();
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
  const [trackingUrl, setTrackingUrl] = useState("");

  const url = `/api/provider/product-orders?limit=100${statusFilter ? `&status=${statusFilter}` : ""}`;
  const { data, loading, error, refresh } = useApi<OrdersListResponse>(url);
  const { execute: patchOrder, loading: patching } = useApiMutation<{ order: Order }>("patch");

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const allOrders = data?.orders ?? [];
  const orders = search.trim()
    ? allOrders.filter((o) => {
        const q = search.toLowerCase();
        return (
          o.order_number.toLowerCase().includes(q) ||
          (o.customer?.full_name ?? "").toLowerCase().includes(q) ||
          (o.customer?.email ?? "").toLowerCase().includes(q) ||
          (o.customer_name ?? "").toLowerCase().includes(q) ||
          (o.customer_phone ?? "").toLowerCase().includes(q)
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

  const deepLinkOpenedRef = useRef<string | null>(null);
  const deepLinkFetchDoneRef = useRef<string | null>(null);
  const allOrdersRef = useRef(allOrders);
  allOrdersRef.current = allOrders;

  useEffect(() => {
    if (!deepLinkOrderId?.trim()) {
      deepLinkOpenedRef.current = null;
      deepLinkFetchDoneRef.current = null;
      return;
    }
    const id = deepLinkOrderId.trim();
    if (deepLinkOpenedRef.current && deepLinkOpenedRef.current !== id) {
      deepLinkOpenedRef.current = null;
    }
    if (deepLinkFetchDoneRef.current && deepLinkFetchDoneRef.current !== id) {
      deepLinkFetchDoneRef.current = null;
    }
    if (loading) return;
    if (deepLinkOpenedRef.current === id) return;

    const fromList = allOrdersRef.current.find((o) => o.id === id);
    if (fromList) {
      deepLinkOpenedRef.current = id;
      void openOrder(fromList);
      return;
    }

    if (deepLinkFetchDoneRef.current === id) return;
    deepLinkFetchDoneRef.current = id;
    void (async () => {
      try {
        const res = await api.get<{ order: Order }>(`/api/provider/product-orders/${id}`);
        const ord = res.data?.order;
        if (ord) {
          deepLinkOpenedRef.current = id;
          openOrder(ord);
        }
      } catch {
        // Order missing or inaccessible; user stays on list
      }
    })();
  }, [deepLinkOrderId, loading, openOrder]);

  const doUpdateStatus = useCallback(
    async (
      orderId: string,
      status: string,
      extra?: { tracking_number?: string; carrier?: string; tracking_url?: string },
    ) => {
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
        setTrackingUrl("");
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
        setTrackingUrl("");
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
    const urlTrim = trackingUrl.trim();
    if (urlTrim && !/^https?:\/\//i.test(urlTrim)) {
      Alert.alert("Invalid URL", "Tracking URL must start with http:// or https://");
      return;
    }
    doUpdateStatus(orderId, "shipped", {
      tracking_number: trackingNumber.trim() || undefined,
      carrier: carrier.trim() || undefined,
      tracking_url: urlTrim || undefined,
    });
  }, [pendingStatus, trackingNumber, carrier, trackingUrl, doUpdateStatus]);

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
                      {order.customer?.full_name ?? order.customer_name ?? "Customer"}{" "}
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
          subtitle={
            activeOrder?.customer?.full_name ??
            activeOrder?.customer_name ??
            "Order details"
          }
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
                {activeOrder.order_source === "walk_in" && (
                  <View style={twStyle("rounded-full bg-amber-100 px-3 py-1")}>
                    <Text style={twStyle("text-xs font-medium text-amber-900")}>Walk-in</Text>
                  </View>
                )}
              </View>

              {/* Fulfillment: delivery / collection */}
              {(() => {
                const addr = unwrapOne(activeOrder.delivery_address);
                const coll = unwrapOne(activeOrder.collection_location);
                const isDelivery = activeOrder.fulfillment_type === "delivery";
                if (isDelivery && addr) {
                  const lines = formatAddressLines(addr);
                  if (lines.length === 0) return null;
                  return (
                    <View style={twStyle("mb-3 rounded-xl border border-gray-100 bg-white px-4 py-3")}>
                      <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1")}>
                        Delivery address{addr.label ? ` · ${addr.label}` : ""}
                      </Text>
                      {lines.map((line, i) => (
                        <Text key={i} style={twStyle("text-sm text-gray-800")}>
                          {line}
                        </Text>
                      ))}
                    </View>
                  );
                }
                if (!isDelivery && coll && (coll.name || coll.address_line1 || coll.city)) {
                  return (
                    <View style={twStyle("mb-3 rounded-xl border border-gray-100 bg-white px-4 py-3")}>
                      <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1")}>
                        Collection
                      </Text>
                      {coll.name ? (
                        <Text style={twStyle("text-sm font-medium text-gray-900")}>{coll.name}</Text>
                      ) : null}
                      <Text style={twStyle("text-sm text-gray-700")}>
                        {[coll.address_line1, coll.city].filter(Boolean).join(", ")}
                      </Text>
                    </View>
                  );
                }
                return null;
              })()}

              {(activeOrder.estimated_delivery_date || activeOrder.delivery_instructions?.trim()) && (
                <View style={twStyle("mb-3 rounded-xl bg-slate-50 px-4 py-3")}>
                  <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1")}>
                    Delivery notes
                  </Text>
                  {activeOrder.estimated_delivery_date ? (
                    <Text style={twStyle("text-sm text-gray-800")}>
                      Est. delivery: {formatOrderDateLabel(`${activeOrder.estimated_delivery_date}T12:00:00`) ?? activeOrder.estimated_delivery_date}
                    </Text>
                  ) : null}
                  {activeOrder.delivery_instructions?.trim() ? (
                    <Text style={twStyle("mt-1 text-sm text-gray-700")}>{activeOrder.delivery_instructions.trim()}</Text>
                  ) : null}
                </View>
              )}

              {(() => {
                const rows: { label: string; at: string }[] = [];
                const c1 = formatOrderDateLabel(activeOrder.confirmed_at);
                if (c1) rows.push({ label: "Confirmed", at: c1 });
                const c2 = formatOrderDateLabel(activeOrder.shipped_at);
                if (c2) rows.push({ label: "Shipped", at: c2 });
                const c3 = formatOrderDateLabel(activeOrder.delivered_at);
                if (c3) rows.push({ label: "Delivered", at: c3 });
                const c4 = formatOrderDateLabel(activeOrder.cancelled_at);
                if (c4) rows.push({ label: "Cancelled", at: c4 });
                if (rows.length === 0) return null;
                return (
                  <View style={twStyle("mb-3 rounded-xl bg-gray-50 px-4 py-3")}>
                    <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2")}>
                      Timeline
                    </Text>
                    {rows.map((r) => (
                      <View key={r.label} style={twStyle("mb-1 flex-row justify-between gap-2")}>
                        <Text style={twStyle("text-xs font-medium text-gray-600")}>{r.label}</Text>
                        <Text style={twStyle("flex-1 text-right text-xs text-gray-800")}>{r.at}</Text>
                      </View>
                    ))}
                  </View>
                );
              })()}

              {activeOrder.status === "cancelled" && activeOrder.cancellation_reason?.trim() ? (
                <View style={twStyle("mb-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3")}>
                  <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-red-400 mb-1")}>
                    Cancellation reason
                  </Text>
                  <Text style={twStyle("text-sm text-red-900")}>{activeOrder.cancellation_reason.trim()}</Text>
                </View>
              ) : null}

              {/* Customer info */}
              {(activeOrder.customer?.email ||
                activeOrder.customer?.phone ||
                activeOrder.customer?.full_name?.trim() ||
                activeOrder.customer_name?.trim() ||
                activeOrder.customer_phone?.trim()) && (
                <View style={twStyle("mb-3 rounded-xl bg-gray-50 px-4 py-3")}>
                  <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1")}>
                    Customer
                  </Text>
                  {(() => {
                    const nm = (activeOrder.customer?.full_name ?? activeOrder.customer_name ?? "").trim();
                    return nm ? <Text style={twStyle("text-sm font-medium text-gray-900")}>{nm}</Text> : null;
                  })()}
                  {(activeOrder.customer?.phone?.trim() || activeOrder.customer_phone?.trim()) ? (
                    <Text style={twStyle("text-sm text-gray-700")}>
                      {(activeOrder.customer?.phone ?? activeOrder.customer_phone ?? "").trim()}
                    </Text>
                  ) : null}
                  {activeOrder.customer?.email && (
                    <Text style={twStyle("text-sm text-gray-700")}>{activeOrder.customer.email}</Text>
                  )}
                </View>
              )}

              {/* Tracking info */}
              {(activeOrder.tracking_number || activeOrder.tracking_url) && (
                <View style={twStyle("mb-3 rounded-xl bg-blue-50 px-4 py-3")}>
                  <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-blue-400 mb-1")}>
                    Tracking
                  </Text>
                  {activeOrder.carrier && (
                    <Text style={twStyle("text-sm font-medium text-blue-800")}>{activeOrder.carrier}</Text>
                  )}
                  {activeOrder.tracking_number && (
                    <Text style={twStyle("text-sm text-blue-700")}>{activeOrder.tracking_number}</Text>
                  )}
                  {activeOrder.tracking_url ? (
                    <TouchableOpacity
                      onPress={() => void openExternalUrl(activeOrder.tracking_url!)}
                      style={twStyle("mt-2 flex-row items-center self-start rounded-lg bg-blue-600 px-3 py-2")}
                      accessibilityRole="link"
                      accessibilityLabel="Open tracking page"
                    >
                      <Ionicons name="open-outline" size={16} color="#fff" />
                      <Text style={twStyle("ml-2 text-xs font-semibold text-white")} numberOfLines={1}>
                        Open tracking page
                      </Text>
                    </TouchableOpacity>
                  ) : null}
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
              {(() => {
                const cur = String(activeOrder.currency ?? currency).trim() || currency;
                const sub = numOrZero(activeOrder.subtotal);
                const tax = numOrZero(activeOrder.tax_amount);
                const del = numOrZero(activeOrder.delivery_fee);
                const disc = numOrZero(activeOrder.discount_amount);
                const showLines =
                  activeOrder.subtotal != null ||
                  tax > 0 ||
                  del > 0 ||
                  disc > 0;
                if (!showLines) {
                  return (
                    <View style={twStyle("mb-4 flex-row justify-end")}>
                      <Text style={twStyle("text-base font-bold text-gray-900")}>
                        Total {formatCurrency(Number(activeOrder.total_amount), cur)}
                      </Text>
                    </View>
                  );
                }
                const row = (label: string, amount: number, muted?: boolean) => (
                  <View key={label} style={twStyle("mb-1 flex-row justify-between")}>
                    <Text style={twStyle(`text-sm ${muted ? "text-gray-500" : "text-gray-700"}`)}>{label}</Text>
                    <Text style={twStyle(`text-sm font-medium ${muted ? "text-gray-500" : "text-gray-900"}`)}>
                      {formatCurrency(amount, cur)}
                    </Text>
                  </View>
                );
                return (
                  <View style={twStyle("mb-4 rounded-xl bg-gray-50 px-3 py-3")}>
                    {activeOrder.subtotal != null ? row("Subtotal", sub) : null}
                    {tax > 0 ? row("Tax", tax) : null}
                    {del > 0 ? row("Delivery", del) : null}
                    {disc > 0 ? row("Discount", -disc, true) : null}
                    <View style={twStyle("mt-2 flex-row justify-between border-t border-gray-200 pt-2")}>
                      <Text style={twStyle("text-base font-bold text-gray-900")}>Total</Text>
                      <Text style={twStyle("text-base font-bold text-gray-900")}>
                        {formatCurrency(Number(activeOrder.total_amount), cur)}
                      </Text>
                    </View>
                  </View>
                );
              })()}

              {/* Download receipt */}
              <TouchableOpacity
                onPress={async () => {
                  try {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    const res = await api.post<{ url?: string }>(
                      `/api/provider/product-orders/${activeOrder.id}/receipt/signed-url`,
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
                      pushInAppBrowser(router, signedUrl, "Order receipt");
                    } else {
                      if (!cacheDirectory) {
                        Alert.alert(
                          "Download receipt",
                          "File storage is not available on this device.",
                        );
                        return;
                      }
                      const fileUri = `${cacheDirectory}order_${activeOrder.order_number || activeOrder.id}.pdf`;
                      await downloadAsync(signedUrl, fileUri);
                      await RNShare.share({
                        url: fileUri,
                        message: `Order ${activeOrder.order_number}`,
                      });
                    }
                  } catch (e) {
                    Alert.alert(
                      "Download receipt",
                      e instanceof Error ? e.message : "Something went wrong.",
                    );
                  }
                }}
                style={twStyle(
                  "mb-4 flex-row items-center justify-center rounded-xl border border-gray-200 px-4 py-2.5",
                )}
                accessibilityLabel="Download order receipt"
              >
                <Ionicons name="download-outline" size={16} color="#374151" />
                <Text style={twStyle("ml-2 text-sm font-medium text-gray-700")}>
                  Download receipt
                </Text>
              </TouchableOpacity>

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
                      const iconName = STATUS_ACTION_ICON[status] ?? "arrow-forward-circle-outline";
                      const label = `Mark ${status.replace(/_/g, " ")}`;
                      const iconColor = isCancel || isRefund ? "#dc2626" : "#fff";
                      return (
                        <TouchableOpacity
                          key={status}
                          onPress={() => handleStatusTap(activeOrder.id, status)}
                          disabled={patching}
                          style={[
                            twStyle(`rounded-xl px-4 py-2.5 ${bgClass}`),
                            patching ? { opacity: 0.6 } : undefined,
                          ]}
                          accessibilityLabel={label}
                        >
                          <View style={twStyle("flex-row items-center")}>
                            <Ionicons name={iconName} size={18} color={iconColor} />
                            <Text
                              style={twStyle(
                                `ml-2 text-sm font-semibold capitalize ${
                                  isCancel || isRefund ? "text-red-600" : "text-white"
                                }`
                              )}
                            >
                              {label}
                            </Text>
                          </View>
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
              returnKeyType="next"
              style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
              accessibilityLabel="Carrier name"
            />
          </View>
          {/* §Customer-audit 2026-04 (follow-up): let providers paste a
              carrier tracking link so the customer can tap straight through
              from their order detail page. */}
          <View>
            <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Tracking URL (optional)</Text>
            <TextInput
              value={trackingUrl}
              onChangeText={setTrackingUrl}
              placeholder="https://…"
              placeholderTextColor="#9ca3af"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="done"
              style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
              accessibilityLabel="Tracking URL"
            />
            <Text style={twStyle("mt-1 text-xs text-gray-500")}>
              Paste the carrier&apos;s tracking page so customers can tap through from their order.
            </Text>
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
