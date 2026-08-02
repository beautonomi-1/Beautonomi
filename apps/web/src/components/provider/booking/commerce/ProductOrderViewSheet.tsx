"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2, Package, X } from "lucide-react";
import { toast } from "sonner";
import { fetcher, clearFetcherCache } from "@/lib/http/fetcher";
import { useProviderMoneyFormat } from "@/hooks/use-provider-money-format";
import { useFeatureFlag } from "@/providers/ConfigBundleProvider";
import { usePermissions } from "@/hooks/usePermissions";
import { useProviderPortal } from "@/providers/provider-portal/ProviderPortalProvider";
import { usePaycloudCollectReady } from "@/hooks/usePaycloudCollectReady";
import { PaycloudCollectButton } from "@/components/provider-portal/PaycloudCollectButton";
import { ShareReceiptButton } from "@/components/receipts/ShareReceiptButton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { YocoPayment } from "@/lib/provider-portal/types";
import {
  PRODUCT_ORDER_STATUS_ACTIONS,
  PRODUCT_ORDER_STATUS_OPTIONS,
  type ProductOrderSheetOrder,
} from "@/lib/provider-booking/product-order-sheet-utils";
import {
  BookingBottomSheet,
  BookingActionButton,
  BookingSectionCard,
  BookingSectionLabel,
  BookingSummaryRow,
  BookingStatusChip,
} from "../ui";

const YocoPaymentDialog = dynamic(
  () =>
    import("@/components/provider-portal/YocoPaymentDialog").then((m) => ({
      default: m.YocoPaymentDialog,
    })),
  { ssr: false },
);

const PayCloudPaymentDialog = dynamic(
  () =>
    import("@/components/provider-portal/PayCloudPaymentDialog").then((m) => ({
      default: m.PayCloudPaymentDialog,
    })),
  { ssr: false },
);

interface ProductOrderViewSheetProps {
  open: boolean;
  orderId: string | null;
  onOpenChange: (open: boolean) => void;
  onUpdated?: () => void;
}

