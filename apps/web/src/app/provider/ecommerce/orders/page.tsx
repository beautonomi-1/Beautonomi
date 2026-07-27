"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useProviderMoneyFormat } from "@/hooks/use-provider-money-format";
import { fetcher, clearFetcherCache } from "@/lib/http/fetcher";
import { cn } from "@/lib/utils";
import type { YocoPayment } from "@/lib/provider-portal/types";
import { Badge } from "@/components/ui/badge";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import { Input } from "@/components/ui/input";
import { YocoPaymentDialog } from "@/components/provider-portal/YocoPaymentDialog";
import { PayCloudPaymentDialog } from "@/components/provider-portal/PayCloudPaymentDialog";
import { ShareReceiptButton } from "@/components/receipts/ShareReceiptButton";
import { usePaycloudCollectReady } from "@/hooks/usePaycloudCollectReady";
import {
  formatPaycloudCollectLabel,
  PAYCLOUD_SETUP_LABEL,
} from "@/lib/payments/paycloud-collect-cta";
import Link from "next/link";
import { useFeatureFlag } from "@/providers/ConfigBundleProvider";
import { useProviderPortal } from "@/providers/provider-portal/ProviderPortalProvider";
import { usePermissions } from "@/hooks/usePermissions";
import {
  ShoppingBag,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";

interface ProductOrder {
  id: string;
  order_number: string;
  status: string;
  subtotal?: number;
  tax_amount?: number;
  delivery_fee?: number;
  discount_amount?: number;
  platform_fee?: number;
  total_amount: number;
  payment_status: string;
  fulfillment_type: string;
  order_source?: string | null;
  booking_id?: string | null;
  customer_name?: string | null;
  tracking_number: string | null;
  created_at: string;
  customer?: { id: string; full_name: string; email: string; identity_verified?: boolean | null } | null;
  items: {
    id: string;
    product_name: string;
    quantity: number;
    total_price: number;
    product_variant?: { option_values?: Record<string, string> } | null;
  }[];
}

type ProductOrderStatusCounts = Record<string, number>;

const STATUS_ACTIONS: Record<string, { next: string; label: string; color: string }[]> = {
  pending: [
    { next: "confirmed", label: "Confirm Order", color: "bg-blue-600 hover:bg-blue-700" },
    { next: "cancelled", label: "Cancel", color: "bg-red-600 hover:bg-red-700" },
  ],
  confirmed: [
    { next: "processing", label: "Start Processing", color: "bg-purple-600 hover:bg-purple-700" },
  ],
  processing: [
    { next: "shipped", label: "Mark Shipped", color: "bg-indigo-600 hover:bg-indigo-700" },
    { next: "ready_for_collection", label: "Ready for Collection", color: "bg-teal-600 hover:bg-teal-700" },
  ],
  shipped: [
    { next: "delivered", label: "Mark Delivered", color: "bg-green-600 hover:bg-green-700" },
  ],
  ready_for_collection: [
    { next: "delivered", label: "Collected", color: "bg-green-600 hover:bg-green-700" },
  ],
};

const STATUS_OPTIONS = [
  "pending",
  "confirmed",
  "processing",
  "ready_for_collection",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
];

const ACTION_REQUIRED_STATUSES = new Set(["pending", "confirmed", "processing", "ready_for_collection", "shipped"]);

const STATUS_FILTER_TABS = [
  { value: "", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "processing", label: "Processing" },
  { value: "ready_for_collection", label: "Ready for collection" },
  { value: "shipped", label: "Shipped" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
];

const STATUS_BADGE: Record<string, "default" | "destructive" | "outline" | "secondary"> = {
  pending: "outline",
  confirmed: "secondary",
  processing: "secondary",
  shipped: "default",
  ready_for_collection: "default",
  delivered: "default",
  cancelled: "destructive",
};

export default function ProviderProductOrdersPage() {
  const yocoEnabled = useFeatureFlag("payment_yoco");
  const paycloudEnabled = useFeatureFlag("payment_paycloud");
  const { ready: paycloudReady, blockers, terminals } = usePaycloudCollectReady();
  const paycloudInFlight = (terminals?.inFlight ?? 0) > 0;
  const { selectedLocationId } = useProviderPortal();
  const { hasPermission, isOwner } = usePermissions();
  const canProcessPayments = isOwner || hasPermission("process_payments");
  const searchParams = useSearchParams();
  const focusOrderId = searchParams.get("order")?.trim() ?? "";
  const highlightRef = useRef<HTMLDivElement | null>(null);

  const { format: formatMoney } = useProviderMoneyFormat();
  const [orders, setOrders] = useState<ProductOrder[]>([]);
  const [prefetchedFocusOrder, setPrefetchedFocusOrder] = useState<ProductOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [statusCounts, setStatusCounts] = useState<ProductOrderStatusCounts>({});
  const [totalOrderCount, setTotalOrderCount] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [updating, setUpdating] = useState<string | null>(null);
  const [error, setError] = useState("");

  const [trackingDialog, setTrackingDialog] = useState<{ orderId: string; status: string } | null>(null);
  const [trackingInput, setTrackingInput] = useState("");
  // §Customer-audit 2026-04 (follow-up): capture a carrier name + tracking URL
  // so customers can tap straight through from their order detail page.
  const [carrierInput, setCarrierInput] = useState("");
  const [trackingUrlInput, setTrackingUrlInput] = useState("");
  const [yocoDialogOpen, setYocoDialogOpen] = useState(false);
  const [yocoOrder, setYocoOrder] = useState<ProductOrder | null>(null);
  const [paycloudDialogOpen, setPaycloudDialogOpen] = useState(false);
  const [paycloudOrder, setPaycloudOrder] = useState<ProductOrder | null>(null);

  // Refund dialog: capture method (cash vs wallet), amount, and reason so
  // product-sale refunds match the in-person/wallet split used for bookings.
  const [refundDialog, setRefundDialog] = useState<ProductOrder | null>(null);
  const [refundMethodInput, setRefundMethodInput] = useState<"cash" | "store_credit">("cash");
  const [refundAmountInput, setRefundAmountInput] = useState("");
  const [refundReasonInput, setRefundReasonInput] = useState("");

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      if (statusFilter) params.set("status", statusFilter);

      const res = await fetcher.get<{
        data: {
          orders: ProductOrder[];
          status_counts?: ProductOrderStatusCounts;
          pagination: { totalPages: number; totalAll?: number };
        };
      }>(`/api/provider/product-orders?${params}`);

      if (res?.data) {
        setOrders(res.data.orders);
        setStatusCounts(res.data.status_counts ?? {});
        setTotalOrderCount(Number(res.data.pagination.totalAll ?? 0));
        setTotalPages(res.data.pagination.totalPages);
      }
    } catch {
      setError("Failed to load orders");
    }
    setLoading(false);
  }, [page, statusFilter]);

  useEffect(() => {
    const id = setTimeout(() => fetchOrders(), 0);
    return () => clearTimeout(id);
  }, [fetchOrders]);

  useEffect(() => {
    if (!focusOrderId) {
      setPrefetchedFocusOrder(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = (await fetcher.get(`/api/provider/product-orders/${focusOrderId}`)) as {
          data?: { order?: ProductOrder };
        };
        const ord = res?.data?.order;
        if (!cancelled && ord) setPrefetchedFocusOrder(ord);
        else if (!cancelled) setPrefetchedFocusOrder(null);
      } catch {
        if (!cancelled) setPrefetchedFocusOrder(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [focusOrderId]);

  const displayOrders = useMemo(() => {
    if (!prefetchedFocusOrder) return orders;
    if (orders.some((o) => o.id === prefetchedFocusOrder.id)) return orders;
    return [prefetchedFocusOrder, ...orders];
  }, [orders, prefetchedFocusOrder]);

  const actionRequiredCount = useMemo(
    () =>
      Array.from(ACTION_REQUIRED_STATUSES).reduce(
        (sum, orderStatus) => sum + Number(statusCounts[orderStatus] ?? 0),
        0,
      ),
    [statusCounts],
  );

  useEffect(() => {
    if (!focusOrderId || loading) return;
    const found = displayOrders.some((o) => o.id === focusOrderId);
    if (!found) return;
    const id = window.requestAnimationFrame(() => {
      highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => cancelAnimationFrame(id);
  }, [focusOrderId, loading, displayOrders]);

  const handleStatusUpdate = async (orderId: string, newStatus: string) => {
    if (newStatus === "shipped") {
      setTrackingDialog({ orderId, status: newStatus });
      setTrackingInput("");
      setCarrierInput("");
      setTrackingUrlInput("");
      return;
    }
    if (newStatus === "refunded") {
      if (!canProcessPayments) {
        setError("You do not have permission to refund orders.");
        return;
      }
      const order = orders.find((o) => o.id === orderId) ?? prefetchedFocusOrder;
      if (!order) return;
      setRefundDialog(order);
      setRefundAmountInput(Number(order.total_amount ?? 0).toFixed(2));
      setRefundReasonInput("");
      // Online orders with a platform customer default to wallet credit;
      // walk-in / unlinked sales default to in-person cash.
      const isOnline = order.order_source === "online";
      setRefundMethodInput(isOnline && order.customer?.id ? "store_credit" : "cash");
      return;
    }
    if (newStatus === "cancelled") {
      const order = orders.find((o) => o.id === orderId) ?? prefetchedFocusOrder;
      if (order?.payment_status === "paid") {
        const reason = window.prompt("Cancellation reason for this paid order");
        if (!reason?.trim()) {
          setError("Cancellation reason is required for paid orders.");
          return;
        }
        await submitStatusUpdate(orderId, newStatus, { cancellation_reason: reason.trim() });
        return;
      }
    }
    await submitStatusUpdate(orderId, newStatus);
  };

  const submitStatusUpdate = async (
    orderId: string,
    newStatus: string,
    shipping?: { tracking_number?: string; carrier?: string; tracking_url?: string; cancellation_reason?: string },
    refund?: { refund_method?: "cash" | "store_credit"; refund_amount?: number; refund_reason?: string },
  ) => {
    setUpdating(orderId);
    setError("");
    try {
      const payload: Record<string, any> = { status: newStatus };
      if (shipping?.tracking_number) payload.tracking_number = shipping.tracking_number;
      if (shipping?.carrier) payload.carrier = shipping.carrier;
      if (shipping?.tracking_url) payload.tracking_url = shipping.tracking_url;
      if (shipping?.cancellation_reason) payload.cancellation_reason = shipping.cancellation_reason;
      if (refund?.refund_method) payload.refund_method = refund.refund_method;
      if (refund?.refund_amount != null) payload.refund_amount = refund.refund_amount;
      if (refund?.refund_reason) payload.refund_reason = refund.refund_reason;
      const res = await fetcher.patch<{ data?: { order?: ProductOrder } }>(`/api/provider/product-orders/${orderId}`, payload);
      const updatedOrder = res?.data?.order;
      if (updatedOrder) {
        setOrders(prev => prev.map(o => o.id === updatedOrder.id ? { ...o, ...updatedOrder } : o));
      }
      clearFetcherCache();
      fetchOrders();
      setRefundDialog(null);
    } catch (e: any) {
      setError(e?.message || "Failed to update order status");
    }
    setUpdating(null);
    setTrackingDialog(null);
  };

  const openYocoCollection = (order: ProductOrder) => {
    setYocoOrder(order);
    setYocoDialogOpen(true);
  };

  const openPaycloudCollection = (order: ProductOrder) => {
    setPaycloudOrder(order);
    setPaycloudDialogOpen(true);
  };

  const handleYocoCollectionSuccess = async (payment: YocoPayment) => {
    if (!yocoOrder) return;
    try {
      await fetcher.post(`/api/provider/product-orders/${yocoOrder.id}/mark-collected`, {
        payment_method: "yoco",
        reference: payment.yoco_payment_id,
        idempotency_key: `web-yoco-${yocoOrder.id}-${payment.yoco_payment_id}`,
      });
      clearFetcherCache();
      await fetchOrders();
      setYocoDialogOpen(false);
      setYocoOrder(null);
    } catch {
      setError("Card charged, but recording collection failed. Retry recording payment with the same reference.");
    }
  };

  return (
    <div className="space-y-6 min-w-0 max-w-full overflow-x-hidden px-1 sm:px-0">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Product Orders</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage customer product purchases and fulfillment
          {actionRequiredCount > 0 && (
            <span className="ml-2 font-medium text-pink-700">
              {actionRequiredCount} need action
            </span>
          )}
        </p>
      </div>

      {error && (
        <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          {error}
          <button onClick={() => setError("")}><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        {STATUS_FILTER_TABS.map(
          ({ value, label }) => {
            const count = value ? Number(statusCounts[value] ?? 0) : totalOrderCount;
            const isSelected = statusFilter === value;
            const needsAction = Boolean(value && ACTION_REQUIRED_STATUSES.has(value) && count > 0);
            return (
            <button
              key={value || "all"}
              onClick={() => { setStatusFilter(value); setPage(1); }}
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                isSelected
                  ? "bg-pink-600 text-white"
                  : needsAction
                    ? "bg-pink-50 text-pink-800 ring-1 ring-pink-200 hover:bg-pink-100"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200",
              )}
            >
              <span>{label}</span>
              <span
                className={cn(
                  "min-w-5 rounded-full px-1.5 py-0.5 text-center text-[11px] font-bold leading-none",
                  isSelected
                    ? "bg-white/20 text-white"
                    : needsAction
                      ? "bg-pink-600 text-white"
                      : "bg-white text-gray-600 ring-1 ring-gray-200",
                )}
              >
                {count > 99 ? "99+" : count}
              </span>
            </button>
            );
          },
        )}
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500">Loading...</div>
        ) : displayOrders.length === 0 ? (
          <div className="p-12 text-center">
            <ShoppingBag className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No orders found</p>
          </div>
        ) : (
          <div className="divide-y">
            {displayOrders.map((o) => {
              const actions = STATUS_ACTIONS[o.status] ?? [];
              const isFocus = Boolean(focusOrderId && o.id === focusOrderId);
              const subtotal = Number(o.subtotal ?? 0);
              const taxAmount = Number(o.tax_amount ?? 0);
              const deliveryFee = Number(o.delivery_fee ?? 0);
              const discountAmount = Number(o.discount_amount ?? 0);
              const platformFee = Number(o.platform_fee ?? 0);
              const totalAmount = Number(o.total_amount ?? 0);
              const providerEarnings = Math.max(0, totalAmount - platformFee);
              const isAppointmentOrder = o.order_source === "appointment";
              const canCollectPayment =
                canProcessPayments &&
                o.payment_status !== "paid" &&
                o.status !== "cancelled" &&
                o.status !== "refunded";
              const canCollectWithYoco = yocoEnabled && canCollectPayment;
              const canCollectWithPaycloud =
                paycloudEnabled && canCollectPayment && !isAppointmentOrder;
              const canRefundOrder =
                canProcessPayments &&
                o.payment_status === "paid" &&
                o.status !== "cancelled" &&
                o.status !== "refunded";
              return (
                <div
                  key={o.id}
                  ref={isFocus ? highlightRef : undefined}
                  id={isFocus ? "provider-order-focus" : undefined}
                  className={cn(
                    "p-4 sm:p-5 hover:bg-gray-50 transition-colors rounded-xl",
                    isFocus && "ring-2 ring-pink-500 ring-offset-2 bg-pink-50/30",
                  )}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className="font-bold text-gray-900 text-lg">{o.order_number}</span>
                        <Badge variant={STATUS_BADGE[o.status] ?? "outline"}>
                          {o.status.replace(/_/g, " ")}
                        </Badge>
                        <Badge variant={o.payment_status === "paid" ? "default" : "outline"}>
                          {o.payment_status}
                        </Badge>
                        {o.order_source === "appointment" && (
                          <Badge variant="outline">appointment pickup</Badge>
                        )}
                      </div>
                      <p className="text-sm text-gray-700 break-words inline-flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium">{o.customer?.full_name || o.customer_name || "Appointment customer"}</span>
                        {o.customer?.identity_verified ? (
                          <VerifiedBadge verified iconOnly />
                        ) : null}
                        {o.customer?.email && <span className="text-gray-400">({o.customer.email})</span>}
                      </p>
                      <div className="mt-2 space-y-1">
                        {o.items?.map((item) => (
                          <div key={item.id} className="flex items-center gap-2 text-sm text-gray-600">
                            <span className="text-gray-400">{item.quantity}x</span>
                            <span>
                              {item.product_name}
                              {item.product_variant?.option_values && Object.keys(item.product_variant.option_values).length > 0 && (
                                <span className="text-gray-500"> · {Object.values(item.product_variant.option_values).join(", ")}</span>
                              )}
                            </span>
                            <span className="text-gray-400">{formatMoney(Number(item.total_price))}</span>
                          </div>
                        ))}
                      </div>
                      {o.tracking_number && (
                        <p className="text-xs text-blue-600 mt-2">Tracking: {o.tracking_number}</p>
                      )}
                    </div>
                    <div className="text-left sm:text-right shrink-0 w-full sm:w-auto border-t sm:border-t-0 border-gray-100 pt-3 sm:pt-0">
                      <p className="text-xl font-bold text-gray-900">{formatMoney(totalAmount)}</p>
                      <div className="mt-2 space-y-0.5 text-xs text-gray-500">
                        {subtotal > 0 && <p>Items: {formatMoney(subtotal)}</p>}
                        {taxAmount > 0 && <p>Tax/VAT: {formatMoney(taxAmount)}</p>}
                        {deliveryFee > 0 && <p>Delivery: {formatMoney(deliveryFee)}</p>}
                        {discountAmount > 0 && <p>Discount: -{formatMoney(discountAmount)}</p>}
                        {platformFee > 0 && <p>Platform fee: -{formatMoney(platformFee)}</p>}
                        <p className="font-medium text-gray-700">
                          {isAppointmentOrder
                            ? "Included in booking total"
                            : `Provider earnings: ${formatMoney(providerEarnings)}`}
                        </p>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(o.created_at).toLocaleDateString()} ·{" "}
                        {isAppointmentOrder
                          ? "Appointment pickup"
                          : o.fulfillment_type === "delivery" ? "Delivery" : "Collection"}
                      </p>
                      <select
                        value={o.status}
                        onChange={(e) => handleStatusUpdate(o.id, e.target.value)}
                        disabled={updating === o.id || o.status === "cancelled" || o.status === "refunded"}
                        className="mt-3 w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 disabled:opacity-50"
                        aria-label={`Update order ${o.order_number} status`}
                      >
                        {STATUS_OPTIONS.filter(
                          (status) => status !== "refunded" || canRefundOrder || o.status === "refunded",
                        ).map((status) => (
                          <option key={status} value={status}>
                            {status.replace(/_/g, " ")}
                          </option>
                        ))}
                      </select>
                      <div className="flex flex-wrap gap-2 mt-3 justify-start sm:justify-end">
                        <ShareReceiptButton
                          kind="provider-order"
                          subjectId={o.id}
                          label="Share"
                          className="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 inline-flex items-center gap-1"
                        />
                        <a
                          href={`/api/provider/product-orders/${o.id}/receipt/pdf`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
                        >
                          Download receipt
                        </a>
                        {actions.length > 0 &&
                          actions.map((a) => (
                            <button
                              key={a.next}
                              onClick={() => handleStatusUpdate(o.id, a.next)}
                              disabled={updating === o.id}
                              className={`px-3 py-1.5 text-xs font-medium text-white rounded-lg ${a.color} disabled:opacity-50`}
                            >
                              {updating === o.id ? "..." : a.label}
                            </button>
                          ))}
                        {canCollectWithPaycloud ? (
                          paycloudReady || paycloudInFlight ? (
                            <button
                              onClick={() => openPaycloudCollection(o)}
                              className="px-3 py-1.5 text-xs font-medium text-white rounded-lg bg-gray-900 hover:bg-black"
                            >
                              {formatPaycloudCollectLabel({
                                context: "product_order",
                                amount: providerEarnings,
                                inFlight: paycloudInFlight,
                              })}
                            </button>
                          ) : (
                            <Link
                              href={blockers[0]?.href ?? "/provider/settings/sales/card-machines"}
                              className="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
                            >
                              {PAYCLOUD_SETUP_LABEL}
                            </Link>
                          )
                        ) : null}
                        {canCollectWithYoco ? (
                          <button
                            onClick={() => openYocoCollection(o)}
                            className="px-3 py-1.5 text-xs font-medium text-white rounded-lg bg-gray-900 hover:bg-black"
                          >
                            Collect with Yoco
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {paycloudOrder ? (
        <PayCloudPaymentDialog
          open={paycloudDialogOpen}
          onOpenChange={(open) => {
            setPaycloudDialogOpen(open);
            if (!open) setPaycloudOrder(null);
          }}
          amount={Number(paycloudOrder.total_amount || 0)}
          entityType="product_order"
          entityId={paycloudOrder.id}
          bookingLocationId={selectedLocationId}
          onSuccess={() => {
            clearFetcherCache();
            void fetchOrders();
            setPaycloudDialogOpen(false);
            setPaycloudOrder(null);
          }}
        />
      ) : null}

      {yocoOrder ? (
        <YocoPaymentDialog
          open={yocoDialogOpen}
          onOpenChange={(open) => {
            setYocoDialogOpen(open);
            if (!open) setYocoOrder(null);
          }}
          amount={Number(yocoOrder.total_amount || 0)}
          onSuccess={handleYocoCollectionSuccess}
        />
      ) : null}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1} className="p-2 border rounded-lg hover:bg-gray-50 disabled:opacity-50">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-gray-600">Page {page} of {totalPages}</span>
          <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages} className="p-2 border rounded-lg hover:bg-gray-50 disabled:opacity-50">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Tracking number dialog */}
      {trackingDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Shipping details</h3>
            <p className="text-sm text-gray-500 mb-4">
              All fields are optional — add what you have and customers will see it on their order.
            </p>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tracking number</label>
            <Input
              value={trackingInput}
              onChange={(e) => setTrackingInput(e.target.value)}
              placeholder="e.g. TRACK-12345"
              className="mb-3"
            />
            <label className="block text-xs font-medium text-gray-600 mb-1">Carrier / courier</label>
            <Input
              value={carrierInput}
              onChange={(e) => setCarrierInput(e.target.value)}
              placeholder="e.g. Aramex, DHL, Paxi"
              className="mb-3"
            />
            <label className="block text-xs font-medium text-gray-600 mb-1">Tracking URL</label>
            <Input
              value={trackingUrlInput}
              onChange={(e) => setTrackingUrlInput(e.target.value)}
              placeholder="https://…"
              type="url"
              className="mb-1"
            />
            <p className="text-xs text-gray-500 mb-4">
              Paste the carrier&apos;s tracking page so customers can click through from their order.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setTrackingDialog(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 border rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const urlTrim = trackingUrlInput.trim();
                  if (urlTrim && !/^https?:\/\//i.test(urlTrim)) {
                    setError("Tracking URL must start with http:// or https://");
                    return;
                  }
                  submitStatusUpdate(trackingDialog.orderId, trackingDialog.status, {
                    tracking_number: trackingInput.trim() || undefined,
                    carrier: carrierInput.trim() || undefined,
                    tracking_url: urlTrim || undefined,
                  });
                }}
                disabled={updating === trackingDialog.orderId}
                className="px-4 py-2 text-sm font-medium text-white bg-pink-600 rounded-lg hover:bg-pink-700 disabled:opacity-50"
              >
                {updating ? "Updating..." : "Confirm & Ship"}
              </button>
            </div>
          </div>
        </div>
      )}

      {refundDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl space-y-4">
            <div>
              <h3 className="text-lg font-bold text-gray-900">Refund order</h3>
              <p className="text-sm text-gray-500">
                Order {refundDialog.order_number} · Paid {formatMoney(Number(refundDialog.total_amount ?? 0))}
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Refund amount</label>
              <Input
                type="number"
                value={refundAmountInput}
                onChange={(e) => setRefundAmountInput(e.target.value)}
                min="0"
                max={Number(refundDialog.total_amount ?? 0)}
                step="0.01"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Refund method</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setRefundMethodInput("cash")}
                  className={`min-h-[44px] rounded-lg border px-3 text-sm font-medium transition ${
                    refundMethodInput === "cash"
                      ? "border-pink-600 bg-pink-50 text-pink-700"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  In person (cash)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!refundDialog.customer?.id) {
                      setError("This order has no customer account to credit. Refund in person instead.");
                      return;
                    }
                    setRefundMethodInput("store_credit");
                  }}
                  disabled={!refundDialog.customer?.id}
                  className={`min-h-[44px] rounded-lg border px-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    refundMethodInput === "store_credit"
                      ? "border-pink-600 bg-pink-50 text-pink-700"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  Wallet credit
                </button>
              </div>
              <p className="mt-1.5 text-xs text-gray-500">
                {refundMethodInput === "cash"
                  ? "Records the refund as returned to the customer in person. No wallet credit is issued."
                  : "Adds store credit to the customer's wallet for a future purchase."}
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Reason (optional)</label>
              <Input
                value={refundReasonInput}
                onChange={(e) => setRefundReasonInput(e.target.value)}
                placeholder="e.g. Damaged item, customer request"
              />
            </div>
            <div className="flex gap-3 justify-end pt-1">
              <button
                onClick={() => setRefundDialog(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 border rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const amount = parseFloat(refundAmountInput);
                  const total = Number(refundDialog.total_amount ?? 0);
                  if (!Number.isFinite(amount) || amount <= 0 || amount > total + 0.01) {
                    setError(`Refund amount must be between 0 and ${formatMoney(total)}.`);
                    return;
                  }
                  submitStatusUpdate(refundDialog.id, "refunded", undefined, {
                    refund_method: refundMethodInput,
                    refund_amount: amount,
                    refund_reason: refundReasonInput.trim() || undefined,
                  });
                }}
                disabled={updating === refundDialog.id}
                className="px-4 py-2 text-sm font-medium text-white bg-pink-600 rounded-lg hover:bg-pink-700 disabled:opacity-50"
              >
                {updating === refundDialog.id ? "Processing..." : "Confirm refund"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
