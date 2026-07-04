import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { adminToast } from "@/lib/adminToast";
import { useAdminSession } from "@/providers/AdminSessionProvider";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { EmptyState } from "@/components/ui/EmptyState";
import { adminToolbarButtonClass } from "@/lib/adminUi";
import { cn } from "@/lib/cn";
import {
  AdminDataTable,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
} from "@/components/admin/AdminDataTable";
import { ProviderBankAccountModal } from "../ProviderBankAccountModal";
import { ProviderMarketingCreditsPanel } from "@/components/marketing/ProviderMarketingCreditsPanel";
import { str } from "./types";

type Props = {
  id: string;
  providerCanonicalId: string;
  marketingUsePlatformCredentials: boolean | null;
  hasFinanceAccess: boolean;
};

type PayoutAccountRow = Record<string, unknown> & {
  id?: string;
  type?: string;
  account_name?: string | null;
  account_number_last4?: string | null;
  bank_name?: string | null;
  bank_code?: string | null;
  currency?: string;
  active?: boolean;
  is_primary?: boolean;
  created_at?: string;
};

type TxSummaryRow = { gross: number; fees: number; commission: number; net: number; refunds: number; payouts: number };
type TxLedgerRow = { id: string; transaction_type: string; amount: number; fees: number; commission: number; net: number; created_at?: string; booking?: { id: string; booking_number?: string } | null };
type TxLedgerMeta = { page: number; limit: number; total: number; has_more: boolean };
type TxLedgerResponse = { data: TxLedgerRow[]; summary: TxSummaryRow | null; meta: TxLedgerMeta };

type SubscriptionRow = {
  id: string;
  plan_id?: string;
  status?: string;
  current_period_start?: string | null;
  current_period_end?: string | null;
  billing_period?: string | null;
  auto_renew?: boolean | null;
  subscription_plans?: { id?: string; name?: string | null; price_monthly?: number | null; is_free?: boolean | null } | null;
  providers?: { id?: string; business_name?: string | null } | null;
};

const TX_LABEL: Record<string, string> = {
  payment: "Payment", wallet_payment: "Wallet", gift_card_payment: "Gift card",
  provider_earnings: "Earnings", tip: "Tip", travel_fee: "Travel fee",
  cancellation_fee: "Cancellation", platform_fee: "Platform fee",
  service_fee: "Service fee", commission: "Commission",
  refund: "Refund", payout: "Payout",
};

const SUBSCRIPTION_STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  trialing: "bg-blue-100 text-blue-800",
  past_due: "bg-amber-100 text-amber-800",
  canceled: "bg-gray-100 text-gray-600",
  paused: "bg-purple-100 text-purple-800",
};

