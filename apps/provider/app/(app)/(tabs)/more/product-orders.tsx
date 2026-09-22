import { useCallback, useState, useEffect, useMemo, useRef } from "react";
import { View, Text, TouchableOpacity, TextInput, ScrollView, RefreshControl, Alert, Platform, Linking } from "react-native";
import { AppKeyboardAvoidingView as KeyboardAvoidingView } from "@/components/AppKeyboardAvoidingView";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { useOrdersReturnsListRefresh } from "@/hooks/useOrdersReturnsListRefresh";
import { api } from "@/lib/api-client";
import { downloadPdf } from "@/lib/pdf-file";
import { shareProviderOrderReceipt } from "@/lib/share-receipt";
import { emitNotificationBadgeRefresh } from "@/lib/notification-badge-events";
import { useResponsive } from "@/hooks/useResponsive";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import { LoadingState } from "@/components/ui/LoadingState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ActionButton } from "@/components/ui/ActionButton";
import { YocoPaymentSheet } from "@/components/YocoPaymentSheet";
import { PayCloudPaymentSheet } from "@/components/payments/PayCloudPaymentSheet";
import { PaycloudCollectSetupAffordance } from "@/components/payments/PaycloudCollectSetupAffordance";
import { usePaycloudCollectAvailability } from "@/hooks/usePaycloudCollectAvailability";
import { formatPaycloudCollectLabel } from "@/lib/paycloud-collect-cta";
import { PaystackTerminalCollectSheet } from "@/components/PaystackTerminalCollectSheet";
import { useFeatureFlag } from "@/providers/ConfigBundleProvider";
import { useProvider } from "@/providers/ProviderContext";
import { formatCurrency } from "@/lib/format";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";
import { twStyle } from "@/lib/twStyle";
import { useTranslation } from "@beautonomi/i18n";
import { DirectionalIcon } from "@/components/ui/DirectionalIcon";

type TranslateFn = (key: string, opts?: Record<string, unknown>) => string;

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

const LINE_FULFILMENT_STATUSES = ["pending", "packed", "shipped", "delivered", "cancelled"] as const;
const LINE_FULFILMENT_RANK: Record<string, number> = {
  pending: 0,
  packed: 1,
  shipped: 2,
  delivered: 3,
  cancelled: -1,
};

function canAdvanceLineFulfilment(from: string, to: string): boolean {
  if (from === to) return true;
  if (from === "cancelled" || from === "delivered") return false;
  if (to === "cancelled") return true;
  return (LINE_FULFILMENT_RANK[to] ?? -2) > (LINE_FULFILMENT_RANK[from] ?? -2);
}

/** Immediate next status plus cancel — keeps Android Alert at 3 buttons. */
function nextLineFulfilmentOptions(from: string): string[] {
  const order = ["pending", "packed", "shipped", "delivered"] as const;
  const idx = order.indexOf(from as (typeof order)[number]);
  const next: string[] = idx >= 0 && idx < order.length - 1 ? [order[idx + 1]] : [];
  if (from !== "cancelled" && from !== "delivered") next.push("cancelled");
  return next.filter(
    (status) =>
      (LINE_FULFILMENT_STATUSES as readonly string[]).includes(status) &&
      canAdvanceLineFulfilment(from, status),
  );
}

interface OrderItem {
  id: string;
  product_name: string;
  quantity: number;
  fulfilment_status?: string | null;
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
  wallet_amount?: number | string | null;
  gift_card_amount?: number | string | null;
  promotion_code?: string | null;
  subtotal?: number | string | null;
  tax_amount?: number | string | null;
  delivery_fee?: number | string | null;
  discount_amount?: number | string | null;
  platform_fee?: number | string | null;
  provider_earnings?: number | string | null;
  currency?: string | null;
  status: string;
  payment_status?: string;
  fulfillment_type?: string;
  order_source?: string | null;
  booking_id?: string | null;
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
  customer?: { id?: string | null; full_name?: string | null; email?: string | null; phone?: string | null; identity_verified?: boolean | null } | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  delivery_address?: OrderAddress | OrderAddress[] | null;
  collection_location?: OrderCollectionLocation | OrderCollectionLocation[] | null;
}

