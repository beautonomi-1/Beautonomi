import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_PROVIDERS_OPERATIONS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { adminTabButtonClass } from "@/lib/adminUi";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  AdminDataTable,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
} from "@/components/admin/AdminDataTable";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";

type RefundsPayload = {
  refunds: Record<string, unknown>[];
  pagination: { page: number; limit: number; total: number; total_pages: number };
  statistics: Record<string, unknown>;
};

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  success: "bg-green-100 text-green-800",
  refunded: "bg-blue-100 text-blue-800",
  partially_refunded: "bg-indigo-100 text-indigo-800",
  failed: "bg-red-100 text-red-800",
};

export function RefundsListPage() {
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_PROVIDERS_OPERATIONS,
    "Providers & operations access is required."
  );
  const qc = useQueryClient();
  const [sp, setSp] = useSearchParams();
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
  const status = sp.get("status") || "all";
  const filters = useMemo(() => ({ page, status }), [page, status]);

  const [processId, setProcessId] = useState<string | null>(null);
  const [processRow, setProcessRow] = useState<Record<string, unknown> | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refundNotes, setRefundNotes] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const q = useQuery({
    queryKey: adminQueryKeys.refunds(filters),
    queryFn: async () => {
      const p = new URLSearchParams();
      p.set("page", String(page));
      p.set("limit", "25");
      if (status !== "all") p.set("status", status);
      return adminApi.getJson<RefundsPayload>(`/api/admin/refunds?${p}`, { timeoutMs: 60_000 });
    },
    enabled: allowed,
  });

  const processRefund = useMutation({
    mutationFn: async ({ id, amount, reason, notes }: { id: string; amount: number; reason: string; notes: string }) => {
      return adminApi.postJson(`/api/admin/refunds/${id}`, {
        refund_amount: amount,
        refund_reason: reason,
        notes: notes.trim() || undefined,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminQueryKeys.refunds(filters) });
      void qc.invalidateQueries({ queryKey: adminQueryKeys.navCounts() });
      setProcessId(null);
      setProcessRow(null);
      setRefundAmount("");
      setRefundReason("");
      setRefundNotes("");
    },
  });

  const rows = q.data?.refunds ?? [];
  const pag = q.data?.pagination;
  const stats = q.data?.statistics;

  function setStatus(next: string) {
    const n = new URLSearchParams(sp);
    if (next === "all") n.delete("status");
    else n.set("status", next);
    n.set("page", "1");
    setSp(n, { replace: true });
  }

  function setPage(next: number) {
    const n = new URLSearchParams(sp);
    n.set("page", String(next));
    setSp(n, { replace: true });
  }

  function openProcessRefund(row: Record<string, unknown>) {
    const id = String(row.id ?? "");
    setProcessId(id);
    setProcessRow(row);
    setRefundAmount(String(row.amount ?? ""));
    setRefundReason("");
    setRefundNotes("");
  }

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Refunds" />
        <AdminPanel>
          <AdminPageSkeleton rows={6} />
        </AdminPanel>
      </div>
    );
  }
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;
  }

  const tabs = ["all", "success", "pending", "failed", "refunded", "partially_refunded"] as const;

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Refunds" description="View and process refund requests." />

      {/* Statistics */}
      {stats && typeof stats === "object" && Object.keys(stats).length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Object.entries(stats).map(([key, value]) => (
            <AdminPanel key={key}>
              <div className="text-center py-2">
                <p className="text-xs text-gray-500 capitalize">{key.replace(/_/g, " ")}</p>
                <p className="text-lg font-semibold text-gray-900">{String(value)}</p>
              </div>
            </AdminPanel>
          ))}
        </div>
      )}

      <AdminPanel>
        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button
              key={t}
              type="button"
              className={adminTabButtonClass(status === t)}
              onClick={() => setStatus(t)}
            >
              {t}
            </button>
          ))}
        </div>
        {pag ? (
          <p className="mt-3 text-sm text-gray-600">
            Page {pag.page} of {Math.max(1, pag.total_pages)} · {pag.total} total
          </p>
        ) : null}
      </AdminPanel>
      {rows.length === 0 ? (
        <EmptyState title="No refund rows" />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Status</AdminTh>
              <AdminTh>Amount</AdminTh>
              <AdminTh>Refund</AdminTh>
              <AdminTh>Booking</AdminTh>
              <AdminTh>Customer</AdminTh>
              <AdminTh>Date</AdminTh>
              <AdminTh>Actions</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((r) => {
              const row = r as Record<string, unknown>;
              const id = String(row.id ?? "");
              const booking = row.booking as { booking_number?: string } | null | undefined;
              const customer = row.customer as { full_name?: string; email?: string } | null | undefined;
              const statusStr = String(row.status ?? "pending");
              const badgeClass = STATUS_BADGE[statusStr] ?? "bg-gray-100 text-gray-600";
              const isPending = statusStr === "pending";
              const isExpanded = expandedId === id;

              return (
                <>
                  <tr
                    key={id}
                    className={`cursor-pointer hover:bg-gray-50 ${isExpanded ? "bg-gray-50" : ""}`}
                    onClick={() => setExpandedId(isExpanded ? null : id)}
                  >
                    <AdminTd>
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${badgeClass}`}>
                        {statusStr}
                      </span>
                    </AdminTd>
                    <AdminTd className="tabular-nums">{String(row.amount ?? "")}</AdminTd>
                    <AdminTd className="tabular-nums">{String(row.refund_amount ?? "—")}</AdminTd>
                    <AdminTd className="text-xs">{String(booking?.booking_number ?? "—")}</AdminTd>
                    <AdminTd className="text-xs">{String(customer?.full_name ?? customer?.email ?? "—")}</AdminTd>
                    <AdminTd className="text-xs text-gray-500 whitespace-nowrap">
                      {row.created_at ? new Date(String(row.created_at)).toLocaleDateString() : ""}
                    </AdminTd>
                    <AdminTd>
                      {isPending && (
                        <button
                          type="button"
                          className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700"
                          onClick={(e) => { e.stopPropagation(); openProcessRefund(row); }}
                        >
                          Process
                        </button>
                      )}
                    </AdminTd>
                  </tr>
                  {isExpanded && (
                    <tr key={`${id}-detail`}>
                      <td colSpan={7} className="bg-gray-50 px-4 py-3 border-t border-gray-100">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="text-xs text-gray-500">Transaction ID: <span className="font-mono">{id}</span></p>
                            {Boolean(row.transaction_type) ? (
                              <p className="text-xs text-gray-500">Type: {String(row.transaction_type)}</p>
                            ) : null}
                            {Boolean(row.provider_name) ? (
                              <p className="text-xs text-gray-500">Provider: {String(row.provider_name)}</p>
                            ) : null}
                            {Boolean(row.refund_reason) ? (
                              <div className="mt-2">
                                <p className="font-medium text-gray-700 text-xs">Refund reason</p>
                                <p className="text-gray-600 text-xs">{String(row.refund_reason)}</p>
                              </div>
                            ) : null}
                          </div>
                          <div>
                            {Boolean(row.notes) ? (
                              <div>
                                <p className="font-medium text-gray-700 text-xs">Notes</p>
                                <p className="text-gray-600 text-xs">{String(row.notes)}</p>
                              </div>
                            ) : null}
                            {Boolean(row.processed_at) ? (
                              <p className="text-xs text-gray-400 mt-1">
                                Processed: {new Date(String(row.processed_at)).toLocaleString()}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </AdminTableBody>
        </AdminDataTable>
      )}

      {/* Process refund dialog */}
      {processId && processRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Process Refund</h3>
            <p className="text-sm text-gray-500 mb-4">
              Original amount: <span className="font-semibold">{String(processRow.amount ?? "")}</span>
              {Boolean(processRow.booking) ? (
                <span className="ml-2">· Booking: {String((processRow.booking as any)?.booking_number ?? "")}</span>
              ) : null}
            </p>

            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">
                Refund amount *
                <input
                  type="number"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  step="0.01"
                  min="0"
                />
              </label>
              <label className="block text-sm font-medium text-gray-700">
                Reason *
                <input
                  type="text"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder="Reason for refund..."
                />
              </label>
              <label className="block text-sm font-medium text-gray-700">
                Notes (optional)
                <textarea
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-[60px]"
                  value={refundNotes}
                  onChange={(e) => setRefundNotes(e.target.value)}
                  placeholder="Additional notes..."
                />
              </label>
            </div>

            {processRefund.error && (
              <p className="mt-2 text-sm text-red-600">
                {(processRefund.error as Error).message || "Failed to process refund"}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
                onClick={() => { setProcessId(null); setProcessRow(null); }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
                disabled={processRefund.isPending || !refundAmount || !refundReason.trim()}
                onClick={() => {
                  const amount = parseFloat(refundAmount);
                  if (!amount || amount <= 0) return;
                  processRefund.mutate({
                    id: processId,
                    amount,
                    reason: refundReason.trim(),
                    notes: refundNotes,
                  });
                }}
              >
                {processRefund.isPending ? "Processing..." : "Process Refund"}
              </button>
            </div>
          </div>
        </div>
      )}

      {pag && pag.total_pages > 1 ? (
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </button>
          <button
            type="button"
            className="rounded border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
            disabled={page >= pag.total_pages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}
