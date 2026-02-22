"use client";

import { useEffect, useState, useCallback } from "react";
import { fetcher } from "@/lib/http/fetcher";
import { Badge } from "@/components/ui/badge";
import {
  ShoppingBag,
  DollarSign,
  Clock,
  CheckCircle,
  XCircle,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface OrderSummary {
  total_orders: number;
  total_revenue: number;
  pending: number;
  delivered: number;
  cancelled: number;
}

interface ProductOrder {
  id: string;
  order_number: string;
  status: string;
  total_amount: number;
  subtotal: number;
  delivery_fee: number;
  platform_fee: number;
  payment_status: string;
  payment_method: string;
  fulfillment_type: string;
  tracking_number: string | null;
  order_source: string;
  created_at: string;
  customer: { id: string; full_name: string; email: string };
  provider: { id: string; business_name: string };
  items: { id: string; product_name: string; quantity: number; unit_price: number; total_price: number }[];
}

const STATUS_BADGE: Record<string, "default" | "destructive" | "outline" | "secondary"> = {
  pending: "outline",
  confirmed: "secondary",
  processing: "secondary",
  shipped: "default",
  ready_for_collection: "default",
  delivered: "default",
  cancelled: "destructive",
};

export default function AdminProductOrdersPage() {
  const [orders, setOrders] = useState<ProductOrder[]>([]);
  const [summary, setSummary] = useState<OrderSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      if (statusFilter) params.set("status", statusFilter);

      const res = await fetcher.get<{
        data: { orders: ProductOrder[]; summary: OrderSummary; pagination: { totalPages: number } };
      }>(`/api/admin/product-orders?${params}`);

      if (res?.data) {
        setOrders(res.data.orders);
        setSummary(res.data.summary);
        setTotalPages(res.data.pagination.totalPages);
      }
    } catch {
      /* handled by empty state */
    }
    setLoading(false);
  }, [page, statusFilter]);

  useEffect(() => {
    const id = setTimeout(() => fetchOrders(), 0);
    return () => clearTimeout(id);
  }, [fetchOrders]);

  const statCards = summary
    ? [
        { label: "Total Orders", value: summary.total_orders, icon: ShoppingBag, color: "text-blue-600", bg: "bg-blue-50" },
        { label: "Revenue", value: `R${summary.total_revenue.toFixed(2)}`, icon: DollarSign, color: "text-green-600", bg: "bg-green-50" },
        { label: "Pending", value: summary.pending, icon: Clock, color: "text-amber-600", bg: "bg-amber-50" },
        { label: "Delivered", value: summary.delivered, icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-50" },
        { label: "Cancelled", value: summary.cancelled, icon: XCircle, color: "text-red-600", bg: "bg-red-50" },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Product Orders</h1>
        <p className="text-sm text-gray-500 mt-1">Monitor all product orders across the platform</p>
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {statCards.map((s) => (
            <div key={s.label} className="bg-white rounded-xl border p-4">
              <div className="flex items-center gap-3">
                <div className={`${s.bg} p-2 rounded-lg`}>
                  <s.icon className={`w-5 h-5 ${s.color}`} />
                </div>
                <div>
                  <p className="text-xs text-gray-500">{s.label}</p>
                  <p className="text-lg font-bold text-gray-900">{s.value}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="border rounded-lg px-3 py-2 text-sm bg-white"
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="confirmed">Confirmed</option>
          <option value="processing">Processing</option>
          <option value="shipped">Shipped</option>
          <option value="delivered">Delivered</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500">Loading orders...</div>
        ) : orders.length === 0 ? (
          <div className="p-12 text-center text-gray-500">No product orders found</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="w-8 px-2 py-3" />
                <th className="text-left px-4 py-3 font-medium text-gray-500">Order #</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Customer</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Provider</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Items</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Total</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Date</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const isExpanded = expandedId === o.id;
                return (
                  <Fragment key={o.id}>
                    <tr
                      className="border-b hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : o.id)}
                    >
                      <td className="px-2 py-3 text-gray-400">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">{o.order_number}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{o.customer?.full_name}</div>
                        <div className="text-xs text-gray-500">{o.customer?.email}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{o.provider?.business_name}</td>
                      <td className="px-4 py-3 text-gray-700">{o.items?.length ?? 0}</td>
                      <td className="px-4 py-3 font-semibold text-gray-900">R{Number(o.total_amount).toFixed(2)}</td>
                      <td className="px-4 py-3">
                        <Badge variant={STATUS_BADGE[o.status] ?? "outline"}>{o.status.replace(/_/g, " ")}</Badge>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{new Date(o.created_at).toLocaleDateString()}</td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-gray-50">
                        <td colSpan={8} className="px-6 py-4">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 text-sm">
                            <div>
                              <span className="text-gray-500">Payment</span>
                              <p className="font-medium capitalize">{o.payment_method ?? "—"} · {o.payment_status}</p>
                            </div>
                            <div>
                              <span className="text-gray-500">Fulfillment</span>
                              <p className="font-medium capitalize">{o.fulfillment_type}</p>
                            </div>
                            <div>
                              <span className="text-gray-500">Source</span>
                              <p className="font-medium capitalize">{o.order_source ?? "online"}</p>
                            </div>
                            {o.tracking_number && (
                              <div>
                                <span className="text-gray-500">Tracking</span>
                                <p className="font-medium text-blue-600">{o.tracking_number}</p>
                              </div>
                            )}
                          </div>
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b">
                                <th className="text-left py-2 text-gray-500 font-medium">Product</th>
                                <th className="text-left py-2 text-gray-500 font-medium">Qty</th>
                                <th className="text-left py-2 text-gray-500 font-medium">Unit Price</th>
                                <th className="text-left py-2 text-gray-500 font-medium">Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {o.items?.map((item) => (
                                <tr key={item.id} className="border-b border-gray-100">
                                  <td className="py-2 text-gray-900">{item.product_name}</td>
                                  <td className="py-2 text-gray-700">{item.quantity}</td>
                                  <td className="py-2 text-gray-700">R{Number(item.unit_price).toFixed(2)}</td>
                                  <td className="py-2 font-medium text-gray-900">R{Number(item.total_price).toFixed(2)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <div className="mt-3 flex gap-6 text-sm">
                            <span className="text-gray-500">Subtotal: <span className="font-medium text-gray-900">R{Number(o.subtotal ?? 0).toFixed(2)}</span></span>
                            {Number(o.delivery_fee) > 0 && (
                              <span className="text-gray-500">Delivery: <span className="font-medium text-gray-900">R{Number(o.delivery_fee).toFixed(2)}</span></span>
                            )}
                            {Number(o.platform_fee) > 0 && (
                              <span className="text-gray-500">Platform Fee: <span className="font-medium text-pink-600">R{Number(o.platform_fee).toFixed(2)}</span></span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="p-2 border rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-gray-600">Page {page} of {totalPages}</span>
          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className="p-2 border rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function Fragment({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
