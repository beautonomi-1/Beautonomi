"use client";

import { useState, useEffect } from "react";
import { useTenantLocaleTag } from "@/hooks/useTenantLocaleTag";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import {
  customerCanStartProductReturnRequest,
  isWithinProductReturnWindow,
  PRODUCT_RETURN_WINDOW_DAYS,
} from "@/lib/ecommerce/product-return-eligibility";
import { fetcher, FetchError } from "@/lib/http/fetcher";

interface ProductOrder {
  id: string;
  order_number: string;
  status: string;
  fulfillment_type: string;
  currency?: string;
  subtotal: number;
  tax_amount: number;
  delivery_fee: number;
  discount_amount?: number;
  platform_fee?: number | null;
  wallet_amount?: number | null;
  total_amount: number;
  payment_status?: string | null;
  payment_method?: string | null;
  tracking_number: string | null;
  carrier?: string | null;
  tracking_url?: string | null;
  delivery_instructions?: string | null;
  estimated_delivery_date: string | null;
  created_at: string;
  confirmed_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  items: Array<{
    id: string;
    product_id?: string;
    product_variant_id?: string | null;
    product_name: string;
    product_image_url: string | null;
    quantity: number;
    unit_price: number;
    total_price: number;
    product_variant?: { id: string; option_values?: Record<string, string> } | null;
  }>;
  provider: { id: string; business_name: string; slug: string; logo_url: string | null };
  customer?: { id: string; full_name?: string | null; email?: string | null; phone?: string | null } | null;
  delivery_address?: {
    label: string | null;
    address_line1: string;
    address_line2?: string | null;
    city: string;
    state?: string | null;
    postal_code: string | null;
    country?: string | null;
  } | null;
  collection_location?: {
    name: string;
    address_line1: string;
    address_line2?: string | null;
    city: string;
    state?: string | null;
    postal_code?: string | null;
    phone: string | null;
  } | null;
  returns?: {
    id: string;
    status: string;
    reason: string;
    description?: string | null;
    refund_amount?: number | null;
    created_at: string;
    updated_at: string;
    order_item_id?: string | null;
    product_name?: string | null;
    quantity?: number | null;
    provider_notes?: string | null;
    approved_at?: string | null;
    rejected_at?: string | null;
    item_received_at?: string | null;
    refunded_at?: string | null;
    escalated_at?: string | null;
  }[] | null;
}

