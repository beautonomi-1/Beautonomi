import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_FINANCE } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { EmptyState } from "@/components/ui/EmptyState";
import { adminToast } from "@/lib/adminToast";
import {
  AdminDataTable,
  AdminTableBody,
  AdminTableHead,
  AdminTh,
  AdminTd,
} from "@/components/admin/AdminDataTable";
import { adminToolbarButtonClass } from "@/lib/adminUi";

interface WalletMismatch {
  user_id: string;
  wallet_id: string;
  wallet_balance: number;
  transaction_sum: number;
  difference: number;
  currency: string;
}

interface ReconciliationPayload {
  mismatches: WalletMismatch[];
  total_mismatches: number;
  checked: number;
  healthy: number;
}

const QK = adminQueryKeys.finance.walletReconciliation();

export function WalletReconciliationPage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_FINANCE, "Finance access is required.");
  useAdminDocumentTitle("Wallet Reconciliation");
  const qc = useQueryClient();

  const [mismatchesOnly, setMismatchesOnly] = useState(false);

  const q = useQuery({
    queryKey: QK,
    queryFn: () => adminApi.getJson<ReconciliationPayload>("/api/admin/finance/wallet-reconciliation"),
    enabled: allowed,
  });

  const fixMut = useMutation({
    mutationFn: (walletId: string) =>
      adminApi.patchJson("/api/admin/finance/wallet-reconciliation", { wallet_id: walletId }),
    onSuccess: () => {
      adminToast.success("Wallet balance corrected.");
      void qc.invalidateQueries({ queryKey: QK });
    },
    onError: (err: Error) => adminToast.error(err.message || "Failed to fix wallet balance"),
  });

  if (denied) return denied;
  if (q.isLoading)
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Wallet Reconciliation" />
        <AdminPanel><AdminPageSkeleton rows={4} /></AdminPanel>
      </div>
    );
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Wallet Reconciliation" />
        <AdminPanel><AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} /></AdminPanel>
      </div>
    );
  }

  const { mismatches = [], checked = 0, healthy = 0, total_mismatches = 0 } = q.data ?? {};

  const rows = mismatchesOnly ? mismatches : mismatches;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Wallet Reconciliation"
        description="Verify that stored wallet balances match the sum of wallet transactions. Fix any drifted balances."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <AdminPanel>
          <p className="text-xs font-medium text-gray-500">Wallets checked</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{checked}</p>
        </AdminPanel>
        <AdminPanel>
          <p className="text-xs font-medium text-gray-500">Healthy</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-600">{healthy}</p>
        </AdminPanel>
        <AdminPanel>
          <p className="text-xs font-medium text-gray-500">Mismatches</p>
          <p className="mt-1 text-2xl font-semibold text-red-600">{total_mismatches}</p>
        </AdminPanel>
      </div>

      <AdminPanel>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-gray-900">Wallet balances</h2>
            <label className="flex items-center gap-1.5 text-xs text-gray-600">
              <input
                type="checkbox"
                checked={mismatchesOnly}
                onChange={(e) => setMismatchesOnly(e.target.checked)}
                className="rounded border-gray-300"
              />
              Mismatches only
            </label>
          </div>
          <button
            type="button"
            className={adminToolbarButtonClass(q.isFetching)}
            disabled={q.isFetching}
            onClick={() => void q.refetch()}
          >
            {q.isFetching ? "Checking…" : "Re-check"}
          </button>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            title={mismatchesOnly ? "No mismatches" : "No wallets found"}
            description={
              mismatchesOnly
                ? "All wallet balances match their transaction history."
                : "No wallet data was returned."
            }
          />
        ) : (
          <AdminDataTable>
            <AdminTableHead>
              <tr>
                <AdminTh>User ID</AdminTh>
                <AdminTh>Wallet ID</AdminTh>
                <AdminTh>Stored balance</AdminTh>
                <AdminTh>Calculated</AdminTh>
                <AdminTh>Difference</AdminTh>
                <AdminTh>Currency</AdminTh>
                <AdminTh>Actions</AdminTh>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {rows.map((row) => (
                <tr key={row.wallet_id}>
                  <AdminTd className="font-mono text-xs">{row.user_id.slice(0, 8)}…</AdminTd>
                  <AdminTd className="font-mono text-xs">{row.wallet_id.slice(0, 8)}…</AdminTd>
                  <AdminTd>{row.wallet_balance.toFixed(2)}</AdminTd>
                  <AdminTd>{row.transaction_sum.toFixed(2)}</AdminTd>
                  <AdminTd>
                    <span className={row.difference === 0 ? "text-gray-500" : "font-medium text-red-600"}>
                      {row.difference > 0 ? "+" : ""}
                      {row.difference.toFixed(2)}
                    </span>
                  </AdminTd>
                  <AdminTd>{row.currency}</AdminTd>
                  <AdminTd>
                    {row.difference !== 0 && (
                      <button
                        type="button"
                        disabled={fixMut.isPending}
                        onClick={() => {
                          if (
                            confirm(
                              `Set wallet ${row.wallet_id.slice(0, 8)}… balance from ${row.wallet_balance.toFixed(2)} to ${row.transaction_sum.toFixed(2)}?`,
                            )
                          )
                            fixMut.mutate(row.wallet_id);
                        }}
                        className="rounded border border-blue-200 px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 disabled:opacity-50"
                      >
                        Fix balance
                      </button>
                    )}
                  </AdminTd>
                </tr>
              ))}
            </AdminTableBody>
          </AdminDataTable>
        )}
      </AdminPanel>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-xs text-gray-600">
        <strong>How wallet reconciliation works:</strong>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li>Each wallet&apos;s stored <code className="rounded bg-gray-100 px-1">balance</code> is compared against <code className="rounded bg-gray-100 px-1">SUM(credits) - SUM(debits)</code> from <code className="rounded bg-gray-100 px-1">wallet_transactions</code>.</li>
          <li>Differences greater than 0.01 are flagged as mismatches.</li>
          <li>&ldquo;Fix balance&rdquo; sets the stored balance to the calculated value. This does <em>not</em> create a correcting transaction.</li>
          <li>Up to 1 000 wallets are checked per request (ordered by most recently updated).</li>
        </ul>
      </div>
    </div>
  );
}
