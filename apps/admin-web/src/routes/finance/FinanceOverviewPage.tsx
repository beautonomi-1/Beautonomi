import { useCallback, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Download, TrendingDown, TrendingUp } from "lucide-react";
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
import { useTenantFeatureFlags, TENANT_PAYMENT_FEATURE_KEYS } from "@/hooks/useTenantFeatureFlags";
import { formatAdminCurrency, formatAdminNumber } from "@/lib/adminFormatCurrency";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { adminToolbarButtonClass } from "@/lib/adminUi";
import {
  AdminDataTable,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
} from "@/components/admin/AdminDataTable";
import { EmptyState } from "@/components/ui/EmptyState";

const TX_LIMIT = 50;

type FinancePeriod = { start_date: string | null; end_date: string | null; defaulted?: boolean };

type FinanceSummary = {
  service_collected_gross: number;
  service_collected_net: number;
  gateway_fees: number;
  gateway_fees_total?: number;
  gateway_fees_breakdown?: {
    services?: number;
    terminal?: number;
    subscription?: number;
    ads?: number;
    marketing_credits?: number;
    gift_card_wallet?: number;
    membership?: number;
    payout_transfers?: number;
    total?: number;
  };
  terminal_commerce?: {
    revenue_gross?: number;
    gateway_fees?: number;
    order_count?: number;
  };
  platform_commission_gross: number;
  platform_refund_impact: number;
  platform_commission_net: number;
  platform_take_net: number;
  tips_gross: number;
  taxes_gross: number;
  subscription_collected_gross: number;
  subscription_net: number;
  subscription_gateway_fees: number;
  ads_net: number;
  ads_gross: number;
  ads_gateway_fees: number;
  marketing_credit_net?: number;
  marketing_credit_gross?: number;
  marketing_credit_gateway_fees?: number;
  total_platform_take_net: number;
  provider_earnings: number;
  cancellation_fees_retained: number;
  refunds_gross: number;
  gift_card_sales: number;
  membership_sales: number;
  promotion_discounts?: number;
  membership_discounts?: number;
  loyalty_discounts?: number;
  loyalty_redemptions?: number;
  wallet_topup_ledger?: number;
  payouts_paid_total?: number;
  travel_fees?: number;
  walk_in_additional_charges?: number;
  service_fee_revenue?: number;
  wallet_topup_revenue: number;
  referral_payouts: number;
  total_platform_take_after_referrals: number;
  gmv_growth: number;
  period: FinancePeriod;
  platform_revenue?: {
    booking_commission?: number;
    customer_paid_platform_fees?: number;
    subscriptions?: number;
    ads?: number;
    marketing_credits?: number;
    service_fees?: number;
    ecommerce_fees_detail?: number;
    wallet_topups?: number;
    total?: number;
    total_after_referrals?: number;
  };
  provider_revenue?: {
    provider_earnings?: number;
    cancellation_fees?: number;
    tips?: number;
    travel_fees?: number;
    walk_in_additional_charges?: number;
    taxes_collected?: number;
    refunds?: number;
    refund_impact_net?: number;
    net_after_refunds?: number;
    payouts_paid_total?: number;
  };
  liabilities?: {
    wallet_topups_cash_collected?: number;
    gift_card_outstanding?: number;
  };
  pass_through?: {
    taxes_collected?: number;
    tips_collected?: number;
  };
  reconciliation?: {
    generated_at?: string;
    checks?: {
      ledger_vs_bookings_gmv?: {
        ledger_gmv?: number;
        bookings_gmv?: number;
        gross_bookings_gmv?: number;
        walk_in_deduction?: number;
        variance?: number;
        variance_pct?: number | null;
        status?: string;
        basis_note?: string;
      };
      gateway_fee_capture_anomalies?: {
        row_count?: number;
        expected_fees_total?: number;
        status?: string;
      };
      negative_provider_payout_balances?: { count?: number; status?: string };
      refund_burden_pressure?: { provider_refund_impact?: number; provider_earnings?: number; status?: string };
      platform_net_health?: { platform_net?: number; status?: string };
    };
  };
  metrics_meta?: {
    contract_version?: string;
    generated_at?: string;
    contracts?: Array<{
      key: string;
      label: string;
      formula: string;
      source: string[];
      timezone: string;
      cadence: string;
    }>;
  };
  language_context?: {
    audience?: string;
    glossary?: Record<string, string>;
  };
  negative_balance_providers?: {
    count: number;
    providers: Array<{
      provider_id: string;
      raw_balance: number;
      business_name: string | null;
      slug: string | null;
    }>;
  };
};

type FinanceTransaction = {
  id: string;
  transaction_type: string;
  amount: number;
  fees: number;
  commission: number;
  net: number;
  created_at?: string;
  booking?: { id?: string; booking_number?: string } | null;
};

type TransactionsEnvelope = {
  data: FinanceTransaction[];
  meta?: { page: number; limit: number; total: number; has_more: boolean };
};

