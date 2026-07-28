import { Fragment, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_FINANCE } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { adminTabButtonClass } from "@/lib/adminUi";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { adminToast } from "@/lib/adminToast";
import { formatAdminCurrency } from "@/lib/adminFormatCurrency";
import { adminSpaTo } from "@/lib/adminSpaPath";
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
import {
  REFUND_REASON_PRESETS,
  parseRefundAmount,
  remainingRefundable,
  isProcessableRefundRow,
  orphanPaymentLabel,
  normalizeRefundReason,
  isRefundReasonValid,
  type RefundReasonPreset,
} from "@/lib/refunds/refundUiHelpers";

type RefundStatistics = {
  total_transactions?: number;
  total?: number;
  actionable_refundable?: number;
  total_refunded_amount?: number;
  total_refunded?: number;
  rows_with_refund_recorded?: number;
  by_status?: Record<string, number>;
  average_refund_among_recorded?: string;
  average_refund?: string;
};

type RefundsPayload = {
  refunds: Record<string, unknown>[];
  pagination: { page: number; limit: number; total: number; total_pages: number };
  statistics?: RefundStatistics;
};

type BookingEmbed = {
  id?: string;
  booking_number?: string;
  provider?: { business_name?: string | null } | null;
  customer?: { full_name?: string | null; email?: string | null } | null;
};

function unwrapBookingCustomer(
  booking: unknown,
): { full_name?: string | null; email?: string | null } | null {
  if (!booking || typeof booking !== "object") return null;
  const b = booking as { customer?: unknown };
  const c = b.customer;
  if (!c) return null;
  if (Array.isArray(c)) return (c[0] as { full_name?: string; email?: string }) ?? null;
  return c as { full_name?: string; email?: string };
}

function unwrapBookingProvider(booking: unknown): string | null {
  if (!booking || typeof booking !== "object") return null;
  const p = (booking as BookingEmbed).provider;
  if (!p || typeof p !== "object") return null;
  return p.business_name ?? null;
}

function unwrapRefundedByUser(
  user: unknown,
): { full_name?: string | null; email?: string | null } | null {
  if (!user || typeof user !== "object") return null;
  if (Array.isArray(user)) return (user[0] as { full_name?: string; email?: string }) ?? null;
  return user as { full_name?: string; email?: string };
}

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  success: "bg-green-100 text-green-800",
  refunded: "bg-blue-100 text-blue-800",
  partially_refunded: "bg-indigo-100 text-indigo-800",
  failed: "bg-red-100 text-red-800",
};

function closeProcessModal(setters: {
  setProcessId: (v: string | null) => void;
  setProcessRow: (v: Record<string, unknown> | null) => void;
  setRefundAmount: (v: string) => void;
  setReasonPreset: (v: RefundReasonPreset | "") => void;
  setReasonOther: (v: string) => void;
  setRefundNotes: (v: string) => void;
  setWalletConfirm: (v: boolean) => void;
  setProviderWarning: (v: string | null) => void;
}) {
  setters.setProcessId(null);
  setters.setProcessRow(null);
  setters.setRefundAmount("");
  setters.setReasonPreset("");
  setters.setReasonOther("");
  setters.setRefundNotes("");
  setters.setWalletConfirm(false);
  setters.setProviderWarning(null);
}

