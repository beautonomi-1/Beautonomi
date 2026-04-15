import { useState } from "react";
import { Link } from "react-router-dom";
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
import { adminSpaTo } from "@/lib/adminSpaPath";
import { cn } from "@/lib/cn";

interface WalletMismatch {
  user_id: string;
  wallet_id: string;
  wallet_balance: number;
  transaction_sum: number;
  difference: number;
  currency: string;
  user_email: string | null;
  user_full_name: string | null;
  user_phone: string | null;
  user_role: string | null;
  account_kind: "customer" | "provider" | "provider_staff" | "admin" | "other";
  account_kind_label: string;
  provider_id: string | null;
  provider_business_name: string | null;
}

interface ReconciliationPayload {
  mismatches: WalletMismatch[];
  checked_wallets?: WalletMismatch[];
  total_mismatches: number;
  checked: number;
  healthy: number;
}

const QK = adminQueryKeys.finance.walletReconciliation();

function accountKindBadgeClass(kind: WalletMismatch["account_kind"]): string {
  switch (kind) {
    case "customer":
      return "bg-sky-100 text-sky-900";
    case "provider":
      return "bg-violet-100 text-violet-900";
    case "provider_staff":
      return "bg-indigo-100 text-indigo-900";
    case "admin":
      return "bg-slate-200 text-slate-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

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
        <AdminPanel>
          <AdminPageSkeleton rows={4} />
        </AdminPanel>
      </div>
    );
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Wallet Reconciliation" />
        <AdminPanel>
          <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />
        </AdminPanel>
      </div>
    );
  }

  const { mismatches = [], checked_wallets, checked = 0, healthy = 0, total_mismatches = 0 } = q.data ?? {};

  const fullList = checked_wallets?.length ? checked_wallets : mismatches;
  const rows = mismatchesOnly ? mismatches : fullList;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Wallet Reconciliation"
        description="Stored wallet balances vs ledger sums. Identify the account, then fix drift or open the user to post an admin credit."
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

        {checked > 0 && rows.length === 0 && !mismatchesOnly && total_mismatches === 0 && (!checked_wallets || checked_wallets.length === 0) ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/90 px-4 py-6 text-center">
            <p className="text-sm font-medium text-emerald-900">
              All {checked} wallet{checked === 1 ? "" : "s"} in scope match transaction totals.
            </p>
            <p className="mt-1 text-xs text-emerald-800/90">
              Stored balances equal the sum of wallet credits minus debits.
            </p>
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            title={
              checked === 0
                ? "No wallets in scope"
                : mismatchesOnly
                  ? "No mismatches"
                  : "No rows to show"
            }
            description={
              checked === 0
                ? "No wallets matched this tenant’s transaction scope, or wallet data is empty."
                : mismatchesOnly
                  ? "All checked wallet balances match their transaction history."
                  : "No wallet rows available."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <AdminDataTable>
              <AdminTableHead>
                <tr>
                  <AdminTh>Person</AdminTh>
                  <AdminTh>Account</AdminTh>
                  <AdminTh>Provider / org</AdminTh>
                  <AdminTh>Contact</AdminTh>
                  <AdminTh>Stored</AdminTh>
                  <AdminTh>From ledger</AdminTh>
                  <AdminTh>Diff</AdminTh>
                  <AdminTh>CCY</AdminTh>
                  <AdminTh>Actions</AdminTh>
                </tr>
              </AdminTableHead>
              <AdminTableBody>
                {rows.map((row) => {
                  const displayName = row.user_full_name?.trim() || "—";
                  const email = row.user_email?.trim() || "";
                  const userHref = adminSpaTo(`/admin/users/${encodeURIComponent(row.user_id)}`);
                  const providerHref = row.provider_id
                    ? adminSpaTo(`/admin/providers/${encodeURIComponent(row.provider_id)}`)
                    : null;
                  return (
                    <tr key={row.wallet_id}>
                      <AdminTd className="min-w-[10rem]">
                        <div className="font-medium text-gray-900">{displayName}</div>
                        {email ? (
                          <div className="text-xs text-gray-600">{email}</div>
                        ) : (
                          <div className="text-xs text-gray-400">No email on file</div>
                        )}
                        <div className="mt-1 font-mono text-[10px] text-gray-400" title={row.user_id}>
                          user {row.user_id}
                        </div>
                      </AdminTd>
                      <AdminTd>
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
                            accountKindBadgeClass(row.account_kind)
                          )}
                        >
                          {row.account_kind_label}
                        </span>
                        {row.user_role ? (
                          <div className="mt-1 text-[10px] text-gray-500">role: {row.user_role}</div>
                        ) : null}
                      </AdminTd>
                      <AdminTd className="max-w-[12rem]">
                        {row.provider_business_name ? (
                          <>
                            <span className="text-sm text-gray-900">{row.provider_business_name}</span>
                            {providerHref ? (
                              <Link className="mt-1 block text-xs font-medium text-primary underline" to={providerHref}>
                                Open provider
                              </Link>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </AdminTd>
                      <AdminTd className="text-xs text-gray-700">
                        {row.user_phone ? <span className="tabular-nums">{row.user_phone}</span> : "—"}
                      </AdminTd>
                      <AdminTd className="tabular-nums">{row.wallet_balance.toFixed(2)}</AdminTd>
                      <AdminTd className="tabular-nums">{row.transaction_sum.toFixed(2)}</AdminTd>
                      <AdminTd>
                        <span
                          className={
                            Math.abs(row.difference) < 0.011 ? "text-emerald-700" : "font-medium text-red-600"
                          }
                        >
                          {row.difference > 0 ? "+" : ""}
                          {row.difference.toFixed(2)}
                        </span>
                      </AdminTd>
                      <AdminTd>{row.currency}</AdminTd>
                      <AdminTd>
                        <div className="flex flex-col gap-1.5">
                          <Link
                            className="text-xs font-medium text-primary underline"
                            to={userHref}
                            title="Open user — wallet top-up lives on this page (Users & trust permission)"
                          >
                            User profile → credit
                          </Link>
                          {Math.abs(row.difference) > 0.011 ? (
                            <button
                              type="button"
                              disabled={fixMut.isPending}
                              onClick={() => {
                                if (
                                  confirm(
                                    `Set stored balance from ${row.wallet_balance.toFixed(2)} to ${row.transaction_sum.toFixed(2)} (${row.currency})?\n\nThis only fixes the stored number to match the sum of ledger rows — it does not add a new transaction.`,
                                  )
                                )
                                  fixMut.mutate(row.wallet_id);
                              }}
                              className="rounded border border-blue-200 px-2 py-1 text-left text-xs text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                            >
                              Fix balance
                            </button>
                          ) : null}
                        </div>
                      </AdminTd>
                    </tr>
                  );
                })}
              </AdminTableBody>
            </AdminDataTable>
          </div>
        )}
      </AdminPanel>

      <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4 text-xs text-gray-700">
        <p>
          <strong>Credit (add funds):</strong> Open <strong>User profile → Credit</strong> (same as{" "}
          <strong>Wallet top-up</strong> on the user screen). That calls the ledger and increases balance with a{" "}
          <code className="rounded bg-gray-100 px-1">credit</code> line. Requires{" "}
          <strong>Users &amp; trust</strong> permission in addition to finance visibility for refunds—if you only see
          Finance, ask a trust admin to run the top-up or extend your role.
        </p>
        <p>
          <strong>Debit (remove funds):</strong> Customer wallets are normally debited by checkout and bookings. There is
          no separate &ldquo;admin debit&rdquo; button here; use booking/refund flows or support for edge cases.
        </p>
        <p>
          <strong>Fix balance:</strong> Use when the stored balance drifted but the{" "}
          <strong>ledger sum is correct</strong>. It sets <code className="rounded bg-gray-100 px-1">user_wallets.balance</code> to
          match the sum of <code className="rounded bg-gray-100 px-1">wallet_transactions</code> — it does{" "}
          <em>not</em> insert a correcting transaction.
        </p>
        <ul className="list-inside list-disc space-y-1 text-gray-600">
          <li>Compared: stored balance vs sum of credits minus debits in <code className="rounded bg-gray-100 px-1">wallet_transactions</code>.</li>
          <li>Up to 1 000 wallets per run (most recently updated).</li>
        </ul>
      </div>
    </div>
  );
}
