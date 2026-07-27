import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_ECOMMERCE } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
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
import { adminToast } from "@/lib/adminToast";

type ReturnRow = Record<string, unknown> & {
  id?: string;
  status?: string;
  reason?: string;
  refund_amount?: number;
  currency?: string;
  created_at?: string;
  customer?: { full_name?: string; email?: string } | null;
  order?: { order_number?: string; id?: string } | null;
};

type ReturnsPayload = {
  returns: ReturnRow[];
  summary?: Record<string, number>;
  pagination?: { page: number; limit: number; total: number; totalPages: number };
};

const RESOLUTIONS = [
  { value: "full_refund", label: "Full refund" },
  { value: "partial_refund", label: "Partial refund" },
  { value: "replacement", label: "Replacement" },
  { value: "store_credit", label: "Store credit" },
  { value: "denied", label: "Deny" },
] as const;

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  escalated: "bg-red-100 text-red-800",
  refunded: "bg-green-100 text-green-800",
  resolved_by_admin: "bg-blue-100 text-blue-800",
  denied: "bg-gray-100 text-gray-600",
};

export function ProductReturnsPage() {
  const qc = useQueryClient();
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_ECOMMERCE, "E-commerce access is required.");
  const [sp, setSp] = useSearchParams();
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
  const status = sp.get("status") || "";
  const qk = useMemo(() => `${page}|${status}`, [page, status]);

  const [resolveId, setResolveId] = useState<string | null>(null);
  const [resolution, setResolution] = useState("full_refund");
  const [refundAmount, setRefundAmount] = useState("");
  const [adminNotes, setAdminNotes] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const q = useQuery({
    queryKey: adminQueryKeys.productReturns(qk),
    queryFn: async () => {
      const p = new URLSearchParams();
      p.set("page", String(page));
      p.set("limit", "20");
      if (status) p.set("status", status);
      return adminApi.getJson<ReturnsPayload>(`/api/admin/product-returns?${p}`, { timeoutMs: 60_000 });
    },
    enabled: allowed,
  });

  const resolveReturn = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      adminApi.patchJson(`/api/admin/product-returns/${id}`, data),
    onSuccess: (_result, vars) => {
      setResolveId(null);
      void qc.invalidateQueries({ queryKey: adminQueryKeys.productReturns(qk) });
      void qc.invalidateQueries({ queryKey: adminQueryKeys.navCounts() });
      const status = String(vars.data.status ?? "");
      adminToast.success(
        status === "approved" ? "Return approved" :
        status === "rejected" ? "Return rejected" :
        status === "refunded" ? "Return refunded" :
        "Return resolved"
      );
    },
    onError: (e: Error) => adminToast.error(`Failed to resolve return: ${e.message}`),
  });

  const rows = q.data?.returns ?? [];
  const pag = q.data?.pagination;

  function patchParams(u: Record<string, string | null>) {
    const n = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(u)) {
      if (v == null || v === "") n.delete(k);
      else n.set(k, v);
    }
    setSp(n, { replace: true });
  }

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Product returns" />
        <AdminPanel>
          <AdminPageSkeleton rows={5} />
        </AdminPanel>
      </div>
    );
  }
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Product returns" description="Manage product return requests" />
      <AdminPanel>
        <label className="text-sm text-gray-600">
          Status{" "}
          <select
            className="ml-2 rounded border border-gray-300 px-2 py-1 text-sm"
            value={status}
            onChange={(e) => patchParams({ status: e.target.value || null, page: "1" })}
          >
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="escalated">Escalated</option>
            <option value="refunded">Refunded</option>
            <option value="resolved_by_admin">Resolved</option>
            <option value="denied">Denied</option>
          </select>
        </label>
      </AdminPanel>
      {rows.length === 0 ? (
        <EmptyState title="No returns" />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Order</AdminTh>
              <AdminTh>Customer</AdminTh>
              <AdminTh>Reason</AdminTh>
              <AdminTh>Amount</AdminTh>
              <AdminTh>Status</AdminTh>
              <AdminTh>Created</AdminTh>
              <AdminTh>Actions</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((r) => {
              const id = String(r.id ?? "");
              const isPending = r.status === "pending" || r.status === "escalated";
              const isExpanded = expandedId === id;
              return (
                <>
                  <tr
                    key={id}
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() => setExpandedId(isExpanded ? null : id)}
                  >
                    <AdminTd className="font-mono text-xs">{String(r.order?.order_number ?? "—")}</AdminTd>
                    <AdminTd>
                      <div>{String(r.customer?.full_name ?? "—")}</div>
                      {r.customer?.email && <div className="text-xs text-gray-500">{r.customer.email}</div>}
                    </AdminTd>
                    <AdminTd className="max-w-[200px] truncate text-xs">{String(r.reason ?? "—")}</AdminTd>
                    <AdminTd className="tabular-nums">
                      {r.refund_amount != null ? `${r.currency ?? ""} ${Number(r.refund_amount).toFixed(2)}` : "—"}
                    </AdminTd>
                    <AdminTd>
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[r.status ?? ""] ?? "bg-gray-100 text-gray-600"}`}>
                        {r.status ?? "—"}
                      </span>
                    </AdminTd>
                    <AdminTd className="text-xs text-gray-500">
                      {r.created_at ? new Date(String(r.created_at)).toLocaleDateString() : "—"}
                    </AdminTd>
                    <AdminTd>
                      {isPending && (
                        <button
                          type="button"
                          className="rounded bg-indigo-600 px-2 py-1 text-xs text-white hover:bg-indigo-700"
                          onClick={(e) => {
                            e.stopPropagation();
                            setResolveId(id);
                            setResolution("full_refund");
                            setRefundAmount(r.refund_amount != null ? String(r.refund_amount) : "");
                            setAdminNotes("");
                          }}
                        >
                          Resolve
                        </button>
                      )}
                    </AdminTd>
                  </tr>
                  {isExpanded && (
                    <tr key={`${id}-exp`}>
                      <td colSpan={7} className="bg-gray-50 px-4 py-3 border-t border-gray-100 text-xs">
                        <div className="grid gap-2 sm:grid-cols-2 p-2">
                          <div><strong>Reason:</strong> {String(r.reason ?? "—")}</div>
                          <div><strong>Resolution:</strong> {String((r as any).resolution ?? "—")}</div>
                          <div><strong>Admin notes:</strong> {String((r as any).admin_notes ?? "—")}</div>
                          <div><strong>Refunded:</strong> {(r as any).refunded_at ? new Date(String((r as any).refunded_at)).toLocaleString() : "—"}</div>
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
      {pag && pag.totalPages > 1 ? (
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
            disabled={page <= 1}
            onClick={() => patchParams({ page: String(page - 1) })}
          >
            Previous
          </button>
          <button
            type="button"
            className="rounded border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
            disabled={page >= pag.totalPages}
            onClick={() => patchParams({ page: String(page + 1) })}
          >
            Next
          </button>
        </div>
      ) : null}

      {resolveId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Resolve return</h3>
            <div className="space-y-3">
              <label className="block text-sm">
                Resolution
                <select
                  className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                >
                  {RESOLUTIONS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </label>
              {(resolution === "partial_refund" || resolution === "full_refund" || resolution === "store_credit") && (
                <label className="block text-sm">
                  Refund amount
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(e.target.value)}
                  />
                </label>
              )}
              <label className="block text-sm">
                Admin notes (optional)
                <textarea
                  className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                  rows={3}
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                />
              </label>
            </div>
            {resolveReturn.isError && (
              <p className="mt-2 text-sm text-red-600">{(resolveReturn.error as Error)?.message || "Failed"}</p>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="rounded border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
                onClick={() => setResolveId(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700 disabled:opacity-50"
                disabled={resolveReturn.isPending}
                onClick={() => {
                  resolveReturn.mutate({
                    id: resolveId,
                    data: {
                      resolution,
                      ...(refundAmount ? { refund_processed_amount: parseFloat(refundAmount) } : {}),
                      ...(adminNotes.trim() ? { admin_notes: adminNotes.trim() } : {}),
                    },
                  });
                }}
              >
                {resolveReturn.isPending ? "Processing…" : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