export function RefundsListPage() {
  useAdminDocumentTitle("Refunds");
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_FINANCE,
    "Finance access is required to manage refunds.",
  );
  const qc = useQueryClient();
  const [sp, setSp] = useSearchParams();
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
  const status = sp.get("status") || "all";
  const filters = useMemo(() => ({ page, status }), [page, status]);

  const [processId, setProcessId] = useState<string | null>(null);
  const [processRow, setProcessRow] = useState<Record<string, unknown> | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [reasonPreset, setReasonPreset] = useState<RefundReasonPreset | "">("");
  const [reasonOther, setReasonOther] = useState("");
  const [refundNotes, setRefundNotes] = useState("");
  const [walletConfirm, setWalletConfirm] = useState(false);
  const [providerWarning, setProviderWarning] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const modalSetters = {
    setProcessId,
    setProcessRow,
    setRefundAmount,
    setReasonPreset,
    setReasonOther,
    setRefundNotes,
    setWalletConfirm,
    setProviderWarning,
  };

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
      adminToast.success("Refund credited to customer wallet");
      const warning =
        data && "provider_balance_warning" in data ? data.provider_balance_warning : null;
      if (warning) {
        setProviderWarning(warning);
        adminToast.warning(warning);
      } else {
        closeProcessModal(modalSetters);
      }
    },
    onError: (e: Error) => {
      const msg = e.message.includes("PERIOD_LOCKED")
        ? "Refund blocked — financial period is locked."
        : e.message.includes("INVALID_AMOUNT")
          ? "Refund amount exceeds the remaining refundable balance."
          : `Refund failed: ${e.message}`;
      adminToast.error(msg);
    },
  });

  const rows = q.data?.refunds ?? [];
  const pag = q.data?.pagination;
  const stats = q.data?.statistics;

  const processRemaining = processRow
    ? parseRefundAmount(
        processRow.remaining_refundable ??
          remainingRefundable(processRow.amount, processRow.refund_amount),
      )
    : 0;

  const resolvedReason = normalizeRefundReason(reasonPreset, reasonOther);
  const reasonValid = isRefundReasonValid(reasonPreset, reasonOther);
  const amountNum = parseFloat(refundAmount);
  const amountValid =
    Number.isFinite(amountNum) && amountNum > 0 && amountNum <= processRemaining + 0.001;

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
    const remaining = parseRefundAmount(
      row.remaining_refundable ?? remainingRefundable(row.amount, row.refund_amount),
    );
    setProcessId(id);
    setProcessRow(row);
    setRefundAmount(String(remaining));
    setReasonPreset("");
    setReasonOther("");
    setRefundNotes("");
    setWalletConfirm(false);
    setProviderWarning(null);
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

  const processBooking = processRow?.booking as BookingEmbed | null | undefined;
  const processCustomer = unwrapBookingCustomer(processRow?.booking);
  const processProviderName = unwrapBookingProvider(processRow?.booking);
  const processAlreadyRefunded = processRow
    ? parseRefundAmount(processRow.refund_amount)
    : 0;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Refunds"
        description="Process booking payment refunds for this market. Refunds credit the customer wallet immediately — card and bank reversals are not performed here."
      />

      <AdminPanel>
        <h3 className="text-sm font-semibold text-gray-900">How actions work</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-700">
          <li>
            <strong>Process</strong> — credits the customer wallet automatically, updates the
            payment transaction status, and sends a push notification.
          </li>
          <li>
            <strong>Partial refund</strong> — allowed until the remaining balance on a charge
            reaches zero (including after a prior partial refund).
          </li>
          <li>
            <strong>Non-booking payments</strong> (gift cards, memberships, subscriptions) cannot
            be refunded here — use{" "}
            <Link to={adminSpaTo("/admin/gift-cards")} className="underline">
              Gift Cards
            </Link>
            ,{" "}
            <Link to={adminSpaTo("/admin/ecommerce/orders")} className="underline">
              Ecommerce orders
            </Link>
            , or{" "}
            <Link to={adminSpaTo("/admin/commercial/terminal-orders")} className="underline">
              Terminal orders
            </Link>
            .
          </li>
        </ul>
      </AdminPanel>

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
                Booking charges with remaining balance
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
                Total refunded to wallets
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">
                {formatAdminCurrency(parseRefundAmount(totalRefundedAmt))}
              </p>
            </AdminPanel>
            <AdminPanel className="!p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Payments with refund recorded
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">
                {rowsWithRefund}
              </p>
            </AdminPanel>
            <AdminPanel className="!p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Avg refund (recorded)
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">
                {formatAdminCurrency(parseRefundAmount(avgRecorded))}
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
              <AdminTh>Payment</AdminTh>
              <AdminTh>Refunded</AdminTh>
              <AdminTh>Remaining</AdminTh>
              <AdminTh>Payout</AdminTh>
              <AdminTh>Reason</AdminTh>
              <AdminTh>Booking / source</AdminTh>
              <AdminTh>Customer</AdminTh>
              <AdminTh>Date</AdminTh>
              <AdminTh>Actions</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((r) => {
              const row = r as Record<string, unknown>;
              const id = String(row.id ?? "");
              const booking = row.booking as BookingEmbed | null | undefined;
              const customer = unwrapBookingCustomer(row.booking);
              const statusStr = String(row.status ?? "pending");
              const badgeClass = STATUS_BADGE[statusStr] ?? "bg-gray-100 text-gray-600";
              const remaining = parseRefundAmount(
                row.remaining_refundable ?? remainingRefundable(row.amount, row.refund_amount),
              );
              const processable = isProcessableRefundRow({
                status: statusStr,
                booking: row.booking,
                is_processable: row.is_processable as boolean | undefined,
              });
              const orphan = !booking ? orphanPaymentLabel(row.metadata) : null;
              const isExpanded = expandedId === id;
              const refundedBy = unwrapRefundedByUser(row.refunded_by_user);

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
                      {formatAdminCurrency(parseRefundAmount(row.amount))}
                    </AdminTd>
                    <AdminTd className="tabular-nums">
                      {parseRefundAmount(row.refund_amount) > 0
                        ? formatAdminCurrency(parseRefundAmount(row.refund_amount))
                        : "—"}
                    </AdminTd>
                    <AdminTd className="tabular-nums">
                      {remaining > 0 ? formatAdminCurrency(remaining) : "—"}
                    </AdminTd>
                    <AdminTd className="text-xs text-gray-600">
                      {parseRefundAmount(row.refund_amount) > 0 || processable
                        ? "Wallet (auto)"
                        : "—"}
                    </AdminTd>
                    <AdminTd className="max-w-[140px] truncate text-xs text-gray-600">
                      {row.refund_reason ? String(row.refund_reason) : "—"}
                    </AdminTd>
                    <AdminTd className="text-xs">
                      {booking?.id && booking.booking_number ? (
                        <Link
                          to={adminSpaTo(`/admin/bookings/${encodeURIComponent(booking.id)}`)}
                          className="underline hover:text-gray-900"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {booking.booking_number}
                        </Link>
                      ) : orphan ? (
                        orphan.href ? (
                          <Link
                            to={adminSpaTo(orphan.href)}
                            className="underline hover:text-gray-900"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {orphan.label}
                          </Link>
                        ) : (
                          <span className="text-gray-600">{orphan.label}</span>
                        )
                      ) : (
                        "—"
                      )}
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
                      {processable ? (
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
                      ) : !booking && statusStr === "success" ? (
                        <span
                          className="text-[11px] text-gray-500"
                          title="Refund from the product screen for this payment type"
                        >
                          See source
                        </span>
                      ) : null}
                    </AdminTd>
                  </tr>

                  {isExpanded && (
                    <tr key={`${id}-detail`}>
                      <td
                        colSpan={11}
                        className="border-t border-gray-100 bg-gray-50 px-4 py-3"
                      >
                        <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
                          <div className="space-y-1">
                            <p className="text-xs text-gray-500">
                              Transaction ID: <span className="font-mono">{id}</span>
                            </p>
                            {row.provider ? (
                              <p className="text-xs text-gray-500">
                                Original gateway: {String(row.provider)}
                              </p>
                            ) : null}
                            {unwrapBookingProvider(row.booking) ? (
                              <p className="text-xs text-gray-500">
                                Provider: {unwrapBookingProvider(row.booking)}
                              </p>
                            ) : null}
                            {row.refund_reference ? (
                              <p className="text-xs text-gray-500">
                                Refund reference:{" "}
                                <span className="font-mono">{String(row.refund_reference)}</span>
                              </p>
                            ) : null}
                            {row.refund_reason ? (
                              <p className="text-xs text-gray-600">
                                <span className="font-medium text-gray-700">Reason:</span>{" "}
                                {String(row.refund_reason)}
                              </p>
                            ) : null}
                          </div>
                          <div className="space-y-1">
                            {row.refunded_at ? (
                              <p className="text-xs text-gray-500">
                                Processed: {new Date(String(row.refunded_at)).toLocaleString()}
                              </p>
                            ) : null}
                            {refundedBy ? (
                              <p className="text-xs text-gray-500">
                                Processed by: {refundedBy.full_name || refundedBy.email || "—"}
                              </p>
                            ) : null}
                            <p className="text-xs text-gray-500">
                              Payout method: wallet (automatic store credit)
                            </p>
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

      <AdminModal
        open={Boolean(processId && processRow)}
        onClose={() => {
          if (!processRefund.isPending) closeProcessModal(modalSetters);
        }}
        title={providerWarning ? "Refund processed" : "Process refund"}
        description={
          providerWarning
            ? "The customer wallet was credited. Review the provider balance warning below."
            : processRow
              ? `Booking ${processBooking?.booking_number ?? "—"} · remaining ${formatAdminCurrency(processRemaining)}`
              : undefined
        }
        footer={
          providerWarning ? (
            <button
              type="button"
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-700"
              onClick={() => closeProcessModal(modalSetters)}
            >
              Done
            </button>
          ) : (
            <>
              <button
                type="button"
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
                onClick={() => closeProcessModal(modalSetters)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
                disabled={
                  processRefund.isPending ||
                  !amountValid ||
                  !reasonValid ||
                  !walletConfirm
                }
                onClick={() => {
                  if (!processId) return;
                  processRefund.mutate({
                    id: processId,
                    amount: amountNum,
                    reason: resolvedReason,
                    notes: refundNotes,
                  });
                }}
              >
                {processRefund.isPending ? "Processing…" : "Process refund"}
              </button>
            </>
          )
        }
      >
        {providerWarning ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <p className="font-semibold">Provider balance warning</p>
            <p className="mt-1">{providerWarning}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {processRow ? (
              <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
                <p>
                  <span className="font-medium">Customer:</span>{" "}
                  {processCustomer?.full_name || processCustomer?.email || "—"}
                </p>
                {processProviderName ? (
                  <p>
                    <span className="font-medium">Provider:</span> {processProviderName}
                  </p>
                ) : null}
                <p>
                  <span className="font-medium">Original payment:</span>{" "}
                  {formatAdminCurrency(parseRefundAmount(processRow.amount))}
                  {processRow.provider ? ` (${String(processRow.provider)})` : ""}
                </p>
                {processAlreadyRefunded > 0 ? (
                  <p>
                    <span className="font-medium">Already refunded:</span>{" "}
                    {formatAdminCurrency(processAlreadyRefunded)}
                  </p>
                ) : null}
                <p>
                  <span className="font-medium">Remaining refundable:</span>{" "}
                  {formatAdminCurrency(processRemaining)}
                </p>
              </div>
            ) : null}

            <p className="rounded-lg bg-blue-50 p-3 text-xs text-blue-800">
              The customer&apos;s wallet will be credited immediately. This does not refund their
              card or bank. They can use the balance on their next booking or request a payout from
              their wallet.
            </p>

            <label className="block text-sm font-medium text-gray-700">
              Refund amount (ZAR) *
              <input
                type="number"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
                step="0.01"
                min="0.01"
                max={processRemaining > 0 ? processRemaining : undefined}
              />
              {processRemaining > 0 ? (
                <span className="mt-1 block text-xs text-gray-500">
                  Maximum: {formatAdminCurrency(processRemaining)}
                </span>
              ) : null}
            </label>

            <label className="block text-sm font-medium text-gray-700">
              Reason *
              <select
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={reasonPreset}
                onChange={(e) => setReasonPreset(e.target.value as RefundReasonPreset | "")}
              >
                <option value="">Select a reason…</option>
                {REFUND_REASON_PRESETS.map((preset) => (
                  <option key={preset} value={preset}>
                    {preset}
                  </option>
                ))}
              </select>
            </label>

            {reasonPreset === "Other" || reasonPreset === "" ? (
              <label className="block text-sm font-medium text-gray-700">
                {reasonPreset === "Other" ? "Describe reason *" : "Or enter reason *"}
                <input
                  type="text"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  value={reasonOther}
                  onChange={(e) => setReasonOther(e.target.value)}
                  placeholder="Reason for refund…"
                />
              </label>
            ) : null}

            <label className="block text-sm font-medium text-gray-700">
              Internal notes (optional)
              <textarea
                className="mt-1 min-h-[60px] w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={refundNotes}
                onChange={(e) => setRefundNotes(e.target.value)}
                placeholder="Additional context for support and audit…"
              />
            </label>

            <label className="flex items-start gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={walletConfirm}
                onChange={(e) => setWalletConfirm(e.target.checked)}
              />
              <span>
                I understand this credits the customer wallet, not the original payment method.
              </span>
            </label>

            <AdminMutationAlert errors={[processRefund.error]} />
          </div>
        )}
      </AdminModal>

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
