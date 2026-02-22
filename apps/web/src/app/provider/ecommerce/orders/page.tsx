"use client";

import { useEffect, useState, useCallback } from "react";
import { fetcher } from "@/lib/http/fetcher";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  total_amount: number;
  payment_status: string;
  fulfillment_type: string;
  tracking_number: string | null;
  created_at: string;
  customer: { id: string; full_name: string; email: string };
  items: { id: string; product_name: string; quantity: number; total_price: number }[];
}

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
  const [orders, setOrders] = useState<ProductOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [updating, setUpdating] = useState<string | null>(null);
  const [error, setError] = useState("");

  const [trackingDialog, setTrackingDialog] = useState<{ orderId: string; status: string } | null>(null);
  const [trackingInput, setTrackingInput] = useState("");

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      if (statusFilter) params.set("status", statusFilter);

      const res = await fetcher.get<{
        data: { orders: ProductOrder[]; pagination: { totalPages: number } };
      }>(`/api/provider/product-orders?${params}`);

      if (res?.data) {
        setOrders(res.data.orders);
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

  const handleStatusUpdate = async (orderId: string, newStatus: string) => {
    if (newStatus === "shipped") {
      setTrackingDialog({ orderId, status: newStatus });
      setTrackingInput("");
      return;
    }
    await submitStatusUpdate(orderId, newStatus);
  };

  const submitStatusUpdate = async (orderId: string, newStatus: string, trackingNumber?: string) => {
    setUpdating(orderId);
    setError("");
    try {
      const payload: Record<string, unknown> = { status: newStatus };
      if (trackingNumber) payload.tracking_number = trackingNumber;
      await fetcher.patch(`/api/provider/product-orders/${orderId}`, payload);
      fetchOrders();
    } catch {
      setError("Failed to update order status");
    }
    setUpdating(null);
    setTrackingDialog(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Product Orders</h1>
        <p className="text-sm text-gray-500 mt-1">Manage customer product purchases and fulfillment</p>
      </div>

      {error && (
        <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          {error}
          <button onClick={() => setError("")}><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        {["", "pending", "confirmed", "processing", "shipped", "ready_for_collection", "delivered", "cancelled"].map(
          (s) => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); setPage(1); }}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                statusFilter === s
                  ? "bg-pink-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {s ? s.replace(/_/g, " ") : "All"}
            </button>
          ),
        )}
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500">Loading...</div>
        ) : orders.length === 0 ? (
          <div className="p-12 text-center">
            <ShoppingBag className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No orders found</p>
          </div>
        ) : (
          <div className="divide-y">
            {orders.map((o) => {
              const actions = STATUS_ACTIONS[o.status] ?? [];
              return (
                <div key={o.id} className="p-5 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="font-bold text-gray-900 text-lg">{o.order_number}</span>
                        <Badge variant={STATUS_BADGE[o.status] ?? "outline"}>
                          {o.status.replace(/_/g, " ")}
                        </Badge>
                        <Badge variant={o.payment_status === "paid" ? "default" : "outline"}>
                          {o.payment_status}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-700">
                        <span className="font-medium">{o.customer?.full_name}</span>{" "}
                        <span className="text-gray-400">({o.customer?.email})</span>
                      </p>
                      <div className="mt-2 space-y-1">
                        {o.items?.map((item) => (
                          <div key={item.id} className="flex items-center gap-2 text-sm text-gray-600">
                            <span className="text-gray-400">{item.quantity}x</span>
                            <span>{item.product_name}</span>
                            <span className="text-gray-400">R{Number(item.total_price).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                      {o.tracking_number && (
                        <p className="text-xs text-blue-600 mt-2">Tracking: {o.tracking_number}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xl font-bold text-gray-900">R{Number(o.total_amount).toFixed(2)}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(o.created_at).toLocaleDateString()} ·{" "}
                        {o.fulfillment_type === "delivery" ? "Delivery" : "Collection"}
                      </p>
                      {actions.length > 0 && (
                        <div className="flex gap-2 mt-3 justify-end">
                          {actions.map((a) => (
                            <button
                              key={a.next}
                              onClick={() => handleStatusUpdate(o.id, a.next)}
                              disabled={updating === o.id}
                              className={`px-3 py-1.5 text-xs font-medium text-white rounded-lg ${a.color} disabled:opacity-50`}
                            >
                              {updating === o.id ? "..." : a.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

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
            <h3 className="text-lg font-bold text-gray-900 mb-2">Enter Tracking Number</h3>
            <p className="text-sm text-gray-500 mb-4">Provide a tracking number for the shipment (optional).</p>
            <Input
              value={trackingInput}
              onChange={(e) => setTrackingInput(e.target.value)}
              placeholder="e.g. TRACK-12345"
              className="mb-4"
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setTrackingDialog(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 border rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => submitStatusUpdate(trackingDialog.orderId, trackingDialog.status, trackingInput || undefined)}
                disabled={updating === trackingDialog.orderId}
                className="px-4 py-2 text-sm font-medium text-white bg-pink-600 rounded-lg hover:bg-pink-700 disabled:opacity-50"
              >
                {updating ? "Updating..." : "Confirm & Ship"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