function absoluteTrackingUrl(raw: string | null | undefined): string {
  const t = (raw ?? "").trim();
  if (!t) return "#";
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

function formatEstimatedDeliveryDate(date: string | null | undefined, locale: string): string | null {
  if (!date || typeof date !== "string") return null;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(date.trim()) ? `${date.trim()}T12:00:00` : date.trim();
  const parsed = new Date(iso);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
}

const TIMELINE = [
  { key: "pending", label: "Order Placed" },
  { key: "confirmed", label: "Confirmed" },
  { key: "processing", label: "Processing" },
  { key: "shipped", label: "Shipped / Ready" },
  { key: "delivered", label: "Delivered / Collected" },
];

function timelineIndex(status: string) {
  if (status === "cancelled" || status === "refunded") return -1;
  if (status === "ready_for_collection") return 3;
  return TIMELINE.findIndex((s) => s.key === status);
}

export default function OrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const locale = useTenantLocaleTag();
  const { bundle } = useConfigBundle();
  const tenantCurrency = bundle?.meta?.tenant_region?.default_currency ?? LAST_RESORT_CURRENCY;
  const [order, setOrder] = useState<ProductOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!params.id) return;
    (async () => {
      setLoading(true);
      setErrorMsg(null);
      try {
        const json = await fetcher.get<{
          data: { order: ProductOrder } | null;
          error?: { message?: string; code?: string } | string;
        }>(`/api/me/orders/${params.id}`, { staleTimeMs: 0 });
        if (json.data?.order) {
          setOrder(json.data.order);
        } else {
          const err = json.error;
          const msg =
            typeof err === "string"
              ? err
              : err && typeof err === "object" && "message" in err && typeof err.message === "string"
                ? err.message
                : "Something went wrong loading this order.";
          setErrorMsg(msg);
        }
      } catch (e) {
        if (e instanceof FetchError && e.status === 404) {
          setErrorMsg("Order not found");
        } else if (e instanceof FetchError) {
          setErrorMsg(e.message || "Something went wrong loading this order.");
        } else {
          setErrorMsg("Unable to connect. Please check your network and try again.");
        }
      }
      setLoading(false);
    })();
  }, [params.id]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center text-gray-400">
        <p>{errorMsg || "Order not found"}</p>
        <button onClick={() => router.back()} className="mt-4 text-pink-600 hover:underline">Go back</button>
      </div>
    );
  }

  const idx = timelineIndex(order.status);
  const isCancelled = order.status === "cancelled" || order.status === "refunded";
  const sym = (order.currency && String(order.currency).trim()) || tenantCurrency;
  const walletAmount = Number(order.wallet_amount ?? 0);
  const platformFee = Number(order.platform_fee ?? 0);
  const onlineAmountDue = Math.max(0, Number(order.total_amount ?? 0) - walletAmount);
  const canPayOnline =
    order.payment_status === "pending" &&
    (order.payment_method === "paystack" || order.payment_method == null) &&
    onlineAmountDue > 0;

  const handlePayOnline = async () => {
    if (!canPayOnline || paying) return;
    const email = order.customer?.email?.trim();
    if (!email) {
      setErrorMsg("Add an email address to your account before paying this order online.");
      return;
    }

    setPaying(true);
    setErrorMsg(null);
    try {
      const cancelledPath = `/shop/cancelled?order_id=${encodeURIComponent(order.id)}&order_number=${encodeURIComponent(order.order_number)}`;
      const payRes = await fetcher.post<{
        data: { authorization_url: string; reference: string } | null;
      }>("/api/paystack/initialize", {
        email,
        amount: Math.round(onlineAmountDue * 100),
        metadata: {
          product_order_id: order.id,
          order_number: order.order_number,
          type: "product_order",
          cancel_action: cancelledPath,
        },
      });
      const url = payRes?.data?.authorization_url;
      if (!url) {
        setErrorMsg("We could not start payment for this order. Please try again.");
        return;
      }
      window.location.href = url;
    } catch (e) {
      if (e instanceof FetchError) {
        setErrorMsg(
          e.message ||
            (e.status === 403
              ? "We could not verify this request. Refresh the page and try again."
              : "We could not start payment for this order. Please try again."),
        );
      } else {
        setErrorMsg("Unable to start payment. Please check your network and try again.");
      }
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <button onClick={() => router.back()} className="mb-6 flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Orders
        </button>

        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{order.order_number}</h1>
            <span className="text-sm text-gray-400">
              {new Date(order.created_at).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" })}
            </span>
          </div>
          <a
            href={`/api/me/orders/${order.id}/receipt/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
            </svg>
            Download receipt
          </a>
        </div>
        {errorMsg && (
          <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMsg}
          </div>
        )}

        {/* Timeline */}
        <div className="mb-8 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 font-semibold text-gray-900">Order Status</h2>
          {isCancelled ? (
            <div className="flex items-center gap-3 rounded-xl bg-red-50 p-4">
              <svg className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="font-semibold text-red-600">{order.status === "refunded" ? "Refunded" : "Cancelled"}</p>
                {order.cancellation_reason && <p className="text-sm text-gray-500">{order.cancellation_reason}</p>}
              </div>
            </div>
          ) : (
            <div className="space-y-0">
              {TIMELINE.map((step, i) => {
                const done = i <= idx;
                const active = i === idx;
                return (
                  <div key={step.key} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className={`flex h-6 w-6 items-center justify-center rounded-full ${done ? "bg-pink-600" : "bg-gray-200"}`}>
                        {done && (
                          <svg className="h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      {i < TIMELINE.length - 1 && (
                        <div className={`h-8 w-0.5 ${done && i < idx ? "bg-pink-600" : "bg-gray-200"}`} />
                      )}
                    </div>
                    <p className={`pb-6 text-sm ${active ? "font-bold text-gray-900" : done ? "text-gray-700" : "text-gray-400"}`}>
                      {step.label}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
          {(order.tracking_number || order.tracking_url) && (
            <div className="mt-4 rounded-lg bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-600">
              {order.tracking_url ? (
                <a
                  href={absoluteTrackingUrl(order.tracking_url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 hover:underline"
                >
                  Tracking:{" "}
                  {[order.carrier, order.tracking_number].filter(Boolean).join(" · ") || "Open carrier"}
                  <span aria-hidden>↗</span>
                </a>
              ) : (
                <>
                  Tracking:{" "}
                  {[order.carrier, order.tracking_number].filter(Boolean).join(" · ")}
                </>
              )}
            </div>
          )}
        </div>

        {/* Returns */}
        {order.returns && order.returns.length > 0 && (
          <div className="mb-8 rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="mb-4 font-semibold text-gray-900">Returns & Refunds</h2>
            <div className="space-y-4">
              {order.returns.map((ret) => {
                const isApproved = ret.status === "approved";
                const isRefunded = ret.status === "refunded";
                const isRejected = ret.status === "rejected";
                const isPending = ret.status === "pending";
                const isReceived = ret.status === "item_received";
                const isEscalated = ret.status === "escalated";
                const isCancelled = ret.status === "cancelled";
                const isResolvedAdmin = ret.status === "resolved_by_admin";

                let badgeClass = "bg-gray-100 text-gray-600";
                if (isApproved || isRefunded || isReceived) badgeClass = "bg-green-100 text-green-700";
                else if (isRejected || isEscalated) badgeClass = "bg-red-100 text-red-700";
                else if (isPending) badgeClass = "bg-yellow-100 text-yellow-700";

                let title = "Return Request";
                if (isRefunded) title = "Refund Processed";
                else if (isApproved) title = "Return Approved";
                else if (isReceived) title = "Item Received";
                else if (isRejected) title = "Return Rejected";
                else if (isEscalated) title = "Return Escalated";
                else if (isCancelled) title = "Return Cancelled";
                else if (isResolvedAdmin) title = "Resolved by Beautonomi";

                return (
                  <div key={ret.id} className="border-b border-gray-50 pb-4 last:border-0 last:pb-0">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="font-semibold text-gray-700">{title}</p>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${badgeClass}`}>
                        {ret.status}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600">
                      {(ret.product_name || ret.order_item_id) && (
                        <p>
                          <span className="font-medium text-gray-700">Item:</span>{" "}
                          {ret.product_name || "Line item"}
                          {ret.quantity != null && ret.quantity > 1 ? ` × ${ret.quantity}` : ""}
                        </p>
                      )}
                      <p><span className="font-medium text-gray-700">Reason:</span> {ret.reason.replace(/_/g, " ")}</p>
                      {ret.description && (
                        <p className="mt-1"><span className="font-medium text-gray-700">Details:</span> {ret.description}</p>
                      )}
                      {ret.provider_notes && (
                        <p className="mt-1 text-gray-700">
                          <span className="font-medium">Provider:</span> {ret.provider_notes}
                        </p>
                      )}
                      {ret.refund_amount != null && (
                        <p className="mt-1"><span className="font-medium text-gray-700">Refund Amount:</span> {sym} {Number(ret.refund_amount).toFixed(2)}</p>
                      )}
                      <ul className="mt-2 space-y-0.5 text-xs text-gray-500">
                        <li>
                          Requested{" "}
                          {new Date(ret.created_at).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })}
                        </li>
                        {ret.approved_at && (
                          <li>
                            Approved{" "}
                            {new Date(ret.approved_at).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })}
                          </li>
                        )}
                        {ret.item_received_at && (
                          <li>
                            Item received{" "}
                            {new Date(ret.item_received_at).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })}
                          </li>
                        )}
                        {ret.refunded_at && (
                          <li>
                            Refunded{" "}
                            {new Date(ret.refunded_at).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })}
                          </li>
                        )}
                        {ret.rejected_at && (
                          <li>
                            Rejected{" "}
                            {new Date(ret.rejected_at).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })}
                          </li>
                        )}
                        {ret.escalated_at && (
                          <li>
                            Escalated{" "}
                            {new Date(ret.escalated_at).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })}
                          </li>
                        )}
                      </ul>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Items */}
        <div className="mb-8 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 font-semibold text-gray-900">Items</h2>
          <div className="divide-y divide-gray-50">
            {order.items?.map((item) => (
              <div key={item.id} className="flex items-center gap-4 py-3">
                <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100">
                  {item.product_image_url ? (
                    <Image src={item.product_image_url} alt="" width={56} height={56} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-gray-300">
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                      </svg>
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-900">
                    {item.product_name}
                    {item.product_variant?.option_values && Object.keys(item.product_variant.option_values).length > 0 && (
                      <span className="font-normal text-gray-500"> · {Object.entries(item.product_variant.option_values).map(([, v]) => v).join(", ")}</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-400">{item.quantity} x {sym} {Number(item.unit_price).toFixed(2)}</p>
                </div>
                <p className="font-semibold text-gray-900">{sym} {Number(item.total_price).toFixed(2)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Fulfillment: address, collection point, delivery notes */}
        {(() => {
          const isDel = order.fulfillment_type === "delivery";
          const addr = order.delivery_address;
          const coll = order.collection_location;
          const est = formatEstimatedDeliveryDate(order.estimated_delivery_date, locale);
          const instr = order.delivery_instructions?.trim();
          if (!addr && !coll && !(isDel && (est || instr))) return null;
          return (
            <div className="mb-8 rounded-2xl bg-white p-6 shadow-sm">
              <h2 className="mb-4 font-semibold text-gray-900">
                {isDel ? "Delivery details" : "Collection details"}
              </h2>
              {isDel && addr && (
                <div className="flex gap-3 text-sm text-gray-700">
                  <span className="text-gray-400" aria-hidden>
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </span>
                  <div>
                    <p className="font-semibold text-gray-900">{addr.label ?? "Delivery address"}</p>
                    <p className="mt-1 text-gray-600">
                      {addr.address_line1}
                      {addr.address_line2 ? `, ${addr.address_line2}` : ""}
                    </p>
                    <p className="mt-1 text-gray-600">
                      {[addr.city, addr.state, addr.postal_code].filter(Boolean).join(", ")}
                      {addr.country ? ` · ${addr.country}` : ""}
                    </p>
                  </div>
                </div>
              )}
              {!isDel && coll && (
                <div className="flex gap-3 text-sm text-gray-700">
                  <span className="text-gray-400" aria-hidden>
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </span>
                  <div>
                    <p className="font-semibold text-gray-900">{coll.name}</p>
                    <p className="mt-1 text-gray-600">
                      {coll.address_line1}
                      {coll.address_line2 ? `, ${coll.address_line2}` : ""}
                    </p>
                    <p className="mt-1 text-gray-600">
                      {[coll.city, coll.state, coll.postal_code].filter(Boolean).join(", ")}
                    </p>
                    {coll.phone && <p className="mt-2 text-gray-600">Tel: {coll.phone}</p>}
                  </div>
                </div>
              )}
              {isDel && (est || instr) && (
                <div className="mt-5 border-t border-gray-100 pt-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Delivery notes</p>
                  {est && <p className="mt-1 text-sm text-gray-600">Estimated delivery: {est}</p>}
                  {instr && <p className="mt-2 text-sm text-gray-700">{instr}</p>}
                </div>
              )}
            </div>
          );
        })()}

        {/* Payment summary */}
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 font-semibold text-gray-900">Payment Summary</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>{sym} {Number(order.subtotal).toFixed(2)}</span></div>
            {Number(order.discount_amount ?? 0) > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>Discount</span>
                <span>-{sym} {Number(order.discount_amount).toFixed(2)}</span>
              </div>
            )}
            {Number(order.delivery_fee) > 0 && (
              <div className="flex justify-between"><span className="text-gray-500">Delivery</span><span>{sym} {Number(order.delivery_fee).toFixed(2)}</span></div>
            )}
            {Number(order.tax_amount) > 0 && (
              <div className="flex justify-between"><span className="text-gray-500">Tax</span><span>{sym} {Number(order.tax_amount).toFixed(2)}</span></div>
            )}
            {platformFee > 0 && (
              <div className="flex justify-between"><span className="text-gray-500">Platform fee</span><span>{sym} {platformFee.toFixed(2)}</span></div>
            )}
            {walletAmount > 0 && (
              <div className="flex justify-between text-emerald-700"><span>Paid from wallet</span><span>{sym} {walletAmount.toFixed(2)}</span></div>
            )}
            {order.payment_status && (
              <div className="flex justify-between">
                <span className="text-gray-500">Payment status</span>
                <span className={order.payment_status === "paid" ? "font-semibold text-emerald-700" : order.payment_status === "failed" ? "font-semibold text-red-600" : "font-semibold text-amber-600"}>
                  {order.payment_status.replace(/_/g, " ")}
                </span>
              </div>
            )}
            <div className="flex justify-between border-t border-gray-100 pt-3 text-lg font-bold">
              <span>Total</span>
              <span className="text-pink-600">{sym} {Number(order.total_amount).toFixed(2)}</span>
            </div>
          </div>
          {canPayOnline && (
            <button
              type="button"
              onClick={handlePayOnline}
              disabled={paying}
              className="mt-5 w-full rounded-xl bg-pink-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-pink-700 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {paying ? "Starting payment..." : `Pay ${sym} ${onlineAmountDue.toFixed(2)} online`}
            </button>
          )}
        </div>

        {/* Provider */}
        {order.provider && (
          <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="mb-2 font-semibold text-gray-900">Sold by</h2>
            <Link href={`/partner-profile?slug=${order.provider.slug}`} className="inline-flex items-center gap-3 text-sm text-gray-700 hover:text-pink-600 transition-colors">
              {order.provider.logo_url ? (
                <Image src={order.provider.logo_url} alt="" width={32} height={32} className="h-8 w-8 rounded-full object-cover" />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-500">
                  {(order.provider.business_name ?? "P").charAt(0).toUpperCase()}
                </div>
              )}
              <span className="font-medium">{order.provider.business_name}</span>
            </Link>
          </div>
        )}

        {/* Request Return — same rules as customer app: window + no blocking return for a line item */}
        {(order.status === "delivered" || order.status === "ready_for_collection") &&
          customerCanStartProductReturnRequest({
            status: order.status,
            delivered_at: order.delivered_at,
            created_at: order.created_at,
            items: order.items ?? [],
            returns: order.returns,
          }) && (
          <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="mb-2 font-semibold text-gray-900">Need to return an item?</h2>
            <p className="mb-4 text-sm text-gray-500">
              You can request a return within {PRODUCT_RETURN_WINDOW_DAYS} days of delivery. Items must be unused and in original condition.
            </p>
            <Link
              href={`/account-settings/orders/${order.id}/return`}
              className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-gray-800"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
              Request Return / Refund
            </Link>
          </div>
        )}
        {(order.status === "delivered" || order.status === "ready_for_collection") &&
          !isWithinProductReturnWindow(order.delivered_at, order.created_at) && (
            <div className="mt-6 rounded-2xl border border-amber-100 bg-amber-50 p-6 text-sm text-amber-900">
              The {PRODUCT_RETURN_WINDOW_DAYS}-day return window from delivery has passed. For help, contact support from your profile.
            </div>
          )}
      </div>
    </div>
  );
}