interface OrdersListResponse {
  orders: Order[];
  status_counts?: Record<string, number>;
  pagination: { page: number; limit: number; total: number; totalPages: number; totalAll?: number };
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/** Net amount still due after wallet credit — matches PayCloud amount guards on the server. */
function orderCollectibleAmount(order: Pick<Order, "total_amount" | "wallet_amount">): number {
  return Math.max(0, Number(order.total_amount ?? 0) - Number(order.wallet_amount ?? 0));
}

const STATUS_OPTION_DEFS = [
  { value: "", labelKey: "filterAll" },
  { value: "pending", labelKey: "statusPending" },
  { value: "confirmed", labelKey: "statusConfirmed" },
  { value: "processing", labelKey: "statusProcessing" },
  { value: "ready_for_collection", labelKey: "statusReady" },
  { value: "shipped", labelKey: "statusShipped" },
  { value: "delivered", labelKey: "statusDelivered" },
  { value: "cancelled", labelKey: "statusCancelled" },
  { value: "refunded", labelKey: "statusRefunded" },
] as const;

const ORDER_STATUS_KEYS: Record<string, string> = {
  pending: "statusPending",
  confirmed: "statusConfirmed",
  processing: "statusProcessing",
  ready_for_collection: "statusReady",
  shipped: "statusShipped",
  delivered: "statusDelivered",
  cancelled: "statusCancelled",
  refunded: "statusRefunded",
  packed: "statusPacked",
};

const PAYMENT_STATUS_KEYS: Record<string, string> = {
  pending: "paymentPending",
  paid: "paymentPaid",
  unpaid: "paymentUnpaid",
  failed: "paymentFailed",
  requires_payment: "paymentRequiresPayment",
  refunded: "paymentRefunded",
  processing: "paymentProcessing",
};

const FULFILLMENT_TYPE_KEYS: Record<string, string> = {
  delivery: "fulfillmentDelivery",
  collection: "fulfillmentCollection",
  pickup: "fulfillmentPickup",
};

function fallbackStatusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

const ACTION_REQUIRED_STATUSES = new Set(["pending", "confirmed", "processing", "ready_for_collection", "shipped"]);

const PRODUCT_ORDERS_REALTIME_TABLES = ["product_orders"] as const;

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

/** Single recommended next step in the fulfillment pipeline */
function getWorkflowPrimaryNext(
  current: string,
  fulfillmentType?: string | null,
  paymentStatus?: string | null,
  orderSource?: string | null,
): string | null {
  const ps = (paymentStatus ?? "").toLowerCase();
  const isAppointmentOrder = (orderSource ?? "").toLowerCase() === "appointment";
  if (
    !isAppointmentOrder &&
    (ps === "pending" || ps === "unpaid" || ps === "failed" || ps === "requires_payment")
  ) {
    return null;
  }
  const ft = (fulfillmentType ?? "").toLowerCase();
  const isCollection = ft === "collection" || ft === "pickup";
  switch (current) {
    case "pending":
      return "confirmed";
    case "confirmed":
      return "processing";
    case "processing":
      return isCollection ? "ready_for_collection" : "shipped";
    case "ready_for_collection":
      return "delivered";
    case "shipped":
      return "delivered";
    default:
      return null;
  }
}

function getDestructiveNextStatuses(current: string, orderSource?: string | null): string[] {
  if (current === "cancelled" || current === "refunded") return [];
  // Walk-in orders start as "delivered" (already fulfilled in-store) but still need a refund path.
  if (current === "delivered") {
    return orderSource === "walk_in" ? ["refunded"] : [];
  }
  return ["cancelled", "refunded"];
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

function formatAddressLines(addr: OrderAddress | null, po: TranslateFn): string[] {
  if (!addr) return [];
  const lines: string[] = [];
  const line1 = [addr.apartment_unit, addr.building_name, addr.address_line1].filter(Boolean).join(", ").trim();
  if (line1) lines.push(line1);
  if (addr.address_line2?.trim()) lines.push(addr.address_line2.trim());
  const cityLine = [addr.city, addr.state, addr.postal_code].filter(Boolean).join(", ").trim();
  if (cityLine) lines.push(cityLine);
  if (addr.country?.trim()) lines.push(addr.country.trim());
  if (addr.parking_instructions?.trim()) lines.push(po("parkingLine", { text: addr.parking_instructions.trim() }));
  if (addr.location_landmarks?.trim()) lines.push(po("landmarksLine", { text: addr.location_landmarks.trim() }));
  return lines;
}

async function openExternalUrl(url: string, po: TranslateFn) {
  const trimmed = url.trim();
  if (!trimmed) return;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const ok = await Linking.canOpenURL(withScheme);
    if (ok) await Linking.openURL(withScheme);
    else Alert.alert(po("openLinkTitle"), po("openLinkUnsupported"));
  } catch {
    Alert.alert(po("openLinkTitle"), po("openLinkFailed"));
  }
}

/* ------------------------------------------------------------------ */
/*  Component (exported for embedding in hub tabs)                     */
/* ------------------------------------------------------------------ */

export function ProductOrdersContent({ deepLinkOrderId }: { deepLinkOrderId?: string }) {
  const { t } = useTranslation();
  const po = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(`provider.mobile.screens.productOrders.${key}`, opts) as string,
    [t],
  );
  const statusLabel = useCallback(
    (status: string) => {
      const key = ORDER_STATUS_KEYS[status];
      return key ? po(key) : fallbackStatusLabel(status);
    },
    [po],
  );
  const paymentStatusLabel = useCallback(
    (status: string) => {
      const key = PAYMENT_STATUS_KEYS[status.toLowerCase()];
      return key ? po(key) : fallbackStatusLabel(status);
    },
    [po],
  );
  const fulfillmentLabel = useCallback(
    (type: string) => {
      const key = FULFILLMENT_TYPE_KEYS[type.toLowerCase()];
      return key ? po(key) : fallbackStatusLabel(type);
    },
    [po],
  );
  const router = useRouter();
  const { screenPadding } = useResponsive();
  const currency = getTenantDefaultCurrency();

  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
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
  const [estimatedDeliveryDate, setEstimatedDeliveryDate] = useState("");
  const [cancelReasonSheetOpen, setCancelReasonSheetOpen] = useState(false);
  const [cancelReasonOrderId, setCancelReasonOrderId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [recordPaymentSheetOpen, setRecordPaymentSheetOpen] = useState(false);
  const [recordPaymentMethod, setRecordPaymentMethod] = useState<"cash" | "card_on_delivery" | "yoco" | "paycloud">("cash");
  const [recordPaymentReference, setRecordPaymentReference] = useState("");
  const [showYocoPaymentSheet, setShowYocoPaymentSheet] = useState(false);
  const [showPaycloudPaymentSheet, setShowPaycloudPaymentSheet] = useState(false);
  const [terminalSheetOpen, setTerminalSheetOpen] = useState(false);
  const paystackTerminalEnabled = useFeatureFlag("payment_paystack_virtual_terminal");
  const {
    paycloudEnabled,
    collectEnabled: paycloudCollectEnabled,
    inFlight: paycloudInFlight,
    primaryBlocker: paycloudPrimaryBlocker,
    loading: paycloudLoading,
  } = usePaycloudCollectAvailability();
  const { selectedLocationId } = useProvider();
  const { data: permissionData } = useApi<{
    isOwner?: boolean;
    permissions?: Record<string, boolean>;
  }>("/api/provider/permissions", { staleTimeMs: 60_000 });
  const canProcessPayments =
    permissionData?.isOwner === true ||
    permissionData?.permissions?.process_payments === true;

  const pageSize = 50;
  const url = `/api/provider/product-orders?limit=${pageSize}&page=${page}${statusFilter ? `&status=${statusFilter}` : ""}`;
  const { data, loading, error, refresh, silentRefresh } = useApi<OrdersListResponse>(url, {
    revalidateOnFocus: true,
  });
  useOrdersReturnsListRefresh(silentRefresh, PRODUCT_ORDERS_REALTIME_TABLES);
  const { execute: patchOrder, loading: patching } = useApiMutation<{ order: Order }>("patch");
  const { execute: patchLine, loading: patchingLine } = useApiMutation<{ item: { id: string; fulfilment_status: string } }>("patch");
  const { execute: postOrderMutation, loading: postingOrderMutation } = useApiMutation<{ order: Order }>("post");

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  const allOrders = useMemo(() => data?.orders ?? [], [data?.orders]);
  const pagination = data?.pagination;
  const totalPages = Math.max(1, Number(pagination?.totalPages ?? 1));
  const statusCounts = data?.status_counts ?? {};
  const totalOrderCount = Number(data?.pagination?.totalAll ?? data?.pagination?.total ?? allOrders.length);
  const actionRequiredCount = Array.from(ACTION_REQUIRED_STATUSES).reduce(
    (sum, status) => sum + Number(statusCounts[status] ?? 0),
    0,
  );
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
  const activeOrder = orderDetail ?? viewOrder;

  const openOrder = useCallback(async (order: Order) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setViewOrder(order);
    setOrderDetail(null);
    setLoadingDetail(true);
    try {
      const res = await api.get<{ order: Order }>(`/api/provider/product-orders/${order.id}`);
      setOrderDetail(res.data?.order ?? order);
      void api
        .post("/api/provider/notifications/mark-related-read", { order_id: order.id })
        .then(() => emitNotificationBadgeRefresh())
        .catch(() => {});
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
      extra?: {
        tracking_number?: string;
        carrier?: string;
        tracking_url?: string;
        estimated_delivery_date?: string;
        cancellation_reason?: string;
        refund_method?: "cash" | "store_credit";
      },
    ) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const { error: err } = await patchOrder(`/api/provider/product-orders/${orderId}`, {
        status,
        ...extra,
      });
      if (err) {
        Alert.alert(po("errorTitle"), err);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setViewOrder(null);
        setOrderDetail(null);
        setTrackingSheetOpen(false);
        setPendingStatus(null);
        setTrackingNumber("");
        setCarrier("");
        setTrackingUrl("");
        setEstimatedDeliveryDate("");
        setCancelReasonSheetOpen(false);
        setCancelReasonOrderId(null);
        setCancelReason("");
        refresh();
      }
    },
    [patchOrder, refresh, po]
  );

