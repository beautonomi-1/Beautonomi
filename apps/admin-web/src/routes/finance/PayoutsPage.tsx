import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_FINANCE } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { adminTabButtonClass, adminToolbarButtonClass } from "@/lib/adminUi";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { EmptyState } from "@/components/ui/EmptyState";
import { AdminDataList, type AdminListColumn } from "@/components/admin/AdminDataList";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { AdminMutationAlert } from "@/components/admin/AdminMutationAlert";
import { AdminModal } from "@/components/admin/AdminModal";
import { adminToast } from "@/lib/adminToast";
import { formatAdminCurrency } from "@/lib/adminFormatCurrency";

type PayoutRow = Record<string, unknown> & {
  id?: string;
  payout_number?: string;
  status?: string;
  amount?: number;
  net_amount?: number;
  platform_fee_amount?: number;
  currency?: string;
  transfer_code?: string | null;
  recipient_code?: string | null;
  created_at?: string | null;
  scheduled_at?: string | null;
  approved_at?: string | null;
  processed_at?: string | null;
  completed_at?: string | null;
  failed_at?: string | null;
  failure_reason?: string | null;
  payout_provider_response?:
    | { data?: { status?: string | null } | null; status?: string | null }
    | null;
  provider?: { business_name?: string } | null;
  bank_account?: {
    account_name?: string | null;
    account_number_last4?: string | null;
    bank_name?: string | null;
  } | null;
};

type NegativeBalanceProvidersMeta = {
  count: number;
  providers: Array<{
    provider_id: string;
    raw_balance: number;
    business_name: string | null;
    slug: string | null;
  }>;
};

type PayoutsEnvelope = {
  data: PayoutRow[];
  meta?: {
    page: number;
    limit: number;
    total: number;
    has_more: boolean;
    summary?: Record<string, { count: number; amount: number }>;
    negative_balance_providers?: NegativeBalanceProvidersMeta;
  };
};

type BulkApproveResult = {
  run_id: string;
  dry_run: boolean;
  approved_count: number;
  skipped_count: number;
  approved_ids: string[];
  skipped: Array<{ id: string; reason: string; code?: string }>;
};

type ModalState =
  | {
      kind: "reject" | "mark_failed" | "approve" | "mark_paid" | "transfer" | "finalize_transfer";
      id: string;
      providerName?: string;
      transferCode?: string;
    }
  | null;

type TransferActionResult = {
  payout?: PayoutRow;
  transfer?: {
    transfer_code?: string;
    status?: string;
  };
};

function getPaystackTransferStatus(response: PayoutRow["payout_provider_response"]): string | null {
  return response?.data?.status ?? response?.status ?? null;
}

