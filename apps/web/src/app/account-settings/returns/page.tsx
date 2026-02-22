"use client";

import { useEffect, useState, useCallback } from "react";
import { fetcher } from "@/lib/http/fetcher";
import Link from "next/link";
import { Undo2, ChevronRight, AlertTriangle } from "lucide-react";

interface ReturnRequest {
  id: string;
  product_name: string;
  reason: string;
  quantity: number;
  refund_amount: number;
  status: string;
  created_at: string;
  order: { order_number: string; provider: { business_name: string } };
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-blue-100 text-blue-800",
  item_received: "bg-purple-100 text-purple-800",
  refunded: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  escalated: "bg-red-200 text-red-900",
  resolved_by_admin: "bg-gray-100 text-gray-700",
  cancelled: "bg-gray-100 text-gray-600",
};

export default function MyReturnsPage() {
  const [returns, setReturns] = useState<ReturnRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchReturns = useCallback(async () => {
    setLoading(true);
    const res = await fetcher.get<{ data: { returns: ReturnRequest[] } }>("/api/me/returns", { cache: "no-store" });
    if (res?.data?.returns) setReturns(res.data.returns);
    setLoading(false);
  }, []);

  useEffect(() => {
    const id = setTimeout(() => fetchReturns(), 0);
    return () => clearTimeout(id);
  }, [fetchReturns]);

  const handleEscalate = async (id: string) => {
    await fetcher.patch(`/api/me/returns/${id}`, { action: "escalate" });
    fetchReturns();
  };

  const handleCancel = async (id: string) => {
    await fetcher.patch(`/api/me/returns/${id}`, { action: "cancel" });
    fetchReturns();
  };

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Returns</h1>
          <p className="text-sm text-gray-500 mt-1">Track your return requests and refunds</p>
        </div>
        <Link
          href="/account-settings/orders"
          className="text-sm text-pink-600 hover:underline flex items-center gap-1"
        >
          View Orders <ChevronRight className="w-4 h-4" />
        </Link>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading returns...</div>
      ) : returns.length === 0 ? (
        <div className="text-center py-16">
          <Undo2 className="w-16 h-16 text-gray-200 mx-auto mb-4" />
          <p className="text-gray-500 mb-2">No return requests yet</p>
          <p className="text-sm text-gray-400">
            You can request a return from your order details within 14 days of delivery.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {returns.map((r) => (
            <div key={r.id} className="bg-white rounded-xl border p-5 hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-gray-900">{r.order?.order_number}</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[r.status] ?? "bg-gray-100 text-gray-700"}`}
                    >
                      {r.status.replace(/_/g, " ")}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700">{r.product_name}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {r.order?.provider?.business_name} · {r.reason.replace(/_/g, " ")} · Qty: {r.quantity}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-gray-900">R{Number(r.refund_amount).toFixed(2)}</p>
                  <p className="text-xs text-gray-400">{new Date(r.created_at).toLocaleDateString()}</p>
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                {r.status === "pending" && (
                  <button
                    onClick={() => handleCancel(r.id)}
                    className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
                  >
                    Cancel Request
                  </button>
                )}
                {r.status === "rejected" && (
                  <button
                    onClick={() => handleEscalate(r.id)}
                    className="px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 flex items-center gap-1"
                  >
                    <AlertTriangle className="w-3 h-3" />
                    Escalate to Support
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
