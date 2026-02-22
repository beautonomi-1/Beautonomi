"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";

interface OrderItem {
  id: string;
  product_name: string;
  product_image_url: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
}

interface ProductOrder {
  id: string;
  order_number: string;
  status: string;
  fulfillment_type: string;
  total_amount: number;
  created_at: string;
  tracking_number: string | null;
  items: OrderItem[];
  provider: { id: string; business_name: string; slug: string };
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-50 text-yellow-700",
  confirmed: "bg-blue-50 text-blue-700",
  processing: "bg-purple-50 text-purple-700",
  ready_for_collection: "bg-green-50 text-green-700",
  shipped: "bg-blue-50 text-blue-700",
  delivered: "bg-green-50 text-green-700",
  cancelled: "bg-red-50 text-red-700",
  refunded: "bg-gray-50 text-gray-700",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  processing: "Processing",
  ready_for_collection: "Ready for Collection",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

export default function OrderHistoryPage() {
  const [orders, setOrders] = useState<ProductOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter) params.set("status", filter);
      const res = await fetch(`/api/me/orders?${params}`, {
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
      });
      const json = await res.json();
      if (json.data) {
        setOrders(json.data.orders);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    const id = setTimeout(() => fetchOrders(), 0);
    return () => clearTimeout(id);
  }, [fetchOrders]);

  const TABS = [
    { key: "", label: "All" },
    { key: "pending", label: "Pending" },
    { key: "confirmed", label: "Active" },
    { key: "delivered", label: "Completed" },
    { key: "cancelled", label: "Cancelled" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <h1 className="mb-6 text-2xl font-bold text-gray-900">My Product Orders</h1>

        <div className="mb-6 flex gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                filter === t.key ? "bg-pink-600 text-white" : "bg-white text-gray-600 hover:bg-gray-100"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-pink-200 border-t-pink-600" />
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-gray-400">
            <svg className="mb-4 h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-lg font-medium">No orders yet</p>
            <Link href="/shop" className="mt-4 rounded-xl bg-pink-600 px-6 py-3 text-sm font-semibold text-white hover:bg-pink-700">
              Shop Now
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => {
              const itemCount = order.items?.reduce((s, i) => s + i.quantity, 0) ?? 0;
              const firstImage = order.items?.[0]?.product_image_url;
              const date = new Date(order.created_at).toLocaleDateString("en-ZA", {
                day: "numeric",
                month: "short",
                year: "numeric",
              });

              return (
                <Link
                  key={order.id}
                  href={`/account-settings/orders/${order.id}`}
                  className="block overflow-hidden rounded-2xl bg-white p-5 shadow-sm transition hover:shadow-md"
                >
                  <div className="flex items-start gap-4">
                    <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl bg-gray-100">
                      {firstImage ? (
                        <Image src={firstImage} alt="" width={64} height={64} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-gray-300">
                          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                          </svg>
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-gray-900">{order.order_number}</span>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_COLORS[order.status] ?? "bg-gray-50 text-gray-600"}`}>
                          {STATUS_LABELS[order.status] ?? order.status}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-gray-500">{order.provider?.business_name}</p>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-xs text-gray-400">
                          {itemCount} item{itemCount !== 1 ? "s" : ""} · {date}
                        </span>
                        <span className="text-lg font-bold text-pink-600">
                          R{Number(order.total_amount).toFixed(2)}
                        </span>
                      </div>
                      {order.tracking_number && (
                        <p className="mt-2 text-xs text-blue-600">
                          Tracking: {order.tracking_number}
                        </p>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