export function ProductOrderViewSheet({
  open,
  orderId,
  onOpenChange,
  onUpdated,
}: ProductOrderViewSheetProps) {
  const { format: formatMoney } = useProviderMoneyFormat();
  const { hasPermission, isOwner } = usePermissions();
  const canProcessPayments = isOwner || hasPermission("process_payments");
  const yocoEnabled = useFeatureFlag("payment_yoco");
  const paycloudEnabled = useFeatureFlag("payment_paycloud");
  const { ready: paycloudReady, terminals } = usePaycloudCollectReady();
  const paycloudInFlight = (terminals?.inFlight ?? 0) > 0;
  const { selectedLocationId } = useProviderPortal();

  const [order, setOrder] = useState<ProductOrderSheetOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [yocoOpen, setYocoOpen] = useState(false);
  const [paycloudOpen, setPaycloudOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [trackingOpen, setTrackingOpen] = useState(false);
  const [trackingNumber, setTrackingNumber] = useState("");
  const [carrier, setCarrier] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");
  const [pendingShipStatus, setPendingShipStatus] = useState<string | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refundMethod, setRefundMethod] = useState<"cash" | "store_credit">("cash");

  const load = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    try {
      const res = await fetcher.get<{ data?: { order?: ProductOrderSheetOrder } }>(
        `/api/provider/product-orders/${orderId}`,
      );
      setOrder(res?.data?.order ?? null);
    } catch {
      toast.error("Failed to load order");
      setOrder(null);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    if (!open || !orderId) return;
    void load();
  }, [open, orderId, load]);

  const patchOrder = async (
    payload: Record<string, unknown>,
  ): Promise<ProductOrderSheetOrder | null> => {
    if (!orderId) return null;
    setBusy(true);
    try {
      const res = await fetcher.patch<{ data?: { order?: ProductOrderSheetOrder } }>(
        `/api/provider/product-orders/${orderId}`,
        payload,
      );
      const updated = res?.data?.order ?? null;
      if (updated) setOrder(updated);
      clearFetcherCache();
      onUpdated?.();
      return updated;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!order) return;
    if (newStatus === "refunded") {
      setRefundAmount(Number(order.total_amount ?? 0).toFixed(2));
      setRefundReason("");
      const isOnline = order.order_source === "online";
      setRefundMethod(isOnline && order.customer?.id ? "store_credit" : "cash");
      setRefundOpen(true);
      return;
    }
    if (newStatus === "cancelled" && order.payment_status === "paid") {
      const reason = window.prompt("Cancellation reason for this paid order");
      if (!reason?.trim()) {
        toast.error("Cancellation reason is required for paid orders");
        return;
      }
      await patchOrder({ status: newStatus, cancellation_reason: reason.trim() });
      return;
    }
    if (newStatus === "shipped") {
      setPendingShipStatus(newStatus);
      setTrackingNumber(order.tracking_number ?? "");
      setCarrier("");
      setTrackingUrl("");
      setTrackingOpen(true);
      return;
    }
    await patchOrder({ status: newStatus });
  };

  const submitTracking = async () => {
    if (!order || !pendingShipStatus) return;
    const urlTrim = trackingUrl.trim();
    if (urlTrim && !/^https?:\/\//i.test(urlTrim)) {
      toast.error("Tracking URL must start with http:// or https://");
      return;
    }
    await patchOrder({
      status: pendingShipStatus,
      tracking_number: trackingNumber.trim() || undefined,
      carrier: carrier.trim() || undefined,
      tracking_url: urlTrim || undefined,
    } as Record<string, unknown>);
    setTrackingOpen(false);
    setPendingShipStatus(null);
  };

  const handleRefund = async () => {
    if (!order) return;
    const amount = Number(refundAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a valid refund amount");
      return;
    }
    const ok = await patchOrder({
      status: "refunded",
      refund_method: refundMethod,
      refund_amount: amount,
      refund_reason: refundReason.trim() || undefined,
    });
    if (ok) {
      toast.success("Refund processed");
      setRefundOpen(false);
    }
  };

  const handleYocoSuccess = async (payment: YocoPayment) => {
    if (!order) return;
    try {
      await fetcher.post(`/api/provider/product-orders/${order.id}/mark-collected`, {
        payment_method: "yoco",
        reference: payment.yoco_payment_id,
        idempotency_key: `web-yoco-${order.id}-${payment.yoco_payment_id}`,
      });
      clearFetcherCache();
      await load();
      onUpdated?.();
      setYocoOpen(false);
      toast.success("Payment recorded");
    } catch {
      toast.error("Card charged but recording failed — retry with same reference");
    }
  };

  const isAppointmentOrder = order?.order_source === "appointment";
  const canCollect =
    canProcessPayments &&
    order &&
    order.payment_status !== "paid" &&
    order.status !== "cancelled" &&
    order.status !== "refunded";
  const canCollectPaycloud = paycloudEnabled && canCollect && !isAppointmentOrder;
  const canCollectYoco = yocoEnabled && canCollect;
  const canRefund =
    canProcessPayments &&
    order?.payment_status === "paid" &&
    order.status !== "cancelled" &&
    order.status !== "refunded";
  const actions = order ? PRODUCT_ORDER_STATUS_ACTIONS[order.status] ?? [] : [];
  const totalAmount = Number(order?.total_amount ?? 0);
  const platformFee = Number(order?.platform_fee ?? 0);
  const providerEarnings = Math.max(0, totalAmount - platformFee);

  const header = (
    <div className="flex items-center gap-2">
      <div className="flex-1 min-w-0">
        <h2 className="text-lg font-semibold text-gray-900 truncate">
          {order?.order_number ?? "Product order"}
        </h2>
        {order?.status ? (
          <div className="mt-1 flex flex-wrap gap-1">
            <BookingStatusChip status={order.status} />
            {order.payment_status ? (
              <span className="text-xs text-gray-500 capitalize">{order.payment_status}</span>
            ) : null}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => onOpenChange(false)}
        className="p-2 -mr-2 rounded-full touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center"
        aria-label="Close"
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  );

  return (
    <>
      <BookingBottomSheet open={open} onOpenChange={onOpenChange} mode="view" header={header}>
        {loading && !order ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : order ? (
          <div className="space-y-4 pb-4">
            <BookingSectionCard>
              <BookingSectionLabel className="mb-2 flex items-center gap-1.5">
                <Package className="h-4 w-4" />
                Customer
              </BookingSectionLabel>
              <BookingSummaryRow
                label="Name"
                value={order.customer?.full_name || order.customer_name || "Walk-in customer"}
              />
              {order.customer?.email ? (
                <BookingSummaryRow label="Email" value={order.customer.email} />
              ) : null}
            </BookingSectionCard>

            <BookingSectionCard>
              <BookingSectionLabel className="mb-2">Items</BookingSectionLabel>
              <ul className="space-y-2 text-sm">
                {order.items?.map((item) => (
                  <li key={item.id} className="flex justify-between gap-2">
                    <span>
                      {item.quantity}× {item.product_name}
                      {item.product_variant?.option_values &&
                      Object.keys(item.product_variant.option_values).length > 0
                        ? ` · ${Object.values(item.product_variant.option_values).join(", ")}`
                        : ""}
                    </span>
                    <span className="font-medium shrink-0">
                      {formatMoney(Number(item.total_price))}
                    </span>
                  </li>
                ))}
              </ul>
            </BookingSectionCard>

            <BookingSectionCard>
              <BookingSectionLabel className="mb-2">Totals</BookingSectionLabel>
              <BookingSummaryRow label="Total" value={formatMoney(totalAmount)} emphasize />
              {!isAppointmentOrder ? (
                <BookingSummaryRow label="Your earnings" value={formatMoney(providerEarnings)} />
              ) : (
                <p className="text-xs text-gray-500 mt-1">Included in booking total</p>
              )}
            </BookingSectionCard>

            {canCollect ? (
              <BookingSectionCard>
                <BookingSectionLabel className="mb-2">Collect payment</BookingSectionLabel>
                <div className="flex flex-col gap-2">
                  {canCollectPaycloud ? (
                    <PaycloudCollectButton
                      amount={totalAmount}
                      currency="ZAR"
                      context="product_order"
                      inFlight={paycloudInFlight}
                      onClick={() => {
                        if (paycloudReady || paycloudInFlight) setPaycloudOpen(true);
                      }}
                      className="w-full justify-center min-h-[44px]"
                      size="default"
                    />
                  ) : null}
                  {canCollectYoco ? (
                    <BookingActionButton variant="outline" onClick={() => setYocoOpen(true)}>
                      Collect with Yoco
                    </BookingActionButton>
                  ) : null}
                  <BookingActionButton
                    variant="outline"
                    disabled={busy}
                    onClick={async () => {
                      if (!order) return;
                      setBusy(true);
                      try {
                        await fetcher.post(`/api/provider/product-orders/${order.id}/mark-collected`, {
                          payment_method: "cash",
                        });
                        clearFetcherCache();
                        await load();
                        onUpdated?.();
                        toast.success("Payment recorded");
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Payment failed");
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Mark paid (cash)
                  </BookingActionButton>
                </div>
              </BookingSectionCard>
            ) : null}

            <BookingSectionCard>
              <BookingSectionLabel className="mb-2">Status</BookingSectionLabel>
              <select
                value={order.status}
                onChange={(e) => void handleStatusChange(e.target.value)}
                disabled={busy || order.status === "cancelled" || order.status === "refunded"}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm min-h-[44px]"
              >
                {PRODUCT_ORDER_STATUS_OPTIONS.filter(
                  (s) => s !== "refunded" || canRefund || order.status === "refunded",
                ).map((status) => (
                  <option key={status} value={status}>
                    {status.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
              <div className="flex flex-wrap gap-2 mt-3">
                {actions.map((a) => (
                  <BookingActionButton
                    key={a.next}
                    size="sm"
                    fullWidth={false}
                    disabled={busy}
                    onClick={() => void handleStatusChange(a.next)}
                  >
                    {a.label}
                  </BookingActionButton>
                ))}
                {canRefund ? (
                  <BookingActionButton
                    size="sm"
                    fullWidth={false}
                    variant="outline"
                    onClick={() => void handleStatusChange("refunded")}
                  >
                    Refund
                  </BookingActionButton>
                ) : null}
                <ShareReceiptButton
                  kind="provider-order"
                  subjectId={order.id}
                  label="Share receipt"
                  className="text-xs"
                />
                <a
                  href={`/api/provider/product-orders/${order.id}/receipt/pdf`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-semibold underline self-center"
                >
                  Download PDF
                </a>
              </div>
            </BookingSectionCard>
          </div>
        ) : null}
      </BookingBottomSheet>

      {refundOpen && order ? (
        <BookingBottomSheet
          open={refundOpen}
          onOpenChange={setRefundOpen}
          mode="view"
          header={<h2 className="text-lg font-semibold">Refund order</h2>}
        >
          <div className="space-y-3 pb-4">
            <label className="text-sm font-medium">Amount</label>
            <Input value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} />
            <label className="text-sm font-medium">Method</label>
            <Select value={refundMethod} onValueChange={(v) => setRefundMethod(v as typeof refundMethod)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="store_credit">Store credit</SelectItem>
              </SelectContent>
            </Select>
            <label className="text-sm font-medium">Reason</label>
            <Textarea value={refundReason} onChange={(e) => setRefundReason(e.target.value)} />
            <BookingActionButton disabled={busy} onClick={() => void handleRefund()}>
              Process refund
            </BookingActionButton>
          </div>
        </BookingBottomSheet>
      ) : null}

      {order && yocoOpen ? (
        <YocoPaymentDialog
          open={yocoOpen}
          onOpenChange={setYocoOpen}
          amount={totalAmount}
          onSuccess={handleYocoSuccess}
        />
      ) : null}

      {order && paycloudOpen ? (
        <PayCloudPaymentDialog
          open={paycloudOpen}
          onOpenChange={setPaycloudOpen}
          amount={totalAmount}
          entityType="product_order"
          entityId={order.id}
          bookingLocationId={selectedLocationId}
          onSuccess={() => {
            setPaycloudOpen(false);
            void load();
            onUpdated?.();
          }}
        />
      ) : null}

      {trackingOpen && order ? (
        <BookingBottomSheet
          open={trackingOpen}
          onOpenChange={setTrackingOpen}
          mode="view"
          header={<h2 className="text-lg font-semibold">Shipping details</h2>}
        >
          <div className="space-y-3 pb-4">
            <label className="text-sm font-medium">Tracking number</label>
            <Input value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} />
            <label className="text-sm font-medium">Carrier</label>
            <Input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="Aramex, DHL…" />
            <label className="text-sm font-medium">Tracking URL</label>
            <Input value={trackingUrl} onChange={(e) => setTrackingUrl(e.target.value)} type="url" />
            <BookingActionButton disabled={busy} onClick={() => void submitTracking()}>
              Mark shipped
            </BookingActionButton>
          </div>
        </BookingBottomSheet>
      ) : null}
    </>
  );
}
