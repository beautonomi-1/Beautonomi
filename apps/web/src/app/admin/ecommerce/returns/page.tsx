"use client";

import { useEffect, useState, useCallback } from "react";
import { fetcher } from "@/lib/http/fetcher";
import {
  Undo2,
  AlertTriangle,
  Clock,
  DollarSign,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";

interface ReturnRequest {
  id: string;
  product_name: string;
  reason: string;
  quantity: number;
  refund_amount: number;
  refund_processed_amount: number | null;
  status: string;
  description: string | null;
  admin_notes: string | null;
  provider_notes: string | null;
  resolution: string | null;
  created_at: string;
  order: { order_number: string; total_amount: number };
  customer: { id: string; full_name: string; email: string };
  provider: { id: string; business_name: string };
}

interface ReturnSummary {
  total: number;
  pending: number;
  escalated: number;
  total_refunded: number;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-blue-100 text-blue-800",
  item_received: "bg-purple-100 text-purple-800",
  refunded: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  escalated: "bg-red-200 text-red-900",
  resolved_by_admin: "bg-gray-100 text-gray-800",
  cancelled: "bg-gray-100 text-gray-600",
};

interface ResolveDialog {
  returnId: string;
  refundAmount: number;
  resolution: string;
}

export default function AdminProductReturnsPage() {
  const [returns, setReturns] = useState<ReturnRequest[]>([]);
  const [summary, setSummary] = useState<ReturnSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [resolving, setResolving] = useState<string | null>(null);

  const [dialog, setDialog] = useState<ResolveDialog | null>(null);
  const [adminNotes, setAdminNotes] = useState("");

  const fetchReturns = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      if (statusFilter) params.set("status", statusFilter);

      const res = await fetcher.get<{
        data: {
          returns: ReturnRequest[];
          summary: ReturnSummary;
          pagination: { totalPages: number };
        };
      }>(`/api/admin/product-returns?${params}`);

      if (res?.data) {
        setReturns(res.data.returns);
        setSummary(res.data.summary);
        setTotalPages(res.data.pagination.totalPages);
      }
    } catch {
      /* handled by empty state */
    }
    setLoading(false);
  }, [page, statusFilter]);

  useEffect(() => {
    const id = setTimeout(() => fetchReturns(), 0);
    return () => clearTimeout(id);
  }, [fetchReturns]);

  const openResolveDialog = (returnId: string, refundAmount: number, resolution: string) => {
    setDialog({ returnId, refundAmount, resolution });
    setAdminNotes("");
  };

  const submitResolve = async () => {
    if (!dialog) return;
    setResolving(dialog.returnId);
    try {
      await fetcher.patch(`/api/admin/product-returns/${dialog.returnId}`, {
        resolution: dialog.resolution,
        admin_notes: adminNotes || undefined,
      });
      fetchReturns();
    } catch {
      /* handled by UI */
    }
    setResolving(null);
    setDialog(null);
  };

  const statCards = summary
    ? [
        { label: "Total Returns", value: summary.total, icon: Undo2, color: "text-blue-600", bg: "bg-blue-50" },
        { label: "Pending Review", value: summary.pending, icon: Clock, color: "text-amber-600", bg: "bg-amber-50" },
        { label: "Escalated", value: summary.escalated, icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50" },
        { label: "Total Refunded", value: `R${summary.total_refunded.toFixed(2)}`, icon: DollarSign, color: "text-green-600", bg: "bg-green-50" },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Product Returns</h1>
        <p className="text-sm text-gray-500 mt-1">
          Oversee all return requests. Resolve escalated disputes.
        </p>
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
          <option value="approved">Approved</option>
          <option value="item_received">Item Received</option>
          <option value="refunded">Refunded</option>
          <option value="rejected">Rejected</option>
          <option value="escalated">Escalated</option>
          <option value="resolved_by_admin">Resolved by Admin</option>
        </select>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500">Loading returns...</div>
        ) : returns.length === 0 ? (
          <div className="p-12 text-center text-gray-500">No return requests found</div>
        ) : (
          <div className="divide-y">
            {returns.map((r) => (
              <div key={r.id} className="p-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-gray-900">{r.order?.order_number}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[r.status] ?? "bg-gray-100 text-gray-700"}`}>
                        {r.status.replace(/_/g, " ")}
                      </span>
                      {r.resolution && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">
                          {r.resolution.replace(/_/g, " ")}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-700 truncate">{r.product_name}</p>
                    <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                      <span>Customer: {r.customer?.full_name}</span>
                      <span>Provider: {r.provider?.business_name}</span>
                      <span>Reason: {r.reason.replace(/_/g, " ")}</span>
                      <span>Qty: {r.quantity}</span>
                    </div>
                    {r.description && (
                      <p className="text-xs text-gray-400 mt-1 italic">&quot;{r.description}&quot;</p>
                    )}
                    {r.provider_notes && (
                      <p className="text-xs text-blue-600 mt-1">Provider: {r.provider_notes}</p>
                    )}
                    {r.admin_notes && (
                      <p className="text-xs text-purple-600 mt-1">Admin: {r.admin_notes}</p>
                    )}
                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-lg font-bold text-gray-900">R{Number(r.refund_amount).toFixed(2)}</p>
                    {r.refund_processed_amount != null && r.refund_processed_amount > 0 && (
                      <p className="text-xs text-green-600">Refunded: R{Number(r.refund_processed_amount).toFixed(2)}</p>
                    )}
                    <p className="text-xs text-gray-500">
                      {new Date(r.created_at).toLocaleDateString()}
                    </p>
                    {r.status === "escalated" && (
                      <div className="flex gap-1 mt-2">
                        <button
                          onClick={() => openResolveDialog(r.id, r.refund_amount, "full_refund")}
                          disabled={resolving === r.id}
                          className="px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                        >
                          Full Refund
                        </button>
                        <button
                          onClick={() => openResolveDialog(r.id, r.refund_amount, "partial_refund")}
                          disabled={resolving === r.id}
                          className="px-3 py-1.5 text-xs font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50"
                        >
                          Partial
                        </button>
                        <button
                          onClick={() => openResolveDialog(r.id, r.refund_amount, "denied")}
                          disabled={resolving === r.id}
                          className="px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                        >
                          Deny
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
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

      {/* Resolve dialog */}
      {dialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">
                {dialog.resolution === "full_refund" && "Full Refund"}
                {dialog.resolution === "partial_refund" && "Partial Refund"}
                {dialog.resolution === "denied" && "Deny Return"}
              </h3>
              <button onClick={() => setDialog(null)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            {dialog.resolution === "full_refund" && (
              <div className="mb-4 bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
                Customer will receive a full refund of <strong>R{dialog.refundAmount.toFixed(2)}</strong>.
              </div>
            )}
            {dialog.resolution === "partial_refund" && (
              <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                Partial refund. Specify the amount and reason in notes below.
              </div>
            )}
            {dialog.resolution === "denied" && (
              <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
                The return request will be denied. Please provide a reason.
              </div>
            )}

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Admin Notes</label>
              <textarea
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                placeholder="Reason for decision..."
                rows={3}
                className="w-full border rounded-lg p-3 text-sm resize-none focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
              />
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDialog(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 border rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={submitResolve}
                disabled={!!resolving}
                className="px-4 py-2 text-sm font-medium text-white bg-pink-600 rounded-lg hover:bg-pink-700 disabled:opacity-50"
              >
                {resolving ? "Processing..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
