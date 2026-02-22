"use client";

import { useEffect, useState, useCallback } from "react";
import { fetcher } from "@/lib/http/fetcher";
import { Undo2, ChevronLeft, ChevronRight, X } from "lucide-react";

interface ReturnRequest {
  id: string;
  product_name: string;
  reason: string;
  description: string | null;
  quantity: number;
  refund_amount: number;
  status: string;
  provider_notes: string | null;
  created_at: string;
  order: { order_number: string };
  customer: { full_name: string; email: string };
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

const ACTIONS: Record<string, { action: string; label: string; color: string }[]> = {
  pending: [
    { action: "approve", label: "Approve", color: "bg-blue-600 hover:bg-blue-700" },
    { action: "reject", label: "Reject", color: "bg-red-600 hover:bg-red-700" },
  ],
  approved: [
    { action: "mark_received", label: "Item Received", color: "bg-purple-600 hover:bg-purple-700" },
  ],
  item_received: [
    { action: "process_refund", label: "Process Refund", color: "bg-green-600 hover:bg-green-700" },
  ],
};

interface ActionDialog {
  returnId: string;
  action: string;
  label: string;
}

export default function ProviderReturnsPage() {
  const [returns, setReturns] = useState<ReturnRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [updating, setUpdating] = useState<string | null>(null);
  const [error, setError] = useState("");

  const [dialog, setDialog] = useState<ActionDialog | null>(null);
  const [dialogNotes, setDialogNotes] = useState("");
  const [dialogReturnMethod, setDialogReturnMethod] = useState("drop_off");

  const fetchReturns = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      if (statusFilter) params.set("status", statusFilter);

      const res = await fetcher.get<{
        data: { returns: ReturnRequest[]; pagination: { totalPages: number } };
      }>(`/api/provider/returns?${params}`);

      if (res?.data) {
        setReturns(res.data.returns);
        setTotalPages(res.data.pagination.totalPages);
      }
    } catch {
      setError("Failed to load returns");
    }
    setLoading(false);
  }, [page, statusFilter]);

  useEffect(() => {
    const id = setTimeout(() => fetchReturns(), 0);
    return () => clearTimeout(id);
  }, [fetchReturns]);

  const openActionDialog = (returnId: string, action: string, label: string) => {
    setDialog({ returnId, action, label });
    setDialogNotes("");
    setDialogReturnMethod("drop_off");
  };

  const submitAction = async () => {
    if (!dialog) return;
    setUpdating(dialog.returnId);
    setError("");
    try {
      const payload: Record<string, unknown> = { action: dialog.action };
      if (dialogNotes) payload.provider_notes = dialogNotes;
      if (dialog.action === "approve") {
        payload.return_method = dialogReturnMethod;
        payload.resolution = "full_refund";
      }

      await fetcher.patch(`/api/provider/returns/${dialog.returnId}`, payload);
      fetchReturns();
    } catch {
      setError("Failed to update return");
    }
    setUpdating(null);
    setDialog(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Returns & Refunds</h1>
        <p className="text-sm text-gray-500 mt-1">Manage customer return requests and process refunds</p>
      </div>

      {error && (
        <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          {error}
          <button onClick={() => setError("")}><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        {["", "pending", "approved", "item_received", "refunded", "rejected", "escalated"].map(
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
        ) : returns.length === 0 ? (
          <div className="p-12 text-center">
            <Undo2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No return requests</p>
          </div>
        ) : (
          <div className="divide-y">
            {returns.map((r) => {
              const actions = ACTIONS[r.status] ?? [];
              return (
                <div key={r.id} className="p-5 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-gray-900">{r.order?.order_number}</span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[r.status]}`}
                        >
                          {r.status.replace(/_/g, " ")}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700">{r.product_name}</p>
                      <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                        <span>{r.customer?.full_name}</span>
                        <span>Reason: {r.reason.replace(/_/g, " ")}</span>
                        <span>Qty: {r.quantity}</span>
                      </div>
                      {r.description && (
                        <p className="text-xs text-gray-400 mt-2 italic">&quot;{r.description}&quot;</p>
                      )}
                      {r.provider_notes && (
                        <p className="text-xs text-blue-600 mt-1">Notes: {r.provider_notes}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-bold text-gray-900">R{Number(r.refund_amount).toFixed(2)}</p>
                      <p className="text-xs text-gray-500">
                        {new Date(r.created_at).toLocaleDateString()}
                      </p>
                      {actions.length > 0 && (
                        <div className="flex gap-2 mt-2 justify-end">
                          {actions.map((a) => (
                            <button
                              key={a.action}
                              onClick={() => openActionDialog(r.id, a.action, a.label)}
                              disabled={updating === r.id}
                              className={`px-3 py-1.5 text-xs font-medium text-white rounded-lg ${a.color} disabled:opacity-50`}
                            >
                              {updating === r.id ? "..." : a.label}
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

      {/* Action dialog */}
      {dialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-lg font-bold text-gray-900 mb-4">{dialog.label}</h3>

            {dialog.action === "approve" && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Return Method</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: "drop_off", label: "Drop Off" },
                    { value: "courier", label: "Courier" },
                    { value: "not_required", label: "Not Required" },
                  ].map((m) => (
                    <button
                      key={m.value}
                      onClick={() => setDialogReturnMethod(m.value)}
                      className={`px-3 py-2 text-xs font-medium rounded-lg border-2 transition-colors ${
                        dialogReturnMethod === m.value
                          ? "border-pink-500 bg-pink-50 text-pink-700"
                          : "border-gray-200 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
              <textarea
                value={dialogNotes}
                onChange={(e) => setDialogNotes(e.target.value)}
                placeholder="Add any notes for the customer..."
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
                onClick={submitAction}
                disabled={!!updating}
                className="px-4 py-2 text-sm font-medium text-white bg-pink-600 rounded-lg hover:bg-pink-700 disabled:opacity-50"
              >
                {updating ? "Processing..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
