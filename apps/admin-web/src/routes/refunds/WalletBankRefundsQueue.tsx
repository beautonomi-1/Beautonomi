import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_FINANCE } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminMutationAlert } from "@/components/admin/AdminMutationAlert";
import { adminToast } from "@/lib/adminToast";
import { formatAdminCurrency } from "@/lib/adminFormatCurrency";
import { AdminModal } from "@/components/admin/AdminModal";

type WalletBankRefundRow = {
  id: string;
  request_number?: string;
  status?: string;
  amount?: number;
  fee_amount?: number;
  net_amount?: number;
  currency?: string;
  created_at?: string;
  customer?: { full_name?: string | null; email?: string | null } | null;
  bank_name?: string | null;
  bank_code?: string;
  account_name?: string | null;
  account_number_last4?: string;
  account_number?: string | null;
  rejection_reason?: string | null;
  bank_transfer_reference?: string | null;
};

type ListPayload = {
  requests: WalletBankRefundRow[];
  pagination: { page: number; limit: number; total: number; total_pages: number };
  summary?: { pending?: number; approved_awaiting_eft?: number };
};

type SettingsPayload = {
  settings: {
    enabled: boolean;
    min_amount: number;
    max_amount_per_request: number | null;
    fee_type: "fixed" | "percentage";
    fee_value: number;
    sla_business_days: number;
    help_text: string | null;
  };
};

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-blue-100 text-blue-800",
  paid: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-700",
};