  const handleStatusTap = useCallback(
    (orderId: string, status: string) => {
      if (status === "shipped") {
        setPendingStatus(orderId + "|" + status);
        setTrackingNumber("");
        setCarrier("");
        setTrackingUrl("");
        setEstimatedDeliveryDate("");
        setTrackingSheetOpen(true);
      } else if (status === "cancelled") {
        const order = (orderDetail?.id === orderId ? orderDetail : viewOrder?.id === orderId ? viewOrder : allOrders.find((o) => o.id === orderId)) ?? null;
        if ((order?.payment_status ?? "").toLowerCase() === "paid") {
          setCancelReasonOrderId(orderId);
          setCancelReason("");
          setCancelReasonSheetOpen(true);
          return;
        }
        Alert.alert(
          po("cancelOrderTitle"),
          po("cancelOrderBody"),
          [
            { text: po("no"), style: "cancel" },
            { text: po("cancelOrderCta"), style: "destructive", onPress: () => doUpdateStatus(orderId, status) },
          ]
        );
      } else if (status === "refunded") {
        const order = (orderDetail?.id === orderId ? orderDetail : viewOrder?.id === orderId ? viewOrder : allOrders.find((o) => o.id === orderId)) ?? null;
        // Wallet credit needs a platform customer; walk-in sales have none, so
        // those (and any order without a linked customer) are refunded in person.
        const canWallet = order?.order_source !== "walk_in" && !!order?.customer?.id;
        const buttons: Parameters<typeof Alert.alert>[2] = [
          { text: po("cancel"), style: "cancel" },
          {
            text: po("refundInPerson"),
            onPress: () => doUpdateStatus(orderId, status, { refund_method: "cash" }),
          },
        ];
        if (canWallet) {
          buttons.push({
            text: po("refundWallet"),
            onPress: () => doUpdateStatus(orderId, status, { refund_method: "store_credit" }),
          });
        }
        Alert.alert(
          po("refundOrderTitle"),
          canWallet
            ? po("refundOrderBodyWallet")
            : po("refundOrderBodyCash"),
          buttons,
        );
      } else {
        doUpdateStatus(orderId, status);
      }
    },
    [allOrders, doUpdateStatus, orderDetail, viewOrder, po]
  );

  const handleConfirmCancelWithReason = useCallback(() => {
    if (!cancelReasonOrderId) return;
    const reason = cancelReason.trim();
    if (reason.length < 3) {
      Alert.alert(po("reasonRequiredTitle"), po("reasonRequiredBody"));
      return;
    }
    doUpdateStatus(cancelReasonOrderId, "cancelled", { cancellation_reason: reason });
  }, [cancelReason, cancelReasonOrderId, doUpdateStatus, po]);

  const recordCollectionPayment = useCallback(async (referenceOverride?: string) => {
    if (!activeOrder) return;
    const reference = (referenceOverride ?? recordPaymentReference).trim();
    if (recordPaymentMethod === "yoco" && !reference) {
      Alert.alert(po("referenceRequiredTitle"), po("referenceRequiredBody"));
      return;
    }
    const { error: err } = await postOrderMutation(
      `/api/provider/product-orders/${activeOrder.id}/mark-collected`,
      {
        payment_method: recordPaymentMethod,
        reference: reference || undefined,
        idempotency_key: `provider-app-${activeOrder.id}-${Date.now()}`,
      },
    );
    if (err) {
      Alert.alert(po("recordPaymentTitle"), err);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setRecordPaymentSheetOpen(false);
    setRecordPaymentReference("");
    setRecordPaymentMethod("cash");
    setShowYocoPaymentSheet(false);
    setShowPaycloudPaymentSheet(false);
    setViewOrder(null);
    setOrderDetail(null);
    refresh();
  }, [activeOrder, postOrderMutation, recordPaymentMethod, recordPaymentReference, refresh, po]);

  const handleRecordCollectionPayment = useCallback(async () => {
    await recordCollectionPayment();
  }, [recordCollectionPayment]);

  const handleYocoCollectionSuccess = useCallback(
    async (result: { reference: string }) => {
      setRecordPaymentMethod("yoco");
      setRecordPaymentReference(result.reference);
      await recordCollectionPayment(result.reference);
    },
    [recordCollectionPayment],
  );

  const handlePaycloudCollectionSuccess = useCallback(async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowPaycloudPaymentSheet(false);
    setRecordPaymentSheetOpen(false);
    setRecordPaymentReference("");
    setRecordPaymentMethod("cash");
    setViewOrder(null);
    setOrderDetail(null);
    refresh();
  }, [refresh]);

  const handleConfirmShipped = useCallback(() => {
    if (!pendingStatus) return;
    const [orderId] = pendingStatus.split("|");
    const urlTrim = trackingUrl.trim();
    if (urlTrim && !/^https?:\/\//i.test(urlTrim)) {
      Alert.alert(po("invalidUrlTitle"), po("invalidUrlBody"));
      return;
    }
    doUpdateStatus(orderId, "shipped", {
      tracking_number: trackingNumber.trim() || undefined,
      carrier: carrier.trim() || undefined,
      tracking_url: urlTrim || undefined,
      estimated_delivery_date: estimatedDeliveryDate.trim() || undefined,
    });
  }, [pendingStatus, trackingNumber, carrier, trackingUrl, estimatedDeliveryDate, doUpdateStatus, po]);

