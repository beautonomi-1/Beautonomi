import { Fragment, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_FINANCE } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { adminTabButtonClass } from "@/lib/adminUi";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { adminToast } from "@/lib/adminToast";
import { formatAdminCurrency } from "@/lib/adminFormatCurrency";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
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
import { AdminModal } from "@/components/admin/AdminModal";
import { AdminMutationAlert } from "@/components/admin/AdminMutationAlert";

type RefundStatistics = {
  total_transactions?: number;
  /** @deprecated use total_transactions */
  total?: number;
  actionable_refundable?: number;
  total_refunded_amount?: number;
  /** @deprecated */
  total_refunded?: number;
  rows_with_refund_recorded?: number;
  by_status?: Record<string, number>;
  average_refund_among_recorded?: string;
  /** @deprecated */
  average_refund?: string;
};

type RefundsPayload = {
  refunds: Record<string, unknown>[];
  pagination: { page: number; limit: number; total: number; total_pages: number };
  statistics?: RefundStatistics;
};

function unwrapBookingCustomer(
  booking: unknown
): { full_name?: string | null; email?: string | null } | null {
  if (!booking || typeof booking !== "object") return null;
  const b = booking as { customer?: unknown };
  const c = b.customer;
  if (!c) return null;
  if (Array.isArray(c)) return (c[0] as { full_name?: string; email?: string }) ?? null;
  return c as { full_name?: string; email?: string };
}