export function PayoutsPage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_FINANCE, "Finance access is required.");
  useAdminDocumentTitle("Payouts");
  const qc = useQueryClient();
  const [sp, setSp] = useSearchParams();
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
  const status = sp.get("status") || "all";
  const qFilter = sp.get("q") || "";
  const startDate = sp.get("start_date") || "";
  const endDate = sp.get("end_date") || "";
  const minAmount = sp.get("min_amount") || "";
  const maxAmount = sp.get("max_amount") || "";
  const transferStatus = sp.get("transfer_status") || "";
  const [modal, setModal] = useState<ModalState>(null);
  const [reason, setReason] = useState("");
  const [transferOtp, setTransferOtp] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [runLabel, setRunLabel] = useState("");
  const [bulkNotes, setBulkNotes] = useState("");

  const filters = useMemo(
    () => ({ page, status, q: qFilter, startDate, endDate, minAmount, maxAmount, transferStatus }),
    [page, status, qFilter, startDate, endDate, minAmount, maxAmount, transferStatus],
  );

  const buildQueryString = (overrides: Record<string, string> = {}) => {
    const p = new URLSearchParams();
    p.set("page", String(overrides.page ?? page));
    p.set("limit", overrides.limit ?? "25");
    if ((overrides.status ?? status) !== "all") p.set("status", overrides.status ?? status);
    const values = {
      export: overrides.export ?? "",
      q: overrides.q ?? qFilter,
      start_date: overrides.start_date ?? startDate,
      end_date: overrides.end_date ?? endDate,
      min_amount: overrides.min_amount ?? minAmount,
      max_amount: overrides.max_amount ?? maxAmount,
      transfer_status: overrides.transfer_status ?? transferStatus,
    };
    Object.entries(values).forEach(([key, value]) => {
      if (value) p.set(key, value);
    });
    return p.toString();
  };

  const q = useQuery({
    queryKey: adminQueryKeys.payouts.list(filters),
    queryFn: async () => {
      return adminApi.getRawJson<PayoutsEnvelope>(`/api/admin/payouts?${buildQueryString()}`, { timeoutMs: 60_000 });
    },
    enabled: allowed,
  });

  const rows = q.data?.data ?? [];
  const meta = q.data?.meta;
  const summary = meta?.summary ?? {};
  const negativeBalances = meta?.negative_balance_providers;
  const pendingRows = rows.filter((r) => String(r.status ?? "") === "pending" && r.id);
  const selectedPendingIds = pendingRows.map((r) => String(r.id)).filter((id) => selectedIds.has(id));

  const invalidate = () => void qc.invalidateQueries({ queryKey: adminQueryKeys.payouts.all() });

  const exportMut = useMutation({
    mutationFn: async () => {
      const blob = await adminApi.downloadBlob(`/api/admin/payouts?${buildQueryString({ export: "csv", limit: "5000" })}`, {
        timeoutMs: 120_000,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `payouts-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
    onSuccess: () => adminToast.success("Payout CSV exported"),
    onError: (e: Error) => adminToast.error(e.message),
  });

  const bulkApproveMut = useMutation({
    mutationFn: () =>
      adminApi.postJson<BulkApproveResult>(
        "/api/admin/payouts/bulk-approve",
        {
          payout_ids: selectedPendingIds,
          run_label: runLabel.trim() || null,
          notes: bulkNotes.trim() || null,
        },
        { timeoutMs: 120_000 },
      ),
    onSuccess: (result) => {
      invalidate();
      setSelectedIds(new Set());
      adminToast.success(`Approved ${result.approved_count} payout${result.approved_count === 1 ? "" : "s"}`);
      if (result.skipped_count > 0) {
        adminToast.warning(`${result.skipped_count} payout${result.skipped_count === 1 ? "" : "s"} skipped. Review readiness/errors.`);
      }
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const approveMut = useMutation({
    mutationFn: (id: string) => adminApi.postJson(`/api/admin/payouts/${id}/approve`, { notes: "" }),
    onSuccess: () => {
      invalidate();
      setModal(null);
      adminToast.success("Payout approved");
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const rejectMut = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) =>
      adminApi.postJson(`/api/admin/payouts/${id}/reject`, { reason: text }),
    onSuccess: () => {
      invalidate();
      setModal(null);
      setReason("");
      adminToast.success("Payout rejected");
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const markPaidMut = useMutation({
    mutationFn: (id: string) => adminApi.postJson(`/api/admin/payouts/${id}/mark-paid`, {}),
    onSuccess: () => {
      invalidate();
      adminToast.success("Marked as paid");
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const markFailedMut = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) =>
      adminApi.postJson(`/api/admin/payouts/${id}/mark-failed`, { failure_reason: text }),
    onSuccess: () => {
      invalidate();
      setModal(null);
      setReason("");
      adminToast.success("Payout marked failed");
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const transferMut = useMutation({
    mutationFn: (id: string) =>
      adminApi.postJson<TransferActionResult>(`/api/admin/payouts/${id}/initiate-transfer`, {}),
    onSuccess: (result, id) => {
      invalidate();
      const transfer = result?.transfer;
      if (transfer?.status === "otp" && transfer.transfer_code) {
        setTransferOtp("");
        setModal({ kind: "finalize_transfer", id, transferCode: transfer.transfer_code });
        adminToast.info("Transfer initiated. Enter the Paystack OTP to finalize it.");
        return;
      }
      setModal(null);
      adminToast.success("Transfer initiated");
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const finalizeTransferMut = useMutation({
    mutationFn: ({ id, otp }: { id: string; otp: string }) =>
      adminApi.postJson<TransferActionResult>(`/api/admin/payouts/${id}/finalize-transfer`, { otp }),
    onSuccess: () => {
      invalidate();
      setModal(null);
      setTransferOtp("");
      adminToast.success("Transfer finalized");
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  function setStatus(next: string) {
    const n = new URLSearchParams(sp);
    n.set("status", next);
    n.set("page", "1");
    setSp(n, { replace: true });
    setSelectedIds(new Set());
  }

  function setFilter(key: string, value: string) {
    const n = new URLSearchParams(sp);
    if (value) n.set(key, value);
    else n.delete(key);
    n.set("page", "1");
    setSp(n, { replace: true });
    setSelectedIds(new Set());
  }

  function setPage(next: number) {
    const n = new URLSearchParams(sp);
    n.set("page", String(next));
    setSp(n, { replace: true });
  }

  function closeModal() {
    setModal(null);
    setReason("");
    setTransferOtp("");
  }

  function submitModal() {
    if (!modal) return;
    if (modal.kind === "approve") {
      approveMut.mutate(modal.id);
      return;
    }
    if (modal.kind === "mark_paid") {
      markPaidMut.mutate(modal.id);
      setModal(null);
      return;
    }
    if (modal.kind === "transfer") {
      transferMut.mutate(modal.id);
      return;
    }
    if (modal.kind === "finalize_transfer") {
      const otp = transferOtp.trim();
      if (!otp) return;
      finalizeTransferMut.mutate({ id: modal.id, otp });
      return;
    }
    const text = reason.trim();
    if (modal.kind === "reject") {
      if (!text) return;
      rejectMut.mutate({ id: modal.id, text });
    } else {
      if (!text) return;
      markFailedMut.mutate({ id: modal.id, text });
    }
  }

  const columns: AdminListColumn<PayoutRow>[] = useMemo(
    () => [
      {
        id: "select",
        header: (
          <input
            type="checkbox"
            aria-label="Select all pending payouts on this page"
            checked={pendingRows.length > 0 && selectedPendingIds.length === pendingRows.length}
            onChange={(e) => {
              setSelectedIds((prev) => {
                const next = new Set(prev);
                for (const row of pendingRows) {
                  if (!row.id) continue;
                  if (e.target.checked) next.add(String(row.id));
                  else next.delete(String(row.id));
                }
                return next;
              });
            }}
          />
        ),
        cell: (r) =>
          String(r.status ?? "") === "pending" && r.id ? (
            <input
              type="checkbox"
              aria-label={`Select payout ${r.payout_number ?? r.id}`}
              checked={selectedIds.has(String(r.id))}
              onChange={(e) => {
                const id = String(r.id);
                setSelectedIds((prev) => {
                  const next = new Set(prev);
                  if (e.target.checked) next.add(id);
                  else next.delete(id);
                  return next;
                });
              }}
            />
          ) : null,
      },
      {
        id: "provider",
        header: "Provider",
        cell: (r) => (
          <div>
            <div className="font-medium text-gray-900">{(r.provider as { business_name?: string } | null)?.business_name ?? "—"}</div>
            <div className="text-xs text-gray-500">{r.payout_number ?? r.id ?? "—"}</div>
          </div>
        ),
      },
      { id: "status", header: "Status", cell: (r) => String(r.status ?? "") },
      {
        id: "amount",
        header: "Amount",
        cell: (r) => (
          <span className="tabular-nums">
            {String(r.currency ?? "")} {Number(r.amount ?? 0).toFixed(2)}
          </span>
        ),
      },
      {
        id: "bank",
        header: "Destination",
        cell: (r) => (
          <div className="text-sm">
            <div>{r.bank_account?.bank_name ?? "—"}</div>
            <div className="text-xs text-gray-500">
              {r.bank_account?.account_name ?? ""} {r.bank_account?.account_number_last4 ? `•••• ${r.bank_account.account_number_last4}` : ""}
            </div>
          </div>
        ),
      },
      {
        id: "dates",
        header: "Timeline",
        cell: (r) => (
          <div className="text-xs text-gray-600">
            <div>Created: {r.created_at ? new Date(r.created_at).toLocaleDateString() : "—"}</div>
            {r.approved_at ? <div>Approved: {new Date(r.approved_at).toLocaleDateString()}</div> : null}
            {r.completed_at ? <div>Completed: {new Date(r.completed_at).toLocaleDateString()}</div> : null}
          </div>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        cell: (r) => {
          const id = String(r.id ?? "");
          const st = String(r.status ?? "");
          const transferCode = typeof r.transfer_code === "string" ? r.transfer_code : "";
          const paystackStatus = getPaystackTransferStatus(r.payout_provider_response);
          const needsOtp = Boolean(transferCode && paystackStatus === "otp");
          const providerName = (r.provider as { business_name?: string } | null)?.business_name;
          const busyThis =
            approveMut.isPending ||
            markPaidMut.isPending ||
            transferMut.isPending ||
            finalizeTransferMut.isPending ||
            ((rejectMut.isPending || markFailedMut.isPending) && modal?.id === id);
          return (
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {st === "pending" ? (
                <>
                  <button
                    type="button"
                    className="min-h-11 touch-manipulation text-left text-sm font-semibold text-gray-900 underline disabled:opacity-50"
                    disabled={approveMut.isPending || busyThis}
                    onClick={() => {
                      setReason("");
                      setModal({ kind: "approve", id, providerName });
                    }}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="min-h-11 touch-manipulation text-left text-sm font-semibold text-gray-900 underline disabled:opacity-50"
                    disabled={busyThis}
                    onClick={() => {
                      setReason("");
                      setModal({ kind: "reject", id });
                    }}
                  >
                    Reject
                  </button>
                </>
              ) : null}
              {st === "processing" ? (
                <>
                  {!needsOtp ? (
                    <button
                      type="button"
                      className="min-h-11 touch-manipulation text-left text-sm font-semibold text-gray-900 underline disabled:opacity-50"
                      disabled={markPaidMut.isPending || busyThis}
                      onClick={() => {
                        setReason("");
                        setModal({ kind: "mark_paid", id, providerName: providerName || undefined });
                      }}
                    >
                      Mark paid
                    </button>
                  ) : null}
                  {!transferCode ? (
                    <button
                      type="button"
                      className="min-h-11 touch-manipulation text-left text-sm font-semibold text-gray-900 underline disabled:opacity-50"
                      disabled={transferMut.isPending || busyThis}
                      onClick={() => {
                        setReason("");
                        setModal({ kind: "transfer", id, providerName: providerName || undefined });
                      }}
                    >
                      Transfer
                    </button>
                  ) : null}
                  {needsOtp ? (
                    <button
                      type="button"
                      className="min-h-11 touch-manipulation text-left text-sm font-semibold text-gray-900 underline disabled:opacity-50"
                      disabled={finalizeTransferMut.isPending || busyThis}
                      onClick={() => {
                        setReason("");
                        setTransferOtp("");
                        setModal({
                          kind: "finalize_transfer",
                          id,
                          providerName: providerName || undefined,
                          transferCode,
                        });
                      }}
                    >
                      Finalize OTP
                    </button>
                  ) : null}
                  {/* Show Mark failed when:
                      (a) no transfer yet — no Paystack entry to reconcile
                      (b) transfer exists but Paystack already failed/reversed it
                      (c) transfer is stuck in OTP state (admin override) */}
                  {!transferCode ||
                  paystackStatus === "failed" ||
                  paystackStatus === "reversed" ||
                  needsOtp ? (
                    <button
                      type="button"
                      className="min-h-11 touch-manipulation text-left text-sm font-semibold text-gray-900 underline disabled:opacity-50"
                      disabled={busyThis}
                      onClick={() => {
                        setReason("");
                        setModal({
                          kind: "mark_failed",
                          id,
                          transferCode: transferCode || undefined,
                        });
                      }}
                    >
                      {needsOtp ? "Abandon OTP" : "Mark failed"}
                    </button>
                  ) : null}
                </>
              ) : null}
              {!["pending", "processing"].includes(st) ? <span className="text-gray-400">—</span> : null}
            </div>
          );
        },
      },
    ],
    [
      approveMut,
      markPaidMut,
      transferMut,
      finalizeTransferMut,
      rejectMut,
      markFailedMut,
      modal?.id,
      pendingRows,
      selectedIds,
      selectedPendingIds.length,
    ]
  );

  if (denied) return denied;

  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Payouts" />
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

  const tabs = ["all", "pending", "processing", "completed", "failed"] as const;
  const modalBusy =
    approveMut.isPending ||
    rejectMut.isPending ||
    markFailedMut.isPending ||
    markPaidMut.isPending ||
    transferMut.isPending ||
    finalizeTransferMut.isPending;
  const isApproveModal = modal?.kind === "approve";
  const isMarkPaidModal = modal?.kind === "mark_paid";
  const isTransferModal = modal?.kind === "transfer";
  const isFinalizeTransferModal = modal?.kind === "finalize_transfer";
  const isConfirmationOnlyModal = isApproveModal || isMarkPaidModal || isTransferModal;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Payouts"
        description="Provider withdrawal queue for this market. Balances are validated when the provider requests a payout; marking paid records the finance ledger so their available balance stays accurate."
      />
      {negativeBalances && negativeBalances.count > 0 ? (
        <AdminPanel>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <p className="font-semibold">
              Negative provider payout balances ({negativeBalances.count})
            </p>
            <p className="mt-1 text-amber-900/90">
              These providers have a ledger shortfall (for example refunds after money was already paid out). Available
              balance shows as 0 for new requests; recover manually if your policy requires clawback.
            </p>
            <ul className="mt-2 max-h-48 list-disc space-y-1 overflow-y-auto pl-5">
              {negativeBalances.providers.slice(0, 25).map((p) => (
                <li key={p.provider_id} className="tabular-nums">
                  {p.business_name ?? p.slug ?? p.provider_id}: {formatAdminCurrency(p.raw_balance)}
                </li>
              ))}
            </ul>
            {negativeBalances.providers.length > 25 ? (
              <p className="mt-2 text-xs text-amber-900/80">
                Showing 25 of {negativeBalances.providers.length} providers (most negative first).
              </p>
            ) : null}
          </div>
        </AdminPanel>
      ) : null}

      <AdminPanel>
        <h3 className="text-sm font-semibold text-gray-900 mb-2">How actions work</h3>
        <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
          <li>
            <strong>Approve</strong> moves a request to processing so finance can pay out (notifies the provider).
          </li>
          <li>
            <strong>Transfer</strong> sends the Paystack transfer when the recipient is set up (use when you pay via Paystack).
          </li>
          <li>
            <strong>Mark paid</strong> use when money has actually left the platform (bank / Paystack settled). This writes the
            payout to the finance ledger and is idempotent.
          </li>
          <li>
            <strong>Reject / Mark failed</strong> frees the provider&apos;s balance for a new request (requires a reason).
          </li>
        </ul>
      </AdminPanel>
      <AdminPanel>
        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button key={t} type="button" className={adminTabButtonClass(status === t)} onClick={() => setStatus(t)}>
              {t}
            </button>
          ))}
        </div>
        {meta ? (
          <p className="mt-3 text-sm text-gray-600">
            Page {meta.page} · {rows.length} rows · total {meta.total}
          </p>
        ) : null}
      </AdminPanel>

      <AdminPanel>
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
          <label className="text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Search</span>
            <input
              className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
              value={qFilter}
              onChange={(e) => setFilter("q", e.target.value)}
              placeholder="Provider or payout #"
            />
          </label>
          <label className="text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">From</span>
            <input
              className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
              type="date"
              value={startDate}
              onChange={(e) => setFilter("start_date", e.target.value)}
            />
          </label>
          <label className="text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">To</span>
            <input
              className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
              type="date"
              value={endDate}
              onChange={(e) => setFilter("end_date", e.target.value)}
            />
          </label>
          <label className="text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Min amount</span>
            <input
              className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
              inputMode="decimal"
              value={minAmount}
              onChange={(e) => setFilter("min_amount", e.target.value)}
            />
          </label>
          <label className="text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Max amount</span>
            <input
              className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
              inputMode="decimal"
              value={maxAmount}
              onChange={(e) => setFilter("max_amount", e.target.value)}
            />
          </label>
          <label className="text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Transfer</span>
            <select
              className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
              value={transferStatus}
              onChange={(e) => setFilter("transfer_status", e.target.value)}
            >
              <option value="">Any</option>
              <option value="otp">OTP pending</option>
              <option value="pending">Pending</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
              <option value="reversed">Reversed</option>
            </select>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" className={adminToolbarButtonClass()} onClick={() => void exportMut.mutate()}>
            {exportMut.isPending ? "Exporting…" : "Export CSV"}
          </button>
          <button
            type="button"
            className={adminToolbarButtonClass()}
            onClick={() => {
              setSp(new URLSearchParams(), { replace: true });
              setSelectedIds(new Set());
            }}
          >
            Clear filters
          </button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-5">
          {["pending", "processing", "completed", "failed"].map((key) => (
            <div key={key} className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{key}</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                {summary[key]?.count ?? 0} · {formatAdminCurrency(summary[key]?.amount ?? 0)}
              </div>
            </div>
          ))}
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Total</div>
            <div className="mt-1 text-sm font-semibold text-gray-900">{meta?.total ?? 0} payouts</div>
          </div>
        </div>
      </AdminPanel>

      {selectedPendingIds.length > 0 ? (
        <AdminPanel>
          <div className="grid gap-3 md:grid-cols-[1fr_2fr_auto] md:items-end">
            <label className="text-sm">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Run label</span>
              <input
                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                value={runLabel}
                onChange={(e) => setRunLabel(e.target.value)}
                placeholder="May payout run"
              />
            </label>
            <label className="text-sm">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Approval notes</span>
              <input
                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                value={bulkNotes}
                onChange={(e) => setBulkNotes(e.target.value)}
                placeholder="Bank file checked, accounts verified"
              />
            </label>
            <button
              type="button"
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-gray-900 px-4 text-sm font-semibold text-white disabled:opacity-50"
              disabled={bulkApproveMut.isPending}
              onClick={() => void bulkApproveMut.mutate()}
            >
              {bulkApproveMut.isPending ? "Approving…" : `Approve ${selectedPendingIds.length} selected`}
            </button>
          </div>
          <p className="mt-2 text-xs text-gray-600">
            Bulk approval only accepts pending payouts in this market, validates bank readiness, and writes a run audit log.
          </p>
        </AdminPanel>
      ) : null}

      <AdminMutationAlert
        errors={[
          approveMut.error,
          rejectMut.error,
          markPaidMut.error,
          markFailedMut.error,
          transferMut.error,
          exportMut.error,
          bulkApproveMut.error,
        ]}
      />

      <AdminModal
        open={modal != null}
        onClose={closeModal}
        title={
          isApproveModal
            ? "Confirm payout approval"
            : isMarkPaidModal
              ? "Confirm payout paid"
              : isTransferModal
                ? "Confirm payout transfer"
                : isFinalizeTransferModal
                  ? "Finalize Paystack transfer"
                  : modal?.kind === "reject"
                    ? "Reject payout"
                    : "Mark payout failed"
        }
        description={
          isApproveModal
            ? `Approve payout for ${modal?.providerName ?? "this provider"}? This cannot be undone.`
            : isMarkPaidModal
              ? `Mark payout for ${modal?.providerName ?? "this provider"} as paid? Use this only after settlement is confirmed.`
              : isTransferModal
                ? `Initiate transfer for ${modal?.providerName ?? "this provider"}? This may trigger a real provider payout.`
                : isFinalizeTransferModal
                  ? `Enter the OTP Paystack sent for transfer ${modal?.transferCode ?? "this payout"}.`
                  : modal?.kind === "reject"
                    ? "A reason is required."
                    : modal?.kind === "mark_failed" && modal.transferCode
                      ? "This transfer has a Paystack transfer code. Only use this if Paystack has already failed/reversed it, or you are intentionally abandoning a stuck OTP. Provide a reason."
                      : "A failure reason is required."
        }
        footer={
          <>
            <button type="button" className={adminToolbarButtonClass()} onClick={closeModal}>
              Cancel
            </button>
            <button
              type="button"
              className="inline-flex min-h-11 min-w-[5.5rem] items-center justify-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white disabled:opacity-50"
              disabled={
                modalBusy ||
                (!isConfirmationOnlyModal &&
                  !isFinalizeTransferModal &&
                  !reason.trim()) ||
                (isFinalizeTransferModal && !transferOtp.trim())
              }
              onClick={() => submitModal()}
            >
              {isApproveModal
                ? "Approve"
                : isMarkPaidModal
                  ? "Mark paid"
                  : isTransferModal
                    ? "Transfer"
                    : isFinalizeTransferModal
                      ? "Finalize"
                      : "Submit"}
            </button>
          </>
        }
      >
        {isConfirmationOnlyModal ? (
          <p className="text-sm text-gray-600">
            {isApproveModal
              ? "Approving a payout moves it to processing and notifies the provider. Make sure the payout amount and provider details are correct before proceeding."
              : isMarkPaidModal
                ? "This records the payout as paid in admin operations. Confirm the external payment has settled before continuing."
                : "This starts the transfer flow for the payout. Confirm provider banking details and amount before continuing."}
          </p>
        ) : isFinalizeTransferModal ? (
          <label className="block text-sm">
            <span className="text-gray-700">Paystack OTP</span>
            <input
              className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-3 text-sm tracking-widest shadow-inner"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={transferOtp}
              onChange={(e) => setTransferOtp(e.target.value.replace(/[^\d]/g, ""))}
              maxLength={12}
              placeholder="000000"
              autoFocus
            />
          </label>
        ) : (
          <textarea
            className="min-h-[120px] w-full rounded-xl border border-gray-300 p-3 text-sm shadow-inner"
            rows={4}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason…"
          />
        )}
      </AdminModal>

      <AdminDataList
        columns={columns}
        rows={rows}
        rowKey={(r) => String(r.id ?? "")}
        empty={<EmptyState title="No payouts" description="Try another status filter." />}
      />

      {meta && meta.total > meta.limit ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={adminToolbarButtonClass(page <= 1)}
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </button>
          <button
            type="button"
            className={adminToolbarButtonClass(!meta.has_more)}
            disabled={!meta.has_more}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}