  if (loading && !data) {
    return (
      <View style={twStyle("flex-1 py-12 px-4")}>
        <SkeletonList rows={6} />
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

  return (
    <>
      {actionRequiredCount > 0 && (
        <View style={twStyle("mx-4 mb-2 rounded-2xl border border-pink-100 bg-pink-50 px-4 py-3")}>
          <Text style={twStyle("text-sm font-semibold text-pink-800")}>
            {po("actionRequired", { count: actionRequiredCount })}
          </Text>
          <Text style={twStyle("mt-0.5 text-xs text-pink-700")}>
            {po("actionRequiredHint")}
          </Text>
        </View>
      )}

      {/* ── Search ── */}
      <View style={[twStyle("mx-4 mb-2 flex-row items-center rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2.5")]}>
        <Ionicons name="search-outline" size={15} color="#9ca3af" />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={po("searchPlaceholder")}
          placeholderTextColor="#9ca3af"
          style={twStyle("ms-2 flex-1 text-sm text-gray-900")}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          accessibilityLabel={po("searchA11y")}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch("")} accessibilityLabel={po("clearSearchA11y")}>
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
          {STATUS_OPTION_DEFS.map((opt) => {
            const filterLabel = po(opt.labelKey);
            const active = statusFilter === opt.value;
            const count = opt.value ? Number(statusCounts[opt.value] ?? 0) : totalOrderCount;
            const needsAction = Boolean(opt.value && ACTION_REQUIRED_STATUSES.has(opt.value) && count > 0);
            return (
              <TouchableOpacity
                key={opt.value || "all"}
                onPress={() => setStatusFilter(opt.value)}
                style={[
                  twStyle("flex-row items-center rounded-full px-3.5 py-1.5"),
                  active
                    ? { backgroundColor: "#db2777" }
                    : {
                        backgroundColor: needsAction ? "#fdf2f8" : "#fff",
                        borderWidth: 1,
                        borderColor: needsAction ? "#fbcfe8" : "#e5e7eb",
                      },
                ]}
                accessibilityLabel={po("filterByA11y", { label: filterLabel })}
              >
                <Text style={twStyle(`text-xs font-semibold ${active ? "text-white" : "text-gray-600"}`)}>
                  {filterLabel}
                </Text>
                <View
                  style={{
                    marginStart: 6,
                    minWidth: 20,
                    alignItems: "center",
                    borderRadius: 999,
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    backgroundColor: active ? "rgba(255,255,255,0.2)" : needsAction ? "#db2777" : "#f3f4f6",
                  }}
                >
                  <Text
                    style={{
                      color: active || needsAction ? "#fff" : "#4b5563",
                      fontSize: 10,
                      fontWeight: "800",
                    }}
                  >
                    {count > 99 ? po("countCapped") : count}
                  </Text>
                </View>
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
            <Text style={twStyle("text-center font-semibold text-gray-900")}>{po("emptyTitle")}</Text>
            <Text style={twStyle("mt-1 text-center text-sm text-gray-500")}>
              {search || statusFilter
                ? po("emptyFiltered")
                : po("emptyDefault")}
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
                accessibilityLabel={po("orderA11y", { number: order.order_number })}
                accessibilityRole="button"
              >
                <View style={twStyle("flex-row items-center")}>
                  <View style={twStyle("h-10 w-10 items-center justify-center rounded-xl bg-pink-100")}>
                    <Ionicons name="receipt-outline" size={20} color="#ec4899" />
                  </View>
                  <View style={twStyle("ms-3 flex-1 min-w-0")}>
                    <View style={twStyle("flex-row items-center justify-between")}>
                      <Text style={twStyle("font-semibold text-gray-900")} numberOfLines={1}>
                        {order.order_number}
                      </Text>
                      <View style={[twStyle("rounded-full px-2.5 py-0.5"), { backgroundColor: st.bg }]}>
                        <Text style={[twStyle("text-xs font-medium capitalize"), { color: st.text }]}>
                          {statusLabel(order.status)}
                        </Text>
                      </View>
                    </View>
                    <Text style={twStyle("mt-0.5 text-sm text-gray-600")} numberOfLines={1}>
                      {order.customer?.full_name ?? order.customer_name ?? (order.order_source === "walk_in" ? po("walkIn") : po("customerFallback"))}{" "}
                      · {formatCurrency(Number(order.total_amount), currency)}
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2, flexWrap: "wrap" }}>
                      {order.customer?.identity_verified && (
                        <VerifiedBadge verified size="xs" />
                      )}
                      {order.order_source === "walk_in" && (
                        <View style={twStyle("rounded-full bg-amber-100 px-2 py-0.5")}>
                          <Text style={twStyle("text-xs font-medium text-amber-800")}>{po("walkIn")}</Text>
                        </View>
                      )}
                      {order.tracking_number ? (
                        <Text style={twStyle("text-xs text-gray-400")}>
                          {po("trackingWithNumber", { number: order.tracking_number })}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  <DirectionalIcon name="chevron-forward" size={16} color="#d1d5db" style={{ marginStart: 8 }} />
                </View>
              </TouchableOpacity>
            );
          })
        )}
        {allOrders.length > 0 && totalPages > 1 ? (
          <View style={twStyle("mt-2 flex-row items-center justify-between rounded-2xl border border-gray-100 bg-white px-3 py-3")}>
            <TouchableOpacity
              onPress={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              style={[
                twStyle("flex-row items-center rounded-xl border border-gray-200 px-3 py-2"),
                page <= 1 || loading ? { opacity: 0.45 } : undefined,
              ]}
              accessibilityLabel={po("prevPageA11y")}
            >
              <DirectionalIcon name="chevron-back" size={16} color="#374151" />
              <Text style={twStyle("ms-1 text-xs font-semibold text-gray-700")}>{po("prev")}</Text>
            </TouchableOpacity>
            <Text style={twStyle("text-xs font-semibold text-gray-600")}>
              {po("pageOf", { page, total: totalPages })}
            </Text>
            <TouchableOpacity
              onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              style={[
                twStyle("flex-row items-center rounded-xl border border-gray-200 px-3 py-2"),
                page >= totalPages || loading ? { opacity: 0.45 } : undefined,
              ]}
              accessibilityLabel={po("nextPageA11y")}
            >
              <Text style={twStyle("me-1 text-xs font-semibold text-gray-700")}>{po("next")}</Text>
              <DirectionalIcon name="chevron-forward" size={16} color="#374151" />
            </TouchableOpacity>
          </View>
        ) : null}
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
            po("orderDetails")
          }
          snapHeight="full"
        >
          {loadingDetail ? (
            <View style={twStyle("items-center py-6")}>
              <LoadingState />
            </View>
          ) : activeOrder ? (
            <KeyboardAvoidingView behavior="padding">
              {/* Status + payment status badges */}
              <View style={twStyle("mb-3 flex-row flex-wrap gap-2")}>
                {(() => {
                  const st = STATUS_STYLE[activeOrder.status] ?? { bg: "#f3f4f6", text: "#374151" };
                  return (
                    <View style={[twStyle("rounded-full px-3 py-1"), { backgroundColor: st.bg }]}>
                      <Text style={[twStyle("text-sm font-semibold capitalize"), { color: st.text }]}>
                        {statusLabel(activeOrder.status)}
                      </Text>
                    </View>
                  );
                })()}
                {activeOrder.payment_status && (
                  <View style={twStyle("rounded-full bg-emerald-100 px-3 py-1")}>
                    <Text style={twStyle("text-sm font-semibold capitalize text-emerald-800")}>
                      {paymentStatusLabel(activeOrder.payment_status)}
                    </Text>
                  </View>
                )}
                {activeOrder.fulfillment_type && (
                  <View style={twStyle("rounded-full bg-gray-100 px-3 py-1")}>
                    <Text style={twStyle("text-xs font-medium text-gray-600 capitalize")}>
                      {fulfillmentLabel(activeOrder.fulfillment_type)}
                    </Text>
                  </View>
                )}
                {activeOrder.order_source === "walk_in" && (
                  <View style={twStyle("rounded-full bg-amber-100 px-3 py-1")}>
                    <Text style={twStyle("text-xs font-medium text-amber-900")}>{po("walkIn")}</Text>
                  </View>
                )}
              </View>

              {/* Fulfillment: delivery / collection */}
              {(() => {
                const addr = unwrapOne(activeOrder.delivery_address);
                const coll = unwrapOne(activeOrder.collection_location);
                const isDelivery = activeOrder.fulfillment_type === "delivery";
                if (isDelivery && addr) {
                  const lines = formatAddressLines(addr, po);
                  if (lines.length === 0) return null;
                  return (
                    <View style={twStyle("mb-3 rounded-xl border border-gray-100 bg-white px-4 py-3")}>
                      <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1")}>
                        {addr.label ? po("deliveryAddressWithLabel", { label: addr.label }) : po("deliveryAddress")}
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
                        {po("collection")}
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
                    {po("deliveryNotes")}
                  </Text>
                  {activeOrder.estimated_delivery_date ? (
                    <Text style={twStyle("text-sm text-gray-800")}>
                      {po("estDelivery", { date: formatOrderDateLabel(`${activeOrder.estimated_delivery_date}T12:00:00`) ?? activeOrder.estimated_delivery_date })}
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
                if (c1) rows.push({ label: po("statusConfirmed"), at: c1 });
                const c2 = formatOrderDateLabel(activeOrder.shipped_at);
                if (c2) rows.push({ label: po("statusShipped"), at: c2 });
                const c3 = formatOrderDateLabel(activeOrder.delivered_at);
                if (c3) rows.push({ label: po("statusDelivered"), at: c3 });
                const c4 = formatOrderDateLabel(activeOrder.cancelled_at);
                if (c4) rows.push({ label: po("statusCancelled"), at: c4 });
                if (rows.length === 0) return null;
                return (
                  <View style={twStyle("mb-3 rounded-xl bg-gray-50 px-4 py-3")}>
                    <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2")}>
                      {po("timeline")}
                    </Text>
                    {rows.map((r) => (
                      <View key={r.label} style={twStyle("mb-1 flex-row justify-between gap-2")}>
                        <Text style={twStyle("text-xs font-medium text-gray-600")}>{r.label}</Text>
                        <Text style={twStyle("flex-1 text-end text-xs text-gray-800")}>{r.at}</Text>
                      </View>
                    ))}
                  </View>
                );
              })()}

              {activeOrder.status === "cancelled" && activeOrder.cancellation_reason?.trim() ? (
                <View style={twStyle("mb-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3")}>
                  <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-red-400 mb-1")}>
                    {po("cancellationReason")}
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
                    {po("customer")}
                  </Text>
                  {(() => {
                    const nm = (activeOrder.customer?.full_name ?? activeOrder.customer_name ?? "").trim();
                    return nm ? (
                      <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap" }}>
                        <Text style={twStyle("text-sm font-medium text-gray-900")}>{nm}</Text>
                        {activeOrder.customer?.identity_verified ? (
                          <VerifiedBadge verified style={{ marginStart: 8 }} />
                        ) : null}
                      </View>
                    ) : null;
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
                    {po("tracking")}
                  </Text>
                  {activeOrder.carrier && (
                    <Text style={twStyle("text-sm font-medium text-blue-800")}>{activeOrder.carrier}</Text>
                  )}
                  {activeOrder.tracking_number && (
                    <Text style={twStyle("text-sm text-blue-700")}>{activeOrder.tracking_number}</Text>
                  )}
                  {activeOrder.tracking_url ? (
                    <TouchableOpacity
                      onPress={() => void openExternalUrl(activeOrder.tracking_url!, po)}
                      style={twStyle("mt-2 flex-row items-center self-start rounded-lg bg-blue-600 px-3 py-2")}
                      accessibilityRole="link"
                      accessibilityLabel={po("openTrackingPageA11y")}
                    >
                      <Ionicons name="open-outline" size={16} color="#fff" />
                      <Text style={twStyle("ms-2 text-xs font-semibold text-white")} numberOfLines={1}>
                        {po("openTrackingPage")}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              )}

              {/* Line items */}
              <Text style={twStyle("mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400")}>
                {po("items")}
              </Text>
              {(activeOrder.items ?? []).map((item) => {
                const variantLabel =
                  item.product_variant?.option_values &&
                  Object.keys(item.product_variant.option_values).length > 0
                    ? " · " + Object.values(item.product_variant.option_values).join(", ")
                    : "";
                const currentFulfilment = item.fulfilment_status ?? "pending";
                const lineLocked =
                  patchingLine ||
                  activeOrder.status === "cancelled" ||
                  activeOrder.status === "refunded" ||
                  currentFulfilment === "delivered" ||
                  currentFulfilment === "cancelled";
                return (
                  <View
                    key={item.id}
                    style={twStyle("mb-2 rounded-xl bg-gray-50 px-3 py-2.5")}
                  >
                    <View style={twStyle("flex-row items-center justify-between")}>
                      <Text style={twStyle("flex-1 text-sm text-gray-900")} numberOfLines={2}>
                        {item.product_name}
                        {variantLabel}
                        {" × "}
                        {item.quantity}
                      </Text>
                      <Text style={twStyle("ms-3 text-sm font-semibold text-gray-800")}>
                        {formatCurrency(Number(item.total_price), currency)}
                      </Text>
                    </View>
                    <TouchableOpacity
                      disabled={lineLocked}
                      onPress={() => {
                        const nextStatuses = nextLineFulfilmentOptions(currentFulfilment);
                        if (nextStatuses.length === 0) return;
                        Alert.alert(
                          po("lineFulfilmentTitle"),
                          po("lineFulfilmentBody", { name: item.product_name, status: statusLabel(currentFulfilment) }),
                          [
                            { text: po("cancel"), style: "cancel" },
                            ...nextStatuses.map((status) => ({
                              text: statusLabel(status),
                              onPress: async () => {
                                const { error } = await patchLine(
                                  `/api/provider/product-orders/${activeOrder.id}/items/${item.id}`,
                                  { fulfilment_status: status },
                                );
                                if (error) {
                                  Alert.alert(po("errorTitle"), error);
                                  return;
                                }
                                const apply = (prev: Order | null) =>
                                  prev
                                    ? {
                                        ...prev,
                                        items: (prev.items ?? []).map((row) =>
                                          row.id === item.id ? { ...row, fulfilment_status: status } : row,
                                        ),
                                      }
                                    : prev;
                                setOrderDetail((prev) => apply(prev));
                                setViewOrder((prev) => apply(prev));
                              },
                            })),
                          ],
                        );
                      }}
                      style={{ marginTop: 6, alignSelf: "flex-start", opacity: lineLocked ? 0.5 : 1 }}
                    >
                      <Text style={twStyle("text-xs font-semibold text-violet-700")}>
                        {statusLabel(currentFulfilment)}
                        {lineLocked ? "" : po("tapToUpdate")}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
              {(() => {
                const cur = String(activeOrder.currency ?? currency).trim() || currency;
                const sub = numOrZero(activeOrder.subtotal);
                const tax = numOrZero(activeOrder.tax_amount);
                const del = numOrZero(activeOrder.delivery_fee);
                const disc = numOrZero(activeOrder.discount_amount);
                const platformFee = numOrZero(activeOrder.platform_fee);
                const providerEarnings = activeOrder.provider_earnings != null
                  ? numOrZero(activeOrder.provider_earnings)
                  : Math.max(0, Number(activeOrder.total_amount) - platformFee);
                const showLines =
                  activeOrder.subtotal != null ||
                  tax > 0 ||
                  del > 0 ||
                  disc > 0 ||
                  platformFee > 0;
                if (!showLines) {
                  return (
                    <View style={twStyle("mb-4 flex-row justify-end")}>
                      <Text style={twStyle("text-base font-bold text-gray-900")}>
                        {po("totalWithAmount", { amount: formatCurrency(Number(activeOrder.total_amount), cur) })}
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
                    {activeOrder.subtotal != null ? row(po("subtotal"), sub) : null}
                    {tax > 0 ? row(po("tax"), tax) : null}
                    {del > 0 ? row(po("delivery"), del) : null}
                    {disc > 0 ? row(po("discount"), -disc, true) : null}
                    {numOrZero(activeOrder.gift_card_amount) > 0
                      ? row(po("giftCard"), -numOrZero(activeOrder.gift_card_amount), true)
                      : null}
                    {activeOrder.promotion_code ? (
                      <View style={twStyle("mb-1 flex-row justify-between")}>
                        <Text style={twStyle("text-sm text-gray-500")}>{po("promotion")}</Text>
                        <Text style={twStyle("text-sm font-medium text-gray-500")}>
                          {activeOrder.promotion_code}
                        </Text>
                      </View>
                    ) : null}
                    {platformFee > 0 ? row(po("platformFee"), -platformFee, true) : null}
                    {platformFee > 0 ? row(po("providerEarnings"), providerEarnings) : null}
                    <View style={twStyle("mt-2 flex-row justify-between border-t border-gray-200 pt-2")}>
                      <Text style={twStyle("text-base font-bold text-gray-900")}>{po("total")}</Text>
                      <Text style={twStyle("text-base font-bold text-gray-900")}>
                        {formatCurrency(Number(activeOrder.total_amount), cur)}
                      </Text>
                    </View>
                  </View>
                );
              })()}

              {activeOrder.order_source === "appointment" ? (
                <View style={twStyle("mb-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2")}>
                  <Text style={twStyle("text-xs text-blue-900")}>
                    {po("appointmentPaymentNote")}
                  </Text>
                  {activeOrder.booking_id ? (
                    <TouchableOpacity
                      onPress={() => {
                        setViewOrder(null);
                        setOrderDetail(null);
                        router.push(`/(app)/(tabs)/more/bookings/${activeOrder.booking_id}` as never);
                      }}
                      style={twStyle("mt-2 flex-row items-center")}
                      accessibilityRole="button"
                      accessibilityLabel={po("goToBookingA11y")}
                    >
                      <Ionicons name="calendar-outline" size={14} color="#1d4ed8" />
                      <Text style={twStyle("ms-1 text-xs font-semibold text-blue-800")}>{po("goToBooking")}</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : (activeOrder.payment_status ?? "").toLowerCase() === "pending" &&
                activeOrder.status !== "cancelled" &&
                activeOrder.status !== "refunded" &&
                canProcessPayments ? (
                <TouchableOpacity
                  onPress={() => {
                    setRecordPaymentMethod("cash");
                    setRecordPaymentReference("");
                    setRecordPaymentSheetOpen(true);
                  }}
                  style={twStyle("mb-3 flex-row items-center justify-center rounded-xl bg-emerald-600 px-4 py-2.5")}
                  accessibilityRole="button"
                  accessibilityLabel={po("recordPaymentCollectionA11y")}
                >
                  <Ionicons name="cash-outline" size={16} color="#fff" />
                  <Text style={twStyle("ms-2 text-sm font-semibold text-white")}>{po("recordPaymentCollection")}</Text>
                </TouchableOpacity>
              ) : null}

              {/* Share + download receipt */}
              <View style={twStyle("mb-4 flex-row gap-2")}>
                <TouchableOpacity
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    void shareProviderOrderReceipt(
                      activeOrder.id,
                      activeOrder.order_number,
                    ).catch((e) =>
                      Alert.alert(
                        po("shareReceiptTitle"),
                        e instanceof Error ? e.message : po("somethingWentWrong"),
                      ),
                    );
                  }}
                  style={twStyle(
                    "flex-1 flex-row items-center justify-center rounded-xl border border-gray-200 px-4 py-2.5",
                  )}
                  accessibilityLabel={po("shareReceiptA11y")}
                >
                  <Ionicons name="share-outline" size={16} color="#374151" />
                  <Text style={twStyle("ms-2 text-sm font-medium text-gray-700")}>
                    {po("shareReceipt")}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={async () => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    try {
                      await downloadPdf({
                        router,
                        pdfPath: `/api/provider/product-orders/${encodeURIComponent(activeOrder.id)}/receipt/pdf`,
                        signedUrlPath: `/api/provider/product-orders/${encodeURIComponent(activeOrder.id)}/receipt/signed-url`,
                        filename: `order_${activeOrder.order_number || activeOrder.id}.pdf`,
                        title: po("orderPdfTitle", { number: activeOrder.order_number }),
                        label: po("receiptLabel"),
                      });
                    } catch (e) {
                      Alert.alert(
                        po("downloadReceiptTitle"),
                        e instanceof Error ? e.message : po("somethingWentWrong"),
                      );
                    }
                  }}
                  style={twStyle(
                    "flex-1 flex-row items-center justify-center rounded-xl border border-gray-200 px-4 py-2.5",
                  )}
                  accessibilityLabel={po("downloadReceiptA11y")}
                >
                  <Ionicons name="download-outline" size={16} color="#374151" />
                  <Text style={twStyle("ms-2 text-sm font-medium text-gray-700")}>
                    {po("downloadPdf")}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Primary next step + destructive actions behind “More” */}
              {(() => {
                const primary = getWorkflowPrimaryNext(
                  activeOrder.status,
                  activeOrder.fulfillment_type,
                  activeOrder.payment_status,
                  activeOrder.order_source,
                );
                const destructive = getDestructiveNextStatuses(activeOrder.status, activeOrder.order_source);
                if (!primary && destructive.length === 0) return null;
                const primaryLabel =
                  primary === "confirmed"
                    ? po("confirmOrder")
                    : primary === "processing"
                      ? po("startProcessing")
                      : primary === "ready_for_collection"
                        ? po("markReady")
                        : primary === "shipped"
                          ? po("markShipped")
                          : primary === "delivered"
                            ? po("markDelivered")
                            : primary
                              ? po("markStatus", { status: statusLabel(primary) })
                              : "";
                const iconName = primary ? STATUS_ACTION_ICON[primary] ?? "arrow-forward-circle-outline" : "arrow-forward-circle-outline";
                return (
                  <View style={twStyle("mb-2")}>
                    <Text style={twStyle("mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400")}>
                      {po("nextStep")}
                    </Text>
                    {primary ? (
                      <>
                        <TouchableOpacity
                          onPress={() => handleStatusTap(activeOrder.id, primary)}
                          disabled={patching}
                          style={[
                            twStyle("flex-row items-center justify-center rounded-xl bg-pink-600 px-4 py-3.5"),
                            patching ? { opacity: 0.6 } : undefined,
                          ]}
                          accessibilityLabel={primaryLabel}
                          accessibilityRole="button"
                        >
                          <Ionicons name={iconName} size={20} color="#fff" />
                          <Text style={twStyle("ms-2 text-base font-bold text-white")}>{primaryLabel}</Text>
                        </TouchableOpacity>
                        {primary === "shipped" ? (
                          <Text style={twStyle("mt-2 text-xs leading-relaxed text-gray-500")}>
                            {po("shippedHint")}
                          </Text>
                        ) : null}
                      </>
                    ) : null}

                    {destructive.length > 0 ? (
                      <TouchableOpacity
                        onPress={() => {
                          const walkInRefund =
                            activeOrder.order_source === "walk_in" &&
                            destructive.length === 1 &&
                            destructive[0] === "refunded";
                          Alert.alert(
                            walkInRefund ? po("processRefundTitle") : po("moreActionsTitle"),
                            po("moreActionsBody"),
                            [
                              ...destructive.map((st) => ({
                                text: st === "cancelled" ? po("cancelOrderCta") : po("markRefunded"),
                                style: "destructive" as const,
                                onPress: () => {
                                  setTimeout(() => handleStatusTap(activeOrder.id, st), Platform.OS === "ios" ? 500 : 0);
                                },
                              })),
                              { text: po("close"), style: "cancel" },
                            ],
                          );
                        }}
                        disabled={patching}
                        style={twStyle("mt-3 flex-row items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-2.5")}
                        accessibilityRole="button"
                        accessibilityLabel={po("moreActionsA11y")}
                      >
                        <Ionicons
                          name={activeOrder.order_source === "walk_in" && activeOrder.status === "delivered"
                            ? "return-down-back-outline"
                            : "ellipsis-horizontal-circle-outline"}
                          size={18}
                          color={activeOrder.order_source === "walk_in" && activeOrder.status === "delivered" ? "#dc2626" : "#374151"}
                        />
                        <Text style={[twStyle("ms-2 text-sm font-semibold"), { color: activeOrder.order_source === "walk_in" && activeOrder.status === "delivered" ? "#dc2626" : "#374151" }]}>
                          {activeOrder.order_source === "walk_in" && activeOrder.status === "delivered" ? po("processRefundReturn") : po("moreActions")}
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                );
              })()}
            </KeyboardAvoidingView>
          ) : null}
        </BottomSheet>
      )}

      {/* ── Tracking number sheet (shown when marking shipped) ── */}
      <BottomSheet
        visible={cancelReasonSheetOpen}
        onClose={() => {
          setCancelReasonSheetOpen(false);
          setCancelReasonOrderId(null);
          setCancelReason("");
        }}
        title={po("cancelPaidTitle")}
        subtitle={po("cancelPaidSubtitle")}
      >
        <View style={twStyle("gap-3 pb-6")}>
          <Text style={twStyle("text-sm text-gray-600")}>
            {po("cancelPaidBody")}
          </Text>
          <TextInput
            value={cancelReason}
            onChangeText={setCancelReason}
            placeholder={po("cancelReasonPlaceholder")}
            placeholderTextColor="#9ca3af"
            multiline
            style={twStyle("min-h-[88px] rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
            accessibilityLabel={po("cancelReasonA11y")}
          />
          <ActionButton
            label={patching ? po("cancelling") : po("cancelPaidCta")}
            onPress={handleConfirmCancelWithReason}
            loading={patching}
            disabled={patching}
            fullWidth
          />
        </View>
      </BottomSheet>

      <BottomSheet
        visible={recordPaymentSheetOpen}
        onClose={() => {
          setRecordPaymentSheetOpen(false);
          setRecordPaymentReference("");
          setRecordPaymentMethod("cash");
        }}
        title={po("recordPaymentTitle")}
        subtitle={po("recordPaymentSubtitle")}
      >
        <View style={twStyle("gap-3 pb-6")}>
          {activeOrder?.order_source === "appointment" ? (
            <View style={twStyle("rounded-xl border border-blue-100 bg-blue-50 px-3 py-2")}>
              <Text style={twStyle("text-xs text-blue-900")}>
                {po("appointmentPaymentNoteSheet")}
              </Text>
              {activeOrder.booking_id ? (
                <TouchableOpacity
                  onPress={() => {
                    setRecordPaymentSheetOpen(false);
                    setViewOrder(null);
                    setOrderDetail(null);
                    router.push(`/(app)/(tabs)/more/bookings/${activeOrder.booking_id}` as never);
                  }}
                  style={twStyle("mt-2 flex-row items-center")}
                  accessibilityRole="button"
                  accessibilityLabel={po("goToBookingA11y")}
                >
                  <Ionicons name="calendar-outline" size={14} color="#1d4ed8" />
                  <Text style={twStyle("ms-1 text-xs font-semibold text-blue-800")}>{po("goToBooking")}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : (
            <>
          <Text style={twStyle("text-sm text-gray-600")}>
            {po("recordPaymentBody")}
          </Text>
          <View style={twStyle("flex-row flex-wrap")}>
            {[
              { label: po("payCash"), value: "cash" as const },
              { label: po("payCardOnDelivery"), value: "card_on_delivery" as const },
              { label: po("payYoco"), value: "yoco" as const },
              ...(canProcessPayments && paycloudEnabled && paycloudCollectEnabled
                ? [{
                    label: formatPaycloudCollectLabel({
                      context: "product_order",
                      amount: 0,
                      inFlight: paycloudInFlight,
                    }),
                    value: "paycloud" as const,
                  }]
                : []),
            ].map((option) => {
              const active = recordPaymentMethod === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  onPress={() => setRecordPaymentMethod(option.value)}
                  style={[
                    twStyle(`mb-2 rounded-full border px-3 py-2 ${active ? "border-emerald-600 bg-emerald-50" : "border-gray-200 bg-white"}`),
                    { marginEnd: 8 },
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active }}
                >
                  <Text style={twStyle(`text-xs font-semibold ${active ? "text-emerald-700" : "text-gray-600"}`)}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
            {canProcessPayments && paycloudEnabled && !paycloudCollectEnabled ? (
              <View style={twStyle("mb-2 w-full")}>
                <PaycloudCollectSetupAffordance blocker={paycloudPrimaryBlocker} compact loading={paycloudLoading} />
              </View>
            ) : null}
          </View>
          <TextInput
            value={recordPaymentReference}
            onChangeText={setRecordPaymentReference}
            placeholder={
              recordPaymentMethod === "yoco"
                ? po("refYocoRequired")
                : recordPaymentMethod === "paycloud"
                  ? po("refPaycloudOptional")
                  : po("refOptional")
            }
            placeholderTextColor="#9ca3af"
            style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
            accessibilityLabel={po("paymentRefA11y")}
          />
          {recordPaymentMethod === "yoco" ? (
            <ActionButton
              label={po("chargeYoco")}
              onPress={() => setShowYocoPaymentSheet(true)}
              variant="outline"
              fullWidth
            />
          ) : null}
          {recordPaymentMethod === "paycloud" ? (
            <ActionButton
              label={po("chargeCardMachine")}
              onPress={() => setShowPaycloudPaymentSheet(true)}
              fullWidth
            />
          ) : null}
          {recordPaymentMethod !== "paycloud" ? (
            <ActionButton
              label={postingOrderMutation ? po("recording") : po("recordPaymentCta")}
              onPress={handleRecordCollectionPayment}
              loading={postingOrderMutation}
              disabled={postingOrderMutation}
              fullWidth
            />
          ) : null}
          {paystackTerminalEnabled ? (
            <ActionButton
              label={po("collectPaystack")}
              onPress={() => {
                setRecordPaymentSheetOpen(false);
                setTerminalSheetOpen(true);
              }}
              variant="outline"
              fullWidth
            />
          ) : null}
            </>
          )}
        </View>
      </BottomSheet>

      <PaystackTerminalCollectSheet
        visible={terminalSheetOpen}
        onClose={() => setTerminalSheetOpen(false)}
        entityType="product_order"
        entityId={activeOrder?.id ?? null}
        expectedAmount={activeOrder ? orderCollectibleAmount(activeOrder) : 0}
        currency={activeOrder?.currency ?? currency}
        customerReference={activeOrder?.order_number ?? null}
      />

      <YocoPaymentSheet
        visible={showYocoPaymentSheet}
        onClose={() => setShowYocoPaymentSheet(false)}
        amountCents={Math.round((activeOrder ? orderCollectibleAmount(activeOrder) : 0) * 100)}
        currency={activeOrder?.currency ?? currency}
        description={po("yocoDescription", { number: activeOrder?.order_number ?? activeOrder?.id ?? "" })}
        onPaymentSuccess={(result) => void handleYocoCollectionSuccess(result)}
      />

      {activeOrder ? (
        <PayCloudPaymentSheet
          visible={showPaycloudPaymentSheet}
          onClose={() => setShowPaycloudPaymentSheet(false)}
          amount={orderCollectibleAmount(activeOrder)}
          currency={activeOrder.currency ?? currency}
          entityType="product_order"
          entityId={activeOrder.id}
          bookingLocationId={unwrapOne(activeOrder.collection_location)?.id ?? selectedLocationId ?? null}
          onPaymentSuccess={() => void handlePaycloudCollectionSuccess()}
        />
      ) : null}

      <BottomSheet
        visible={trackingSheetOpen}
        onClose={() => { setTrackingSheetOpen(false); setPendingStatus(null); }}
        title={po("markAsShipped")}
        subtitle={po("trackingSheetSubtitle")}
      >
        <View style={twStyle("gap-3 pb-6")}>
          <View>
            <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{po("trackingNumber")}</Text>
            <TextInput
              value={trackingNumber}
              onChangeText={setTrackingNumber}
              placeholder={po("trackingNumberPlaceholder")}
              placeholderTextColor="#9ca3af"
              autoCapitalize="characters"
              returnKeyType="next"
              style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
              accessibilityLabel={po("trackingNumberA11y")}
            />
          </View>
          <View>
            <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{po("carrier")}</Text>
            <TextInput
              value={carrier}
              onChangeText={setCarrier}
              placeholder={po("carrierPlaceholder")}
              placeholderTextColor="#9ca3af"
              returnKeyType="next"
              style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
              accessibilityLabel={po("carrierA11y")}
            />
          </View>
          {/* §Customer-audit 2026-04 (follow-up): let providers paste a
              carrier tracking link so the customer can tap straight through
              from their order detail page. */}
          <View>
            <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{po("estimatedDeliveryDate")}</Text>
            <TextInput
              value={estimatedDeliveryDate}
              onChangeText={setEstimatedDeliveryDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#9ca3af"
              autoCapitalize="none"
              style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
            />
          </View>
          <View>
            <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{po("trackingUrl")}</Text>
            <TextInput
              value={trackingUrl}
              onChangeText={setTrackingUrl}
              placeholder={po("trackingUrlPlaceholder")}
              placeholderTextColor="#9ca3af"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="done"
              style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
              accessibilityLabel={po("trackingUrlA11y")}
            />
            <Text style={twStyle("mt-1 text-xs text-gray-500")}>
              {po("trackingUrlHelp")}
            </Text>
          </View>
          <ActionButton
            label={patching ? po("saving") : po("confirmShipped")}
            onPress={handleConfirmShipped}
            loading={patching}
            disabled={patching}
            fullWidth
          />
          <TouchableOpacity
            onPress={() => { setTrackingSheetOpen(false); setPendingStatus(null); }}
            style={twStyle("items-center py-2")}
          >
            <Text style={twStyle("text-sm text-gray-400")}>{po("cancel")}</Text>
          </TouchableOpacity>
        </View>
      </BottomSheet>
    </>
  );
}

export default function ProductOrdersScreen() {
  const { t } = useTranslation();
  const { order } = useLocalSearchParams<{ order?: string }>();
  const deepLinkOrderId = typeof order === "string" ? order : Array.isArray(order) ? order[0] : undefined;

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader title={t("provider.mobile.screens.productOrders.title") as string} showBack subtitle={t("provider.mobile.screens.productOrders.subtitle") as string} />
      <ProductOrdersContent deepLinkOrderId={deepLinkOrderId} />
    </ScreenContainer>
  );
}