export function ProviderFinanceTab({
  id,
  providerCanonicalId,
  marketingUsePlatformCredentials,
  hasFinanceAccess,
}: Props) {
  const qc = useQueryClient();
  const { bootstrap } = useAdminSession();
  const isSuperadmin = bootstrap?.isSuperadmin === true;

  const [showAddBankAccount, setShowAddBankAccount] = useState(false);
  const [txType, setTxType] = useState("all");
  const [txStart, setTxStart] = useState("");
  const [txEnd, setTxEnd] = useState("");
  const [txTypeDraft, setTxTypeDraft] = useState("all");
  const [txStartDraft, setTxStartDraft] = useState("");
  const [txEndDraft, setTxEndDraft] = useState("");
  const [txPage, setTxPage] = useState(1);

  const txQs = new URLSearchParams({ page: String(txPage), limit: "50" });
  if (txType && txType !== "all") txQs.set("type", txType);
  if (txStart) txQs.set("start_date", txStart);
  if (txEnd) txQs.set("end_date", txEnd);
  const txQsString = txQs.toString();

  const payoutAccountsQ = useQuery({
    queryKey: adminQueryKeys.providers.payoutAccounts(providerCanonicalId),
    queryFn: () =>
      adminApi.getJson<PayoutAccountRow[]>(
        `/api/admin/providers/${encodeURIComponent(providerCanonicalId)}/payout-accounts`,
        { timeoutMs: 60_000 },
      ),
    enabled: !!providerCanonicalId,
  });

  const txQ = useQuery({
    queryKey: adminQueryKeys.providers.transactions(providerCanonicalId, txQsString),
    queryFn: () =>
      adminApi.getJson<TxLedgerResponse>(
        `/api/admin/providers/${encodeURIComponent(providerCanonicalId)}/transactions?${txQsString}`,
        { timeoutMs: 60_000 },
      ),
    enabled: !!providerCanonicalId,
    placeholderData: (prev) => prev,
  });

  const subscriptionsQ = useQuery({
    queryKey: adminQueryKeys.providers.subscriptions(providerCanonicalId),
    queryFn: () =>
      adminApi.getJson<{ subscriptions: SubscriptionRow[] }>(
        `/api/admin/provider-subscriptions?provider_id=${encodeURIComponent(providerCanonicalId)}&limit=5`,
        { timeoutMs: 30_000 },
      ),
    enabled: hasFinanceAccess && !!providerCanonicalId,
  });

  const patchSubscription = useMutation({
    mutationFn: ({ subId, status }: { subId: string; status: string }) =>
      adminApi.patchJson(`/api/admin/provider-subscriptions/${encodeURIComponent(subId)}`, { status }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providers.subscriptions(providerCanonicalId) });
      adminToast.success("Subscription updated");
    },
    onError: (e: Error) => adminToast.error(`Failed to update subscription: ${e.message}`),
  });

  const cur = new Intl.NumberFormat(undefined, { style: "currency", currency: "ZAR", maximumFractionDigits: 2 }).format;

  return (
    <div className="space-y-6">
      {/* ── Subscription / billing ───────────────────────────────── */}
      {hasFinanceAccess && (
        <AdminPanel>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Subscription &amp; billing</h2>
              <p className="mt-1 text-sm text-gray-600">Current and recent platform subscriptions for this provider.</p>
            </div>
          </div>

          {subscriptionsQ.isLoading ? (
            <p className="mt-4 text-sm text-gray-400">Loading subscriptions…</p>
          ) : (subscriptionsQ.data?.subscriptions ?? []).length === 0 ? (
            <EmptyState title="No subscriptions" description="This provider has no active or historical platform subscriptions." />
          ) : (
            <AdminDataTable className="mt-4">
              <AdminTableHead>
                <tr>
                  <AdminTh>Plan</AdminTh>
                  <AdminTh>Status</AdminTh>
                  <AdminTh>Billing</AdminTh>
                  <AdminTh>Auto-renew</AdminTh>
                  <AdminTh>Actions</AdminTh>
                </tr>
              </AdminTableHead>
              <AdminTableBody>
                {(subscriptionsQ.data?.subscriptions ?? []).map((sub) => (
                  <tr key={sub.id} className="hover:bg-gray-50/60">
                    <AdminTd className="font-medium">
                      {sub.subscription_plans?.name ?? sub.plan_id ?? "—"}
                      {sub.subscription_plans?.is_free ? (
                        <span className="ml-2 text-xs text-gray-400">free</span>
                      ) : null}
                    </AdminTd>
                    <AdminTd>
                      <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                        SUBSCRIPTION_STATUS_COLORS[sub.status ?? ""] ?? "bg-gray-100 text-gray-600")}>
                        {sub.status ?? "unknown"}
                      </span>
                    </AdminTd>
                    <AdminTd className="text-xs capitalize text-gray-600">{sub.billing_period ?? "—"}</AdminTd>
                    <AdminTd className="text-xs">{sub.auto_renew ? "Yes" : "No"}</AdminTd>
                    <AdminTd>
                      {isSuperadmin && sub.status === "active" ? (
                        <button
                          type="button"
                          className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
                          disabled={patchSubscription.isPending}
                          onClick={() => {
                            if (window.confirm("Cancel this subscription?")) {
                              patchSubscription.mutate({ subId: sub.id, status: "cancelled" });
                            }
                          }}
                        >
                          Cancel
                        </button>
                      ) : "—"}
                    </AdminTd>
                  </tr>
                ))}
              </AdminTableBody>
            </AdminDataTable>
          )}
        </AdminPanel>
      )}

      {/* ── Payout accounts ──────────────────────────────────────── */}
      <AdminPanel>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Payout accounts</h2>
            <p className="mt-1 text-sm text-gray-600">
              Bank / transfer recipients on file (masked account details).
            </p>
          </div>
          {providerCanonicalId && (
            <button
              type="button"
              className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
              onClick={() => setShowAddBankAccount(true)}
            >
              Add bank account
            </button>
          )}
        </div>

        {providerCanonicalId && (
          <ProviderBankAccountModal
            open={showAddBankAccount}
            onClose={() => setShowAddBankAccount(false)}
            providerId={providerCanonicalId}
          />
        )}

        {payoutAccountsQ.isLoading ? (
          <p className="mt-4 text-sm text-gray-500">Loading payout accounts…</p>
        ) : (payoutAccountsQ.data ?? []).length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">No payout accounts.</p>
        ) : (
          <AdminDataTable className="mt-4">
            <AdminTableHead>
              <tr>
                <AdminTh>Type</AdminTh>
                <AdminTh>Bank</AdminTh>
                <AdminTh>Account</AdminTh>
                <AdminTh>Currency</AdminTh>
                <AdminTh>Status</AdminTh>
                <AdminTh>Created</AdminTh>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {(payoutAccountsQ.data ?? []).map((acc) => (
                <tr key={str(acc.id)} className="hover:bg-gray-50/60">
                  <AdminTd>{str(acc.type)}</AdminTd>
                  <AdminTd>{str(acc.bank_name) || str(acc.bank_code) || "—"}</AdminTd>
                  <AdminTd>
                    {str(acc.account_name) || "—"}
                    {acc.account_number_last4 ? (
                      <span className="text-gray-500"> · •••• {str(acc.account_number_last4)}</span>
                    ) : null}
                  </AdminTd>
                  <AdminTd>{str(acc.currency) || "—"}</AdminTd>
                  <AdminTd>
                    {acc.active === false ? "Inactive" : "Active"}
                    {acc.is_primary ? <span className="ml-2 text-xs text-primary">primary</span> : null}
                  </AdminTd>
                  <AdminTd className="text-xs text-gray-500">
                    {acc.created_at ? new Date(String(acc.created_at)).toLocaleDateString() : "—"}
                  </AdminTd>
                </tr>
              ))}
            </AdminTableBody>
          </AdminDataTable>
        )}
      </AdminPanel>

      {/* ── Marketing credits ────────────────────────────────────── */}
      {id ? (
        <ProviderMarketingCreditsPanel
          providerId={id}
          marketingUsePlatformCredentials={marketingUsePlatformCredentials}
        />
      ) : null}

      {/* ── Transaction ledger ───────────────────────────────────── */}
      <AdminPanel>
        <h2 className="text-base font-semibold text-gray-900">Transactions</h2>
        <p className="mt-0.5 text-sm text-gray-500">Finance ledger: payments, earnings, fees, refunds, tips, payouts.</p>

        {txQ.data?.summary ? (
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {(
              [
                { label: "Gross", value: txQ.data.summary.gross },
                { label: "Fees", value: txQ.data.summary.fees },
                { label: "Commission", value: txQ.data.summary.commission },
                { label: "Net earnings", value: txQ.data.summary.net },
                { label: "Refunds", value: txQ.data.summary.refunds },
                { label: "Payouts", value: txQ.data.summary.payouts },
              ] as { label: string; value: number }[]
            ).map(({ label, value }) => (
              <div key={label} className="rounded-xl border border-gray-100 bg-gray-50/60 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
                <p className="mt-1 text-base font-semibold tabular-nums text-gray-900">{cur(value)}</p>
              </div>
            ))}
          </div>
        ) : null}

        {/* Filters */}
        <div className="mt-4 flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Type</label>
            <select
              value={txTypeDraft}
              onChange={(e) => setTxTypeDraft(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm"
            >
              <option value="all">All types</option>
              <option value="payment">Payments</option>
              <option value="earnings">Earnings</option>
              <option value="fee">Fees</option>
              <option value="refund">Refunds</option>
              <option value="payout">Payouts</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">From</label>
            <input type="date" value={txStartDraft} onChange={(e) => setTxStartDraft(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">To</label>
            <input type="date" value={txEndDraft} onChange={(e) => setTxEndDraft(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm" />
          </div>
          <button
            type="button"
            onClick={() => { setTxType(txTypeDraft); setTxStart(txStartDraft); setTxEnd(txEndDraft); setTxPage(1); }}
            className={adminToolbarButtonClass(txQ.isFetching)}
            disabled={txQ.isFetching}
          >
            {txQ.isFetching ? "Loading…" : "Apply"}
          </button>
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200">
          {txQ.isLoading ? (
            <p className="p-6 text-sm text-gray-400 text-center">Loading transactions…</p>
          ) : (txQ.data?.data ?? []).length === 0 ? (
            <p className="p-6 text-sm text-gray-500 text-center">No transactions for this period.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 text-right">Net</th>
                  <th className="px-4 py-3 text-left">Booking</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(txQ.data?.data ?? []).map((tx) => (
                  <tr key={tx.id} className="hover:bg-gray-50/60">
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {tx.created_at ? new Date(tx.created_at).toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                        {TX_LABEL[tx.transaction_type] ?? tx.transaction_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">{cur(tx.amount)}</td>
                    <td className={`px-4 py-3 text-right tabular-nums font-semibold ${tx.net < 0 ? "text-red-600" : "text-green-700"}`}>
                      {cur(tx.net)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">
                      {tx.booking?.booking_number ?? (tx.booking?.id ? `…${tx.booking.id.slice(-6)}` : "—")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {((txQ.data?.meta?.total ?? 0) > (txQ.data?.meta?.limit ?? 50)) && (
          <div className="mt-3 flex items-center justify-between text-sm text-gray-500">
            <span>
              {((txPage - 1) * (txQ.data?.meta?.limit ?? 50)) + 1}–
              {Math.min(txPage * (txQ.data?.meta?.limit ?? 50), txQ.data?.meta?.total ?? 0)} of {txQ.data?.meta?.total ?? 0}
            </span>
            <div className="flex gap-2">
              <button type="button" disabled={txPage <= 1 || txQ.isFetching}
                onClick={() => setTxPage((p) => p - 1)}
                className={adminToolbarButtonClass(txPage <= 1 || txQ.isFetching)}>
                Previous
              </button>
              <button type="button" disabled={!txQ.data?.meta?.has_more || txQ.isFetching}
                onClick={() => setTxPage((p) => p + 1)}
                className={adminToolbarButtonClass(!txQ.data?.meta?.has_more || txQ.isFetching)}>
                Next
              </button>
            </div>
          </div>
        )}
      </AdminPanel>
    </div>
  );
}
