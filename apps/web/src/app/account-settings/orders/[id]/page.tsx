"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";

interface ProductOrder {
  id: string;
  order_number: string;
  status: string;
  fulfillment_type: string;
  subtotal: number;
  tax_amount: number;
  delivery_fee: number;
  total_amount: number;
  tracking_number: string | null;
  estimated_delivery_date: string | null;
  created_at: string;
  confirmed_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  items: Array<{
    id: string;
    product_name: string;
    product_image_url: string | null;
    quantity: number;
    unit_price: number;
    total_price: number;
  }>;
  provider: { id: string; business_name: string; slug: string; logo_url: string | null };
  delivery_address?: { label: string | null; address_line1: string; city: string; postal_code: string | null } | null;
  collection_location?: { name: string; address_line1: string; city: string; phone: string | null } | null;
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
  const [order, setOrder] = useState<ProductOrder | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!params.id) return;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/me/orders/${params.id}`, { cache: "no-store" });
        const json = await res.json();
        if (json.data) setOrder(json.data.order);
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, [params.id]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-pink-200 border-t-pink-600" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center text-gray-400">
        <p>Order not found</p>
        <button onClick={() => router.back()} className="mt-4 text-pink-600 hover:underline">Go back</button>
      </div>
    );
  }

  const idx = timelineIndex(order.status);
  const isCancelled = order.status === "cancelled" || order.status === "refunded";

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
          <h1 className="text-2xl font-bold text-gray-900">{order.order_number}</h1>
          <span className="text-sm text-gray-400">
            {new Date(order.created_at).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })}
          </span>
        </div>

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
          {order.tracking_number && (
            <div className="mt-4 rounded-lg bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-600">
              Tracking: {order.tracking_number}
            </div>
          )}
        </div>

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
                  <p className="font-semibold text-gray-900">{item.product_name}</p>
                  <p className="text-xs text-gray-400">{item.quantity} x R{Number(item.unit_price).toFixed(2)}</p>
                </div>
                <p className="font-semibold text-gray-900">R{Number(item.total_price).toFixed(2)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Payment summary */}
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 font-semibold text-gray-900">Payment Summary</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>R{Number(order.subtotal).toFixed(2)}</span></div>
            {Number(order.delivery_fee) > 0 && (
              <div className="flex justify-between"><span className="text-gray-500">Delivery</span><span>R{Number(order.delivery_fee).toFixed(2)}</span></div>
            )}
            {Number(order.tax_amount) > 0 && (
              <div className="flex justify-between"><span className="text-gray-500">Tax</span><span>R{Number(order.tax_amount).toFixed(2)}</span></div>
            )}
            <div className="flex justify-between border-t border-gray-100 pt-3 text-lg font-bold">
              <span>Total</span>
              <span className="text-pink-600">R{Number(order.total_amount).toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Request Return */}
        {(order.status === "delivered" || order.status === "ready_for_collection") && (
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="mb-2 font-semibold text-gray-900">Need to return an item?</h2>
            <p className="mb-4 text-sm text-gray-500">
              You can request a return within 14 days of delivery. Items must be unused and in original condition.
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
      </div>
    </div>
  );
}