export function WalletBankRefundsQueue({ page }: { page: number }) {
  const { allowed } = useAdminSectionPage(
    ADMIN_SECTION_FINANCE,
    "Finance access is required to manage wallet bank refunds.",
  );
  const qc = useQueryClient();
  const [status, setStatus] = useState("pending");
  const [markPaidId, setMarkPaidId] = useState<string | null>(null);
  const [transferRef, setTransferRef] = useState("");
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [revealedNumbers, setRevealedNumbers] = useState<Record<string, string>>({});

  const filters = useMemo(() => ({ page, status }), [page, status]);

  const listQ = useQuery({
    queryKey: adminQueryKeys.walletBankRefunds(filters),
    queryFn: () =>
      adminApi.getJson<ListPayload>(
        `/api/admin/finance/wallet-bank-refunds?page=${page}&limit=25&status=${encodeURIComponent(status)}`,
        { timeoutMs: 60_000 },
      ),
    enabled: allowed,
  });

  const settingsQ = useQuery({
    queryKey: adminQueryKeys.walletBankRefundSettings(),
    queryFn: () =>
      adminApi.getJson<SettingsPayload>("/api/admin/finance/wallet-bank-refunds/settings", {
        timeoutMs: 30_000,
      }),
    enabled: allowed,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: adminQueryKeys.walletBankRefunds(filters) });
    void qc.invalidateQueries({ queryKey: adminQueryKeys.walletBankRefundSettings() });
  };

  const approveM = useMutation({
    mutationFn: (id: string) =>
      adminApi.postJson(`/api/admin/finance/wallet-bank-refunds/${id}/approve`, { notes: "" }),
    onSuccess: () => {
      adminToast.success("Request approved — send the EFT, then mark paid");
      invalidate();
    },
    onError: (e: Error) => adminToast.error(e.message || "Approve failed"),
  });

  const rejectM = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      adminApi.postJson(`/api/admin/finance/wallet-bank-refunds/${id}/reject`, { reason }),
    onSuccess: () => {
      adminToast.success("Request rejected");
      setRejectId(null);
      setRejectReason("");
      invalidate();
    },
    onError: (e: Error) => adminToast.error(e.message || "Reject failed"),
  });

  const markPaidM = useMutation({
    mutationFn: ({ id, transfer_reference }: { id: string; transfer_reference: string }) =>
      adminApi.postJson(`/api/admin/finance/wallet-bank-refunds/${id}/mark-paid`, {
        transfer_reference,
      }),
    onSuccess: () => {
      adminToast.success("Marked paid");
      setMarkPaidId(null);
      setTransferRef("");
      invalidate();
    },
    onError: (e: Error) => adminToast.error(e.message || "Mark paid failed"),
  });

  const settingsPatchM = useMutation({
    mutationFn: (patch: Partial<SettingsPayload["settings"]>) =>
      adminApi.patchJson("/api/admin/finance/wallet-bank-refunds/settings", patch),
    onSuccess: () => {
      adminToast.success("Settings saved");
      invalidate();
    },
    onError: (e: Error) => adminToast.error(e.message || "Settings update failed"),
  });

  const revealM = useMutation({
    mutationFn: (id: string) =>
      adminApi.postJson<{ account_number?: string }>(
        `/api/admin/finance/wallet-bank-refunds/${id}/reveal`,
        {},
      ),
    onSuccess: (data, id) => {
      if (data.account_number) {
        setRevealedNumbers((prev) => ({ ...prev, [id]: data.account_number! }));
      }
    },
    onError: (e: Error) => adminToast.error(e.message || "Reveal failed"),
  });

  if (!allowed) return null;
  if (listQ.isLoading || settingsQ.isLoading) return <AdminPageSkeleton rows={6} />;
  if (listQ.isError) {
    return <AdminRetryBlock message="Could not load wallet bank refunds" onRetry={() => listQ.refetch()} />;
  }

  const rows = listQ.data?.requests ?? [];
  const settings = settingsQ.data?.settings;
  const summary = listQ.data?.summary;

  return (
    <div className="space-y-4">
      <AdminPanel className="!p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Wallet → bank (manual EFT)</h3>
            <p className="mt-1 text-sm text-gray-600">
              Customers can request a bank refund of wallet credit that came from card-payment refunds. The amount
              is held in their wallet at submit; rejecting or customer-cancelling returns it. Approve, send the EFT
              for the &ldquo;Pay&rdquo; amount, then mark paid with the transfer reference.
            </p>
            {summary ? (
              <p className="mt-2 text-xs text-gray-500">
                Pending review: {summary.pending ?? 0} · Approved awaiting EFT:{" "}
                {summary.approved_awaiting_eft ?? 0}
              </p>
            ) : null}
          </div>
          {settings ? (
            <div className="flex flex-col items-end gap-2 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.enabled}
                  onChange={(e) => settingsPatchM.mutate({ enabled: e.target.checked })}
                />
                Enabled for customers
              </label>
              <span className="text-xs text-gray-500">
                Min {formatAdminCurrency(settings.min_amount)}
                {settings.max_amount_per_request != null
                  ? ` · Max ${formatAdminCurrency(settings.max_amount_per_request)}`
                  : null}
                {" · Fee "}
                {settings.fee_type === "percentage"
                  ? `${settings.fee_value}%`
                  : formatAdminCurrency(settings.fee_value)}
                {` · SLA ${settings.sla_business_days} business days`}
              </span>
            </div>
          ) : null}
        </div>
      </AdminPanel>

      <div className="flex flex-wrap gap-2">
        {["pending", "approved", "paid", "rejected", "all"].map((s) => (
          <button
            key={s}
            type="button"
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              status === s ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
            onClick={() => setStatus(s)}
          >
            {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      <AdminMutationAlert errors={[approveM.error, rejectM.error, markPaidM.error, settingsPatchM.error]} />

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2">Request</th>
              <th className="px-3 py-2">Customer</th>
              <th className="px-3 py-2">Bank</th>
              <th className="px-3 py-2">Amount</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-gray-500">
                  No requests in this filter.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const st = row.status ?? "pending";
                const badge = STATUS_BADGE[st] ?? "bg-gray-100 text-gray-700";
                return (
                  <tr key={row.id} className="border-t border-gray-100">
                    <td className="px-3 py-2 font-mono text-xs">{row.request_number ?? row.id.slice(0, 8)}</td>
                    <td className="px-3 py-2">
                      <div>{row.customer?.full_name ?? "—"}</div>
                      <div className="text-xs text-gray-500">{row.customer?.email ?? ""}</div>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <div>{row.bank_name ?? row.bank_code ?? "—"}</div>
                      <div>{row.account_name ?? "—"}</div>
                      <div className="font-mono">
                        {revealedNumbers[row.id]
                          ? revealedNumbers[row.id]
                          : row.account_number_last4
                            ? `•••• ${row.account_number_last4}`
                            : "—"}
                      </div>
                      {st === "approved" && !revealedNumbers[row.id] ? (
                        <button
                          type="button"
                          className="mt-1 text-xs underline"
                          disabled={revealM.isPending}
                          onClick={() => revealM.mutate(row.id)}
                        >
                          Reveal number
                        </button>
                      ) : null}
                      {row.bank_transfer_reference ? (
                        <div className="text-gray-500">Ref: {row.bank_transfer_reference}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      <div>{formatAdminCurrency(Number(row.amount ?? 0), row.currency ?? undefined)}</div>
                      {Number(row.fee_amount ?? 0) > 0 ? (
                        <div className="text-xs text-gray-500">
                          Fee {formatAdminCurrency(Number(row.fee_amount), row.currency ?? undefined)}
                        </div>
                      ) : null}
                      <div className="text-xs font-medium">
                        Pay {formatAdminCurrency(Number(row.net_amount ?? row.amount ?? 0), row.currency ?? undefined)}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`rounded px-2 py-0.5 text-xs ${badge}`}>{st}</span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {st === "pending" ? (
                          <>
                            <button
                              type="button"
                              className="rounded bg-blue-600 px-2 py-1 text-xs text-white"
                              disabled={approveM.isPending}
                              onClick={() => approveM.mutate(row.id)}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              className="rounded border px-2 py-1 text-xs"
                              onClick={() => {
                                setRejectId(row.id);
                                setRejectReason("");
                              }}
                            >
                              Reject
                            </button>
                          </>
                        ) : null}
                        {st === "approved" ? (
                          <>
                          <button
                            type="button"
                            className="rounded border px-2 py-1 text-xs"
                            onClick={() => {
                              setRejectId(row.id);
                              setRejectReason("");
                            }}
                          >
                            Reject
                          </button>
                          <button
                            type="button"
                            className="rounded bg-green-700 px-2 py-1 text-xs text-white"
                            onClick={() => {
                              setMarkPaidId(row.id);
                              setTransferRef("");
                            }}
                          >
                            Mark paid
                          </button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <AdminModal
        open={Boolean(rejectId)}
        title="Reject wallet bank refund"
        onClose={() => setRejectId(null)}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" className="rounded border px-3 py-1 text-sm" onClick={() => setRejectId(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="rounded bg-red-600 px-3 py-1 text-sm text-white"
              disabled={!rejectReason.trim() || rejectM.isPending}
              onClick={() => rejectId && rejectM.mutate({ id: rejectId, reason: rejectReason.trim() })}
            >
              Reject
            </button>
          </div>
        }
      >
        <textarea
          className="mt-2 w-full rounded border p-2 text-sm"
          rows={3}
          placeholder="Reason (included in the customer's notification)"
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
        />
      </AdminModal>

      <AdminModal
        open={Boolean(markPaidId)}
        title="Mark EFT paid"
        onClose={() => setMarkPaidId(null)}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" className="rounded border px-3 py-1 text-sm" onClick={() => setMarkPaidId(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="rounded bg-green-700 px-3 py-1 text-sm text-white"
              disabled={!transferRef.trim() || markPaidM.isPending}
              onClick={() =>
                markPaidId && markPaidM.mutate({ id: markPaidId, transfer_reference: transferRef.trim() })
              }
            >
              Confirm paid
            </button>
          </div>
        }
      >
        <label className="text-sm font-medium">Bank transfer reference</label>
        <input
          className="mt-1 w-full rounded border px-2 py-1 text-sm"
          value={transferRef}
          onChange={(e) => setTransferRef(e.target.value)}
          placeholder="e.g. EFT ref or batch id"
        />
      </AdminModal>
    </div>
  );
}