function SummaryMetricCard({
  label,
  value,
  trend,
  tooltip,
}: {
  label: string;
  value: number;
  trend?: number;
  /** Optional hover tooltip explaining the metric or an accounting note. */
  tooltip?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm" title={tooltip}>
      <div className="flex items-start justify-between gap-2">
        <span className={`text-xs font-medium text-gray-500 ${tooltip ? "cursor-help underline decoration-dotted" : ""}`}>
          {label}
          {tooltip ? <span className="ml-0.5 text-gray-400">ⓘ</span> : null}
        </span>
        {trend !== undefined && Number.isFinite(trend) ? (
          <span
            className={`inline-flex shrink-0 items-center gap-0.5 text-xs font-medium ${
              trend >= 0 ? "text-green-700" : "text-red-700"
            }`}
            title="vs prior period (settled service GMV)"
          >
            {trend >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
            {formatAdminNumber(Math.abs(trend))}%
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-lg font-semibold tabular-nums text-gray-900">{formatAdminCurrency(value)}</p>
    </div>
  );
}

export function FinanceOverviewPage() {
  useAdminDocumentTitle("Finance");
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_FINANCE,
    "Finance access is required."
  );
  const location = useLocation();
  const navigate = useNavigate();
  /** Avoid `useSearchParams()` here — it can suspend and cause hooks after it to skip on the first render (React #310). */
  const sp = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const setSp = useCallback(
    (next: URLSearchParams, opts?: { replace?: boolean }) => {
      const q = next.toString();
      navigate({ pathname: location.pathname, search: q ? `?${q}` : "" }, { replace: opts?.replace ?? false });
    },
    [location.pathname, navigate]
  );
  const start = sp.get("start_date") ?? "";
  const end = sp.get("end_date") ?? "";
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
  const txType = sp.get("type") || "all";
  const rangeKey = `${start}|${end}`;
  const txFilters = useMemo(
    () => ({ range: rangeKey, page, type: txType, limit: TX_LIMIT }),
    [rangeKey, page, txType]
  );

  const [exportErr, setExportErr] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const [receiptBusyId, setReceiptBusyId] = useState<string | null>(null);
  const [receiptErr, setReceiptErr] = useState<string | null>(null);

  const walletFlagQ = useTenantFeatureFlags([TENANT_PAYMENT_FEATURE_KEYS.PAYMENT_WALLET], allowed);
  const showWalletDisabledBanner =
    walletFlagQ.isSuccess &&
    walletFlagQ.data?.features?.[TENANT_PAYMENT_FEATURE_KEYS.PAYMENT_WALLET] === false;

  const patchParams = useCallback(
    (patch: Record<string, string | null>, resetPage = false) => {
      const next = new URLSearchParams(sp);
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      if (resetPage) next.delete("page");
      setSp(next, { replace: true });
    },
    [setSp, sp]
  );

  const summaryQ = useQuery({
    queryKey: adminQueryKeys.finance.summary(rangeKey),
    queryFn: async () => {
      const p = new URLSearchParams();
      if (start) p.set("start_date", start);
      if (end) p.set("end_date", end);
      const qs = p.toString();
      return adminApi.getJson<FinanceSummary>(`/api/admin/finance/summary${qs ? `?${qs}` : ""}`, {
        timeoutMs: 90_000,
      });
    },
    enabled: allowed,
  });

  const txQ = useQuery({
    queryKey: adminQueryKeys.finance.transactions(txFilters),
    queryFn: async () => {
      const p = new URLSearchParams();
      if (start) p.set("start_date", start);
      if (end) p.set("end_date", end);
      p.set("page", String(page));
      p.set("limit", String(TX_LIMIT));
      if (txType !== "all") p.set("type", txType);
      return adminApi.getRawJson<TransactionsEnvelope>(`/api/admin/finance/transactions?${p}`, {
        timeoutMs: 90_000,
      });
    },
    enabled: allowed,
  });

  const summary = summaryQ.data;
  const transactions = txQ.data?.data ?? [];
  const meta = txQ.data?.meta;
  const total = meta?.total ?? 0;

  /** Booking-side fees vs ledger refund lines (same summary range). */
  const cancellationReconciliation = useMemo(() => {
    if (!summary) return null;
    const cancellationFeesRetained = summary.cancellation_fees_retained ?? 0;
    const ledgerRefundAmountSum = summary.refunds_gross;
    const bookingSideNet = cancellationFeesRetained + ledgerRefundAmountSum;
    return {
      cancellationFeesRetained,
      ledgerRefundAmountSum,
      bookingSideNet,
      platformRefundImpact: summary.platform_refund_impact,
    };
  }, [summary]);

  const platformRevenueDrivers = useMemo(() => {
    if (!summary) return [];
    return [
      { label: "Booking commission (net)", value: summary.platform_revenue?.booking_commission ?? summary.platform_take_net },
      { label: "Customer-paid platform fees", value: summary.platform_revenue?.customer_paid_platform_fees ?? summary.service_fee_revenue ?? 0 },
      { label: "Subscriptions (net)", value: summary.platform_revenue?.subscriptions ?? summary.subscription_net ?? 0 },
      { label: "Ads (net)", value: summary.platform_revenue?.ads ?? summary.ads_net ?? 0 },
      { label: "Marketing credits (net)", value: summary.platform_revenue?.marketing_credits ?? summary.marketing_credit_net ?? 0 },
      { label: "Ecommerce fees detail", value: summary.platform_revenue?.ecommerce_fees_detail ?? 0 },
    ];
  }, [summary]);

  const platformDeductions = useMemo(() => {
    if (!summary) return [];
    return [
      { label: "Platform refund contra", value: Math.abs(summary.platform_refund_impact ?? 0) },
      { label: "Referral payouts", value: Math.abs(summary.referral_payouts ?? 0) },
    ];
  }, [summary]);

  const providerRevenueDrivers = useMemo(() => {
    if (!summary) return [];
    return [
      { label: "Provider service earnings", value: summary.provider_revenue?.provider_earnings ?? summary.provider_earnings ?? 0 },
      { label: "Cancellation fees retained", value: summary.provider_revenue?.cancellation_fees ?? summary.cancellation_fees_retained ?? 0 },
      { label: "Tips (pass-through)", value: summary.provider_revenue?.tips ?? summary.tips_gross ?? 0 },
      { label: "Travel fees (pass-through)", value: summary.provider_revenue?.travel_fees ?? summary.travel_fees ?? 0 },
      {
        label: "Walk-in add-on charges",
        value: summary.provider_revenue?.walk_in_additional_charges ?? summary.walk_in_additional_charges ?? 0,
      },
    ];
  }, [summary]);

  const providerDeductions = useMemo(() => {
    if (!summary) return [];
    return [
      {
        label: "Provider-earnings refund clawback",
        value: Math.abs(summary.provider_revenue?.refund_impact_net ?? 0),
      },
      {
        label: "Payouts paid",
        value: Math.abs(summary.provider_revenue?.payouts_paid_total ?? summary.payouts_paid_total ?? 0),
      },
    ];
  }, [summary]);

  const gatewayFeeBreakdown = useMemo(() => {
    if (!summary?.gateway_fees_breakdown) return [];
    const b = summary.gateway_fees_breakdown;
    return [
      { label: "Booking & add-on charges", value: b.services ?? summary.gateway_fees ?? 0 },
      { label: "Terminal commerce", value: b.terminal ?? 0 },
      { label: "Subscriptions", value: b.subscription ?? summary.subscription_gateway_fees ?? 0 },
      { label: "Ads", value: b.ads ?? summary.ads_gateway_fees ?? 0 },
      { label: "Marketing credits", value: b.marketing_credits ?? summary.marketing_credit_gateway_fees ?? 0 },
      { label: "Membership sales", value: b.membership ?? 0 },
      { label: "Gift card & wallet top-ups", value: b.gift_card_wallet ?? 0 },
      { label: "Payout transfer fees", value: b.payout_transfers ?? 0 },
    ].filter((row) => Math.abs(row.value) > 0.0001);
  }, [summary]);

  const feesReconciliationsHref = useMemo(() => {
    const p = new URLSearchParams({ tab: "reconciliations" });
    if (start) p.set("start_date", start);
    if (end) p.set("end_date", end);
    return adminSpaTo(`/admin/fees?${p.toString()}`);
  }, [start, end]);

  const downloadSubscriptionReceipt = useCallback(async (financeTxId: string) => {
    setReceiptBusyId(financeTxId);
    setReceiptErr(null);
    try {
      const blob = await adminApi.downloadBlob(
        `/api/admin/provider-subscriptions/receipts/${encodeURIComponent(financeTxId)}/pdf`,
        { timeoutMs: 60_000 },
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `subscription-receipt-${financeTxId}.pdf`;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      a.remove();
    } catch (e) {
      setReceiptErr(e instanceof Error ? e.message : "Could not download receipt");
    } finally {
      setReceiptBusyId(null);
    }
  }, []);

  const runExport = async () => {
    setExportErr(null);
    setExportBusy(true);
    try {
      const p = new URLSearchParams();
      if (start) p.set("start_date", start);
      if (end) p.set("end_date", end);
      if (txType !== "all") p.set("transaction_type", txType);
      const qs = p.toString();
      const blob = await adminApi.downloadBlob(`/api/admin/export/finance${qs ? `?${qs}` : ""}`, {
        timeoutMs: 120_000,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `finance-export-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      a.remove();
    } catch (e) {
      setExportErr(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExportBusy(false);
    }
  };

  if (denied) return denied;

  if (summaryQ.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Finance" description="Ledger summary and transactions" />
        <AdminPanel>
          <AdminPageSkeleton rows={8} />
        </AdminPanel>
      </div>
    );
  }

  if (summaryQ.error) {
    if (isAdminApiAuthFailure(summaryQ.error)) return <PermissionDenied />;
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Finance" description="Ledger summary and transactions" />
        <AdminPanel>
          <AdminRetryBlock message={summaryQ.error.message} onRetry={() => void summaryQ.refetch()} />
        </AdminPanel>
      </div>
    );
  }

  const periodLabel =
    summary?.period?.start_date && summary?.period?.end_date
      ? `${summary.period.defaulted ? "Month to date" : "Custom range"}: ${summary.period.start_date} → ${summary.period.end_date}`
      : "Month to date — set dates below for a fixed range";

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Finance"
        description="Platform financial metrics and ledger transactions (same APIs as legacy admin)."
      />
      {showWalletDisabledBanner ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <code className="rounded bg-amber-100 px-1">payment_wallet</code> is off — customers cannot pay from wallet
          balance in checkout. Refunds may still credit wallets; see product docs for your market.
        </div>
      ) : null}

      {summary && summary.negative_balance_providers && summary.negative_balance_providers.count > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-semibold">
            {summary.negative_balance_providers.count} provider
            {summary.negative_balance_providers.count === 1 ? "" : "s"} with negative payout ledger balance
          </p>
          <p className="mt-1 text-amber-900/90">
            Usually from refunds after funds were already paid out. See the full list on{" "}
            <Link className="font-semibold underline" to={adminSpaTo("/payouts")}>
              Payouts
            </Link>
            .
          </p>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-600">{periodLabel}</p>
        <button
          type="button"
          className={adminToolbarButtonClass(exportBusy)}
          disabled={exportBusy}
          onClick={() => void runExport()}
        >
          <span className="inline-flex items-center gap-2">
            <Download className="h-4 w-4" />
            Export CSV
          </span>
        </button>
      </div>
      {exportErr ? <p className="text-sm text-red-700">{exportErr}</p> : null}

      <AdminPanel>
        <h2 className="mb-4 text-base font-semibold text-gray-900">Filters</h2>
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="block min-w-[10rem] flex-1 text-sm">
            <span className="text-gray-600">Start date</span>
            <input
              type="date"
              value={start}
              onChange={(e) => patchParams({ start_date: e.target.value || null }, true)}
              className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm"
            />
          </label>
          <label className="block min-w-[10rem] flex-1 text-sm">
            <span className="text-gray-600">End date</span>
            <input
              type="date"
              value={end}
              onChange={(e) => patchParams({ end_date: e.target.value || null }, true)}
              className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm"
            />
          </label>
          <label className="block min-w-[10rem] text-sm">
            <span className="text-gray-600">Transaction type</span>
            <select
              value={txType}
              onChange={(e) => patchParams({ type: e.target.value === "all" ? null : e.target.value }, true)}
              className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm"
            >
              <option value="all">All</option>
              <option value="payment">Payment</option>
              <option value="refund">Refund</option>
              <option value="payout">Payout</option>
              <option value="fee">Platform fees</option>
            </select>
          </label>
          <button
            type="button"
            className={adminToolbarButtonClass(false)}
            onClick={() => {
              const next = new URLSearchParams(sp);
              next.delete("start_date");
              next.delete("end_date");
              next.delete("page");
              next.delete("type");
              setSp(next, { replace: true });
            }}
          >
            Clear dates &amp; filters
          </button>
        </div>
      </AdminPanel>

      {summary ? (
        <>
          <details className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800">
            <summary className="cursor-pointer font-medium text-gray-900">How these numbers relate</summary>
            <ul className="mt-2 list-inside list-disc space-y-1 text-gray-700">
              <li>
                <strong>Settled service GMV</strong> is ledger-backed booking and order activity from payment, wallet,
                gift-card, tax, tip, travel, platform-fee, and additional-charge rows. Provider reports show scheduled
                gross booked value separately.
              </li>
              <li>
                <strong>Platform take (net)</strong> is commission after gateway fees; <strong>Provider earnings</strong>{" "}
                is net <code className="rounded bg-gray-100 px-1">provider_earnings</code> ledger activity.
              </li>
              <li>
                <strong>Wallet top-ups collected</strong> is deferred revenue — it is cash received but not yet earned.
                Revenue is recognised when the wallet balance is spent on a booking. The{" "}
                <strong>Total platform take (after referrals)</strong> figure includes top-ups for cash-flow context;
                exclude them for recognised-revenue reporting.
              </li>
              <li>
                <strong>Cancellation fees retained</strong> sums provider-retained ledger activity for cancellations in
                the date range. <strong>Refunds (gross)</strong> sums customer cash refund legs only (excludes parallel
                discount/tender rows). <strong>Provider net activity</strong> is recognized revenue (earnings, tips,
                travel, cancellation, walk-in add-ons) minus provider-earnings refund clawback — not payout
                disbursements.
              </li>
            </ul>
          </details>

          <div className="grid gap-4 xl:grid-cols-2">
            <AdminPanel>
              <h2 className="mb-4 text-base font-semibold text-gray-900">Platform Earnings</h2>
              <div className="space-y-2 text-sm">
                {platformRevenueDrivers.map((item) => (
                  <div key={item.label} className="flex items-center justify-between gap-3">
                    <span className="text-gray-600">{item.label}</span>
                    <span className="tabular-nums font-medium text-gray-900">{formatAdminCurrency(item.value)}</span>
                  </div>
                ))}
                <div className="border-t border-gray-200 pt-2">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Deductions</p>
                  {platformDeductions.map((item) => (
                    <div key={item.label} className="flex items-center justify-between gap-3">
                      <span className="text-gray-600">{item.label}</span>
                      <span className="tabular-nums font-medium text-red-700">-{formatAdminCurrency(item.value)}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-2 border-t border-gray-200 pt-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-gray-900">Net platform earnings</span>
                    <span className="tabular-nums text-lg font-semibold text-gray-900">
                      {formatAdminCurrency(summary.platform_revenue?.total ?? summary.total_platform_take_net)}
                    </span>
                  </div>
                </div>
              </div>
            </AdminPanel>

            <AdminPanel>
              <h2 className="mb-4 text-base font-semibold text-gray-900">Provider Earnings</h2>
              <div className="space-y-2 text-sm">
                {providerRevenueDrivers.map((item) => (
                  <div key={item.label} className="flex items-center justify-between gap-3">
                    <span className="text-gray-600">{item.label}</span>
                    <span className="tabular-nums font-medium text-gray-900">{formatAdminCurrency(item.value)}</span>
                  </div>
                ))}
                <div className="border-t border-gray-200 pt-2">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Deductions</p>
                  {providerDeductions.map((item) => (
                    <div key={item.label} className="flex items-center justify-between gap-3">
                      <span className="text-gray-600">{item.label}</span>
                      <span className="tabular-nums font-medium text-red-700">-{formatAdminCurrency(item.value)}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-2 border-t border-gray-200 pt-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-gray-900">Provider net activity</span>
                    <span className="tabular-nums text-lg font-semibold text-gray-900">
                      {formatAdminCurrency(summary.provider_revenue?.net_after_refunds ?? summary.provider_earnings)}
                    </span>
                  </div>
                </div>
              </div>
            </AdminPanel>
          </div>

          <AdminPanel>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-gray-900">Deductions &amp; other flows</h2>
              <Link
                to={feesReconciliationsHref}
                className="text-sm font-medium text-gray-700 underline hover:text-gray-900"
              >
                View fee reconciliations
              </Link>
            </div>
            <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50/50 p-4">
              <h3 className="mb-3 text-sm font-semibold text-gray-900">Gateway fees (Paystack)</h3>
              <p className="mb-2 text-xs text-gray-500">
                Booking &amp; add-on gateway fees ({formatAdminCurrency(summary.gateway_fees ?? 0)}) are a subset of
                total gateway fees across all Paystack flows.
              </p>
              <div className="space-y-2 text-sm">
                {gatewayFeeBreakdown.map((item) => (
                  <div key={item.label} className="flex items-center justify-between gap-3">
                    <span className="text-gray-600">{item.label}</span>
                    <span className="tabular-nums font-medium text-gray-900">{formatAdminCurrency(item.value)}</span>
                  </div>
                ))}
                <div className="mt-2 border-t border-gray-200 pt-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-gray-900">Total gateway fees</span>
                    <span className="tabular-nums text-lg font-semibold text-gray-900">
                      {formatAdminCurrency(summary.gateway_fees_breakdown?.total ?? summary.gateway_fees_total ?? summary.gateway_fees)}
                    </span>
                  </div>
                </div>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                Reconciliations are auto-generated daily from ledger-recorded fees vs fee config.
              </p>
            </div>
            {(summary.terminal_commerce?.revenue_gross ?? 0) > 0 ||
            (summary.terminal_commerce?.gateway_fees ?? 0) > 0 ||
            (summary.terminal_commerce?.order_count ?? 0) > 0 ? (
              <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50/50 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-gray-900">Terminal commerce</h3>
                  <Link
                    to={adminSpaTo("/admin/commercial/terminal-orders")}
                    className="text-sm font-medium text-gray-700 underline hover:text-gray-900"
                  >
                    Terminal orders
                  </Link>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <SummaryMetricCard
                    label="Terminal revenue (gross)"
                    value={summary.terminal_commerce?.revenue_gross ?? 0}
                  />
                  <SummaryMetricCard
                    label="Terminal gateway fees"
                    value={summary.terminal_commerce?.gateway_fees ?? 0}
                  />
                  <div className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm">
                    <span className="text-xs font-medium text-gray-500">Paid orders in period</span>
                    <p className="mt-1 text-lg font-semibold tabular-nums text-gray-900">
                      {formatAdminNumber(summary.terminal_commerce?.order_count ?? 0)}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <SummaryMetricCard label="Refunds (gross)" value={summary.refunds_gross} />
              <SummaryMetricCard label="Cancellation fees (provider-retained)" value={summary.cancellation_fees_retained ?? 0} />
              <SummaryMetricCard label="Gift card sales" value={summary.gift_card_sales} />
              <SummaryMetricCard label="Membership sales" value={summary.membership_sales} />
              <SummaryMetricCard label="Promotion discounts" value={summary.promotion_discounts ?? 0} />
              <SummaryMetricCard label="Membership discounts" value={summary.membership_discounts ?? 0} />
              <SummaryMetricCard label="Loyalty discounts" value={summary.loyalty_discounts ?? 0} />
              <SummaryMetricCard label="Loyalty redemptions" value={summary.loyalty_redemptions ?? 0} />
              <SummaryMetricCard
                label="Payouts paid"
                value={Math.abs(summary.payouts_paid_total ?? summary.provider_revenue?.payouts_paid_total ?? 0)}
              />
              <SummaryMetricCard
                label="Wallet top-ups cash collected"
                value={summary.liabilities?.wallet_topups_cash_collected ?? summary.wallet_topup_revenue ?? 0}
                tooltip="Custodial cash inflow (liability), not recognized platform revenue."
              />
              <SummaryMetricCard
                label="Gift card outstanding liability"
                value={summary.liabilities?.gift_card_outstanding ?? 0}
                tooltip="Unredeemed gift card balance payable to future redemptions."
              />
              <SummaryMetricCard label="Referral payouts" value={summary.referral_payouts ?? 0} />
            </div>
          </AdminPanel>

          {cancellationReconciliation ? (
            <AdminPanel>
              <h2 className="mb-2 text-base font-semibold text-gray-900">Cancellation &amp; refund reconciliation</h2>
              <p className="mb-4 text-sm text-gray-600">
                Ledger-backed cancellation retention vs customer cash refunded in the same period (split-refund aware).
              </p>
              <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                <table className="w-full min-w-[20rem] text-sm">
                  <tbody className="divide-y divide-gray-100">
                    <tr>
                      <th scope="row" className="bg-gray-50/80 px-3 py-2.5 text-left font-medium text-gray-700">
                        Cancellation fees — provider-retained (ledger)
                      </th>
                      <td className="px-3 py-2.5 text-right tabular-nums text-gray-900">
                        {formatAdminCurrency(cancellationReconciliation.cancellationFeesRetained)}
                      </td>
                    </tr>
                    <tr>
                      <th scope="row" className="bg-gray-50/80 px-3 py-2.5 text-left font-medium text-gray-700">
                        Customer cash refunded (gross)
                      </th>
                      <td className="px-3 py-2.5 text-right tabular-nums text-gray-900">
                        {formatAdminCurrency(cancellationReconciliation.ledgerRefundAmountSum)}
                      </td>
                    </tr>
                    <tr>
                      <th scope="row" className="bg-gray-50/80 px-3 py-2.5 text-left font-semibold text-gray-900">
                        Net (fees + ledger refund amounts)
                      </th>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-gray-900">
                        {formatAdminCurrency(cancellationReconciliation.bookingSideNet)}
                      </td>
                    </tr>
                    <tr>
                      <th scope="row" className="bg-gray-50/80 px-3 py-2.5 text-left font-medium text-gray-700">
                        Platform refund contra (commission reversal)
                      </th>
                      <td className="px-3 py-2.5 text-right tabular-nums text-gray-900">
                        {formatAdminCurrency(cancellationReconciliation.platformRefundImpact)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-gray-500">
                Not all refunds are cancellation-related; not every cancellation produces a ledger row in-range. Export transactions and filter type{" "}
                <span className="font-mono text-gray-700">refund</span> for detail.
              </p>
            </AdminPanel>
          ) : null}

          <AdminPanel>
            <h2 className="mb-4 text-base font-semibold text-gray-900">Subscriptions, ads, tips &amp; tax</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <SummaryMetricCard label="Subscription revenue (net)" value={summary.subscription_net} />
              <SummaryMetricCard label="Ads revenue (net)" value={summary.ads_net ?? 0} />
              <SummaryMetricCard label="Marketing credit revenue (net)" value={summary.marketing_credit_net ?? 0} />
              <SummaryMetricCard label="Subscription collected (gross)" value={summary.subscription_collected_gross} />
              <SummaryMetricCard label="Tips collected (provider pass-through)" value={summary.pass_through?.tips_collected ?? summary.tips_gross} />
              <SummaryMetricCard label="Taxes collected (pass-through)" value={summary.pass_through?.taxes_collected ?? summary.taxes_gross} />
            </div>
          </AdminPanel>

          <AdminPanel>
            <h2 className="mb-4 text-base font-semibold text-gray-900">Platform totals</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <SummaryMetricCard label="Total platform take (net)" value={summary.total_platform_take_net} />
              <SummaryMetricCard
                label="Total platform take (after referral payouts)"
                value={summary.total_platform_take_after_referrals ?? summary.total_platform_take_net}
                tooltip="Platform take net minus referral payouts. Wallet top-ups are deferred revenue and excluded from recognized revenue."
              />
            </div>
          </AdminPanel>

          {summary.reconciliation?.checks ? (
            <AdminPanel>
              <h2 className="mb-3 text-base font-semibold text-gray-900">Reconciliation controls</h2>
              <p className="mb-4 text-sm text-gray-600">
                Daily control checks to validate ledger accuracy and payout/refund risk.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-gray-200 p-3">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Ledger vs bookings GMV</p>
                  <div className="mt-2 grid gap-2 text-sm text-gray-700 sm:grid-cols-2">
                    <div>
                      <span className="text-xs text-gray-500">Ledger GMV</span>
                      <p className="font-medium tabular-nums">
                        {formatAdminCurrency(summary.reconciliation.checks.ledger_vs_bookings_gmv?.ledger_gmv ?? summary.service_collected_gross ?? 0)}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500">Bookings GMV (aligned)</span>
                      <p className="font-medium tabular-nums">
                        {formatAdminCurrency(summary.reconciliation.checks.ledger_vs_bookings_gmv?.bookings_gmv ?? 0)}
                      </p>
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-gray-700">
                    Variance {formatAdminCurrency(summary.reconciliation.checks.ledger_vs_bookings_gmv?.variance ?? 0)}
                    {summary.reconciliation.checks.ledger_vs_bookings_gmv?.variance_pct != null ? (
                      <>
                        {" "}
                        ({formatAdminNumber(Math.abs(summary.reconciliation.checks.ledger_vs_bookings_gmv.variance_pct))}%)
                      </>
                    ) : (
                      <span className="text-gray-500"> (n/a — min side &lt; R100)</span>
                    )}
                    {summary.reconciliation.checks.ledger_vs_bookings_gmv?.status ? (
                      <span
                        className={`ml-2 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          summary.reconciliation.checks.ledger_vs_bookings_gmv.status === "ok"
                            ? "bg-green-100 text-green-800"
                            : summary.reconciliation.checks.ledger_vs_bookings_gmv.status === "warning"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-red-100 text-red-800"
                        }`}
                      >
                        {summary.reconciliation.checks.ledger_vs_bookings_gmv.status}
                      </span>
                    ) : null}
                  </p>
                  {summary.reconciliation.checks.ledger_vs_bookings_gmv?.basis_note ? (
                    <p className="mt-1 text-xs text-gray-500">
                      {summary.reconciliation.checks.ledger_vs_bookings_gmv.basis_note}
                    </p>
                  ) : null}
                </div>
                <div className="rounded-lg border border-gray-200 p-3">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Gateway fee capture anomalies</p>
                  <p className="mt-1 text-sm text-gray-700">
                    {formatAdminNumber(summary.reconciliation.checks.gateway_fee_capture_anomalies?.row_count ?? 0)} Paystack
                    row{(summary.reconciliation.checks.gateway_fee_capture_anomalies?.row_count ?? 0) === 1 ? "" : "s"} with
                    fees ≤ 0
                    {(summary.reconciliation.checks.gateway_fee_capture_anomalies?.expected_fees_total ?? 0) > 0 ? (
                      <>
                        {" "}
                        (≈{" "}
                        {formatAdminCurrency(
                          summary.reconciliation.checks.gateway_fee_capture_anomalies?.expected_fees_total ?? 0,
                        )}{" "}
                        expected)
                      </>
                    ) : null}
                  </p>
                  {(summary.reconciliation.checks.gateway_fee_capture_anomalies?.row_count ?? 0) > 0 ? (
                    <Link
                      to={feesReconciliationsHref}
                      className="mt-2 inline-block text-xs font-medium text-gray-700 underline hover:text-gray-900"
                    >
                      Review in fee reconciliations →
                    </Link>
                  ) : null}
                </div>
                <div className="rounded-lg border border-gray-200 p-3">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Negative payout balances</p>
                  <p className="mt-1 text-sm text-gray-700">
                    {formatAdminNumber(summary.reconciliation.checks.negative_provider_payout_balances?.count ?? 0)} providers flagged
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 p-3">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Refund burden pressure</p>
                  <p className="mt-1 text-sm text-gray-700">
                    Provider refund impact {formatAdminCurrency(
                      summary.reconciliation.checks.refund_burden_pressure?.provider_refund_impact ?? 0
                    )}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 p-3">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Platform net health</p>
                  <p className="mt-1 text-sm text-gray-700">
                    Net {formatAdminCurrency(summary.reconciliation.checks.platform_net_health?.platform_net ?? 0)}
                  </p>
                </div>
              </div>
            </AdminPanel>
          ) : null}

          {summary.metrics_meta ? (
            <AdminPanel>
              <h2 className="mb-3 text-base font-semibold text-gray-900">Metric contracts</h2>
              <p className="mb-2 text-sm text-gray-600">
                Version {summary.metrics_meta.contract_version ?? "n/a"} · generated{" "}
                {summary.metrics_meta.generated_at ? new Date(summary.metrics_meta.generated_at).toLocaleString() : "—"}
              </p>
              <div className="space-y-2">
                {(summary.metrics_meta.contracts ?? []).map((metric) => (
                  <div key={metric.key} className="rounded-lg border border-gray-200 p-3 text-sm">
                    <p className="font-medium text-gray-900">{metric.label}</p>
                    <p className="mt-1 font-mono text-xs text-gray-700">{metric.formula}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      Source: {metric.source.join(", ")} · TZ: {metric.timezone} · Cadence: {metric.cadence}
                    </p>
                  </div>
                ))}
              </div>
            </AdminPanel>
          ) : null}

          {summary.language_context?.glossary ? (
            <AdminPanel>
              <h2 className="mb-3 text-base font-semibold text-gray-900">Admin glossary context</h2>
              <div className="space-y-2 text-sm">
                {Object.entries(summary.language_context.glossary).map(([key, value]) => (
                  <div key={key} className="rounded-lg border border-gray-200 p-3">
                    <p className="font-medium text-gray-900">{key.replace(/_/g, " ")}</p>
                    <p className="mt-1 text-gray-600">{value}</p>
                  </div>
                ))}
              </div>
            </AdminPanel>
          ) : null}
        </>
      ) : null}

      <AdminPanel>
        <h2 className="mb-4 text-base font-semibold text-gray-900">Transactions</h2>
        {txQ.error ? (
          isAdminApiAuthFailure(txQ.error) ? (
            <PermissionDenied />
          ) : (
            <AdminRetryBlock message={txQ.error.message} onRetry={() => void txQ.refetch()} />
          )
        ) : txQ.isLoading ? (
          <p className="text-sm text-gray-600">Loading transactions…</p>
        ) : transactions.length === 0 ? (
          <EmptyState title="No transactions" description="Try widening the date range or changing the type filter." />
        ) : (
          <>
            <p className="mb-3 text-sm text-gray-600">{formatAdminNumber(total)} total in this range (paginated)</p>
            {receiptErr ? (
              <p className="mb-3 text-sm text-red-600">{receiptErr}</p>
            ) : null}
            <div className="hidden overflow-x-auto md:block">
              <AdminDataTable>
                <AdminTableHead>
                  <tr>
                    <AdminTh>Date</AdminTh>
                    <AdminTh>Type</AdminTh>
                    <AdminTh>Amount</AdminTh>
                    <AdminTh>
                      <span title="Paystack gateway fee recorded on payment and terminal_* ledger rows">Fees</span>
                    </AdminTh>
                    <AdminTh>Net</AdminTh>
                    <AdminTh>Booking</AdminTh>
                    <AdminTh>Receipt</AdminTh>
                  </tr>
                </AdminTableHead>
                <AdminTableBody>
                  {transactions.map((tx) => (
                    <tr key={tx.id}>
                      <AdminTd>{tx.created_at ? new Date(tx.created_at).toLocaleString() : "—"}</AdminTd>
                      <AdminTd className="capitalize">{tx.transaction_type}</AdminTd>
                      <AdminTd className="tabular-nums">{formatAdminCurrency(tx.amount)}</AdminTd>
                      <AdminTd
                        className="tabular-nums text-gray-600"
                        title={
                          tx.fees > 0
                            ? "Paystack gateway fee from webhook (payment / terminal commerce rows)"
                            : undefined
                        }
                      >
                        {formatAdminCurrency(tx.fees)}
                      </AdminTd>
                      <AdminTd className="tabular-nums font-medium">{formatAdminCurrency(tx.net)}</AdminTd>
                      <AdminTd>
                        {tx.booking?.id ? (
                          <Link
                            to={adminSpaTo(`/admin/bookings/${encodeURIComponent(tx.booking.id)}`)}
                            className="text-primary underline"
                          >
                            {tx.booking.booking_number || tx.booking.id.slice(0, 8)}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </AdminTd>
                      <AdminTd>
                        {tx.transaction_type === "provider_subscription_payment" ? (
                          <button
                            type="button"
                            className="text-primary underline disabled:opacity-50"
                            disabled={receiptBusyId === tx.id}
                            onClick={() => void downloadSubscriptionReceipt(tx.id)}
                          >
                            {receiptBusyId === tx.id ? "Preparing…" : "Receipt PDF"}
                          </button>
                        ) : (
                          "—"
                        )}
                      </AdminTd>
                    </tr>
                  ))}
                </AdminTableBody>
              </AdminDataTable>
            </div>

            <div className="divide-y divide-gray-200 md:hidden">
              {transactions.map((tx) => (
                <div key={tx.id} className="py-3">
                  <div className="flex justify-between gap-2">
                    <span className="font-medium capitalize">{tx.transaction_type}</span>
                    <span className="tabular-nums font-semibold">{formatAdminCurrency(tx.net)}</span>
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    {tx.created_at ? new Date(tx.created_at).toLocaleString() : "—"}
                  </div>
                  {tx.booking?.id ? (
                    <div className="mt-1 text-xs">
                      <Link
                        to={adminSpaTo(`/admin/bookings/${encodeURIComponent(tx.booking.id)}`)}
                        className="text-primary underline"
                      >
                        Booking {tx.booking.booking_number || tx.booking.id.slice(0, 8)}
                      </Link>
                    </div>
                  ) : null}
                  {tx.amount !== tx.net ? (
                    <div className="mt-1 text-xs text-gray-600">
                      Gross {formatAdminCurrency(tx.amount)}
                      {tx.fees > 0 ? ` · Fees ${formatAdminCurrency(tx.fees)}` : null}
                    </div>
                  ) : null}
                  {tx.transaction_type === "provider_subscription_payment" ? (
                    <div className="mt-1 text-xs">
                      <button
                        type="button"
                        className="text-primary underline disabled:opacity-50"
                        disabled={receiptBusyId === tx.id}
                        onClick={() => void downloadSubscriptionReceipt(tx.id)}
                      >
                        {receiptBusyId === tx.id ? "Preparing receipt…" : "Download receipt PDF"}
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>

            {total > TX_LIMIT ? (
              <div className="mt-4 flex flex-col items-stretch justify-between gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-center">
                <p className="text-sm text-gray-700">
                  Showing {(page - 1) * TX_LIMIT + 1}–{Math.min(page * TX_LIMIT, total)} of {total}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={adminToolbarButtonClass(page <= 1)}
                    disabled={page <= 1}
                    onClick={() => patchParams({ page: String(page - 1) })}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className={adminToolbarButtonClass(!meta?.has_more)}
                    disabled={!meta?.has_more}
                    onClick={() => patchParams({ page: String(page + 1) })}
                  >
                    Next
                  </button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </AdminPanel>
    </div>
  );
}