function parseAmount(val: unknown): number {
  const n = parseFloat(String(val ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  success: "bg-green-100 text-green-800",
  refunded: "bg-blue-100 text-blue-800",
  partially_refunded: "bg-indigo-100 text-indigo-800",
  failed: "bg-red-100 text-red-800",
};

export function RefundsListPage() {
  useAdminDocumentTitle("Refunds");
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_FINANCE,
    "Finance access is required to manage refunds."
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
      return adminApi.getJson<RefundsPayload>(`/api/admin/refunds?${p}`, {
        timeoutMs: 60_000,
      });
    },
    enabled: allowed,
  });

  const processRefund = useMutation({
    mutationFn: async ({
      id,
      amount,
      reason,
      notes,
    }: {
      id: string;
      amount: number;
      reason: string;
      notes: string;
    }) => {
      return adminApi.postJson<{
        provider_balance_warning?: string | null;
      }>(`/api/admin/refunds/${id}`, {
        refund_amount: amount,
        refund_reason: reason,
        notes: notes.trim() || undefined,
      });
    },
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: adminQueryKeys.refunds(filters) });
      void qc.invalidateQueries({ queryKey: adminQueryKeys.navCounts() });
      void qc.invalidateQueries({ queryKey: adminQueryKeys.activity() });
      setProcessId(null);
      setProcessRow(null);
      setRefundAmount("");
      setRefundReason("");
      setRefundNotes("");
      adminToast.success("Refund processed successfully");
      if (data && "provider_balance_warning" in data && data.provider_balance_warning) {
        adminToast.warning(data.provider_balance_warning);
      }
    },
    onError: (e: Error) => adminToast.error(`Refund failed: ${e.message}`),
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

  const tabs = [
    "all",
    "success",
    "pending",
    "failed",
    "refunded",
    "partially_refunded",
  ] as const;

  const byStatus = stats?.by_status ?? {};
  const totalListed = stats?.total_transactions ?? stats?.total ?? 0;
  const actionableRefundable = stats?.actionable_refundable ?? byStatus.success ?? 0;
  const totalRefundedAmt = stats?.total_refunded_amount ?? stats?.total_refunded ?? 0;
  const rowsWithRefund = stats?.rows_with_refund_recorded ?? 0;
  const avgRecorded =
    stats?.average_refund_among_recorded ?? stats?.average_refund ?? "0.00";

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Refunds"
        description={
          <span className="block max-w-3xl text-sm font-normal leading-relaxed text-gray-600">
            <strong>Data source:</strong> rows from{" "}
            <code className="rounded bg-gray-100 px-1">payment_transactions</code> for
            this tenant. Rows with status{" "}
            <code className="rounded bg-gray-100 px-1">success</code> are successful
            card/wallet captures — use <strong>Refund issued</strong> column and{" "}
            <code className="rounded bg-gray-100 px-1">rows_with_refund_recorded</code>{" "}
            for money credited back.{" "}
            <strong>Processing</strong> a refund credits the customer&apos;s wallet
            (store credit for future bookings).
          </span>
        }
      />

      {/* Statistics */}
      {stats && typeof stats === "object" && Object.keys(stats).length > 0 && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <AdminPanel className="!p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Refundable payments
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">
                {actionableRefundable}
              </p>
              <p className="mt-1 text-[11px] text-gray-500">
                Successful captures that can still be refunded
              </p>
            </AdminPanel>
            <AdminPanel className="!p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Rows matching filter
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">
                {totalListed}
              </p>
            </AdminPanel>
            <AdminPanel className="!p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Total refunded (wallet)
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">
                {formatAdminCurrency(parseAmount(totalRefundedAmt))}
              </p>
              <p className="mt-1 text-[11px] text-gray-500">
                Sum of refund_amount where recorded
              </p>
            </AdminPanel>
            <AdminPanel className="!p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Rows with refund recorded
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">
                {rowsWithRefund}
              </p>
            </AdminPanel>
            <AdminPanel className="!p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Avg refund (recorded rows)
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">
                {formatAdminCurrency(parseAmount(avgRecorded))}
              </p>
            </AdminPanel>
          </div>
          {Object.keys(byStatus).length > 0 && (
            <AdminPanel className="!p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                By payment/refund status
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {Object.entries(byStatus).map(([k, n]) => (
                  <span
                    key={k}
                    className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs"
                  >
                    <span className="font-mono text-gray-600">{k}</span>
                    <span className="font-semibold tabular-nums text-gray-900">{n}</span>
                  </span>
                ))}
              </div>
            </AdminPanel>
          )}
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
              <AdminTh>Type</AdminTh>
              <AdminTh>Status</AdminTh>
              <AdminTh>Payment amount</AdminTh>
              <AdminTh>Refund issued</AdminTh>
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
              const booking = row.booking as
                | { booking_number?: string }
                | null
                | undefined;
              const customer = unwrapBookingCustomer(row.booking);
              const statusStr = String(row.status ?? "pending");
              const badgeClass =
                STATUS_BADGE[statusStr] ?? "bg-gray-100 text-gray-600";
              const isRefundable = statusStr === "success";
              const isExpanded = expandedId === id;

              return (
                <Fragment key={id}>
                  <tr
                    className={`cursor-pointer hover:bg-gray-50 ${isExpanded ? "bg-gray-50" : ""}`}
                    onClick={() => setExpandedId(isExpanded ? null : id)}
                  >
                    <AdminTd className="font-mono text-xs text-gray-700">
                      {String(row.transaction_type ?? "—")}
                    </AdminTd>
                    <AdminTd>
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${badgeClass}`}
                      >
                        {statusStr}
                      </span>
                    </AdminTd>
                    <AdminTd className="tabular-nums">
                      {formatAdminCurrency(parseAmount(row.amount))}
                    </AdminTd>
                    <AdminTd className="tabular-nums">
                      {row.refund_amount != null &&
                      String(row.refund_amount) !== "" &&
                      parseAmount(row.refund_amount) > 0
                        ? formatAdminCurrency(parseAmount(row.refund_amount))
                        : "—"}
                    </AdminTd>
                    <AdminTd className="text-xs">
                      {String(booking?.booking_number ?? "—")}
                    </AdminTd>
                    <AdminTd className="text-xs">
                      {customer?.full_name || customer?.email || "—"}
                    </AdminTd>
                    <AdminTd className="whitespace-nowrap text-xs text-gray-500">
                      {row.created_at
                        ? new Date(String(row.created_at)).toLocaleDateString()
                        : ""}
                    </AdminTd>
                    <AdminTd>
                      {isRefundable && (
                        <button
                          type="button"
                          className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700"
                          onClick={(e) => {
                            e.stopPropagation();
                            openProcessRefund(row);
                          }}
                        >
                          Process
                        </button>
                      )}
                    </AdminTd>
                  </tr>

                  {isExpanded && (
                    <tr key={`${id}-detail`}>
                      <td
                        colSpan={8}
                        className="border-t border-gray-100 bg-gray-50 px-4 py-3"
                      >
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="text-xs text-gray-500">
                              Transaction ID:{" "}
                              <span className="font-mono">{id}</span>
                            </p>
                            {Boolean(row.transaction_type) && (
                              <p className="text-xs text-gray-500">
                                Type: {String(row.transaction_type)}
                              </p>
                            )}
                            {Boolean(row.provider_name) && (
                              <p className="text-xs text-gray-500">
                                Provider: {String(row.provider_name)}
                              </p>
                            )}
                            {Boolean(row.refund_reason) && (
                              <div className="mt-2">
                                <p className="text-xs font-medium text-gray-700">
                                  Refund reason
                                </p>
                                <p className="text-xs text-gray-600">
                                  {String(row.refund_reason)}
                                </p>
                              </div>
                            )}
                          </div>
                          <div>
                            {Boolean(row.notes) && (
                              <div>
                                <p className="text-xs font-medium text-gray-700">
                                  Notes
                                </p>
                                <p className="text-xs text-gray-600">
                                  {String(row.notes)}
                                </p>
                              </div>
                            )}
                            {Boolean(row.processed_at) && (
                              <p className="mt-1 text-xs text-gray-400">
                                Processed:{" "}
                                {new Date(String(row.processed_at)).toLocaleString()}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </AdminTableBody>
        </AdminDataTable>
      )}

      {/* Process refund — uses AdminModal for a11y */}
      <AdminModal
        open={Boolean(processId && processRow)}
        onClose={() => {
          setProcessId(null);
          setProcessRow(null);
        }}
        title="Process refund"
        description={
          processRow
            ? `Original amount: ${formatAdminCurrency(parseAmount(processRow.amount))}${
                processRow.booking
                  ? ` · Booking ${String((processRow.booking as Record<string, unknown>)?.booking_number ?? "")}`
                  : ""
              }`
            : undefined
        }
        footer={
          <>
            <button
              type="button"
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
              onClick={() => {
                setProcessId(null);
                setProcessRow(null);
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
              disabled={
                processRefund.isPending || !refundAmount || !refundReason.trim()
              }
              onClick={() => {
                if (!processId) return;
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
              {processRefund.isPending ? "Processing…" : "Process refund"}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700">
            Refund amount (ZAR) *
            <input
              type="number"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={refundAmount}
              onChange={(e) => setRefundAmount(e.target.value)}
              step="0.01"
              min="0.01"
            />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Reason *
            <input
              type="text"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              placeholder="Reason for refund…"
            />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Notes (optional)
            <textarea
              className="mt-1 min-h-[60px] w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={refundNotes}
              onChange={(e) => setRefundNotes(e.target.value)}
              placeholder="Additional notes…"
            />
          </label>
          <AdminMutationAlert errors={[processRefund.error]} />
        </div>
      </AdminModal>

      {/* Pagination */}
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
