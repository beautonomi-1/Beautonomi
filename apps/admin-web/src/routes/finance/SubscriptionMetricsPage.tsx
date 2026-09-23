import { useMemo } from "react";
import { useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useSuperadminPage } from "@/hooks/useSuperadminPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import {
  AdminDataTable,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
} from "@/components/admin/AdminDataTable";
import { AdminMetricCard } from "@/components/ui/AdminMetricCard";
import { formatAdminCurrency, formatAdminNumber } from "@/lib/adminFormatCurrency";
import { AdminTrendChart } from "@/components/admin/charts/AdminTrendChart";
import { AdminHorizontalBars } from "@/components/admin/charts/AdminHorizontalBars";
import { AdminMrrBridge } from "@/components/admin/charts/AdminMrrBridge";
import {
  AdminMetricContractsGlossary,
  type MetricContractRow,
} from "@/components/admin/AdminMetricContractsGlossary";

type Metrics = {
  mrr?: number;
  catalog_mrr?: number;
  recognized_mrr?: number;
  realized_subscription_revenue?: number;
  arr?: number;
  churn_rate?: number;
  arpu?: number;
  paid_only_arpu?: number;
  trial_to_paid_rate?: number;
  revenue_trends?: Array<{ month: string; revenue: number; label: string }>;
  revenue_by_plan?: Array<{ plan_name: string; count: number; mrr: number }>;
  billing_breakdown?: { monthly?: number; yearly?: number };
  mrr_bridge?: {
    starting_mrr: number;
    new_mrr: number;
    expansion_mrr: number;
    contraction_mrr: number;
    churned_mrr: number;
    ending_mrr: number;
    grr: number;
    nrr: number;
    revenue_churn_rate: number;
    quick_ratio: number;
  };
  top_providers?: Array<{ provider_id: string; business_name: string; revenue: number }>;
};

export function SubscriptionMetricsPage() {
  const { allowed, denied } = useSuperadminPage(
    "Subscription revenue metrics are restricted to platform superadmins (matches Next.js /admin/subscription-revenue).",
  );
  const [sp] = useSearchParams();
  const start = sp.get("start_date") ?? "";
  const end = sp.get("end_date") ?? "";
  const rangeKey = `${start}|${end}`;

  const q = useQuery({
    queryKey: adminQueryKeys.subscriptionMetrics(rangeKey),
    queryFn: async () => {
      const p = new URLSearchParams();
      if (start) p.set("start_date", start);
      if (end) p.set("end_date", end);
      const qs = p.toString();
      return adminApi.getJson<Metrics>(`/api/admin/subscription-metrics${qs ? `?${qs}` : ""}`, {
        timeoutMs: 90_000,
      });
    },
    enabled: allowed,
  });

  const healthContractsQ = useQuery({
    queryKey: adminQueryKeys.marketplaceHealth("contracts-only"),
    queryFn: () =>
      adminApi.getJson<{ contracts?: MetricContractRow[] }>(
        "/api/admin/marketplace-health?period=30d",
      ),
    enabled: allowed,
  });

  const topProviders = useMemo(() => {
    const tp = q.data?.top_providers;
    return Array.isArray(tp) ? tp : [];
  }, [q.data]);

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Subscription revenue" />
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

  const d = q.data ?? {};
  const bridge = d.mrr_bridge;
  const mrrTrend = (d.revenue_trends ?? []).map((r) => ({ date: r.month, value: r.revenue, label: r.label }));

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Subscription revenue"
        description="Catalog MRR is plan price. Realized cash is collected subscription payments on the ledger."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <AdminMetricCard variant="violet" label="Catalog MRR" value={formatAdminCurrency(d.catalog_mrr ?? d.mrr ?? 0)} hint="Plan price (monthly equivalent)" />
        <AdminMetricCard variant="emerald" label="Recognized MRR" value={formatAdminCurrency(d.recognized_mrr ?? 0)} hint="Accrual this month" />
        <AdminMetricCard variant="slate" label="Realized subscription cash" value={formatAdminCurrency(d.realized_subscription_revenue ?? 0)} hint="Ledger provider_subscription_payment net" />
        <AdminMetricCard variant="amber" label="ARR" value={formatAdminCurrency(d.arr ?? 0)} />
        <AdminMetricCard variant="rose" label="Logo churn (month)" value={`${d.churn_rate ?? 0}%`} />
        <AdminMetricCard variant="violet" label="Paid-only ARPU" value={formatAdminCurrency(d.paid_only_arpu ?? d.arpu ?? 0)} hint="MRR / paid actives" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <AdminPanel>
          <h2 className="text-base font-semibold text-gray-900">Catalog MRR (12 months)</h2>
          <p className="mt-1 text-xs text-gray-500">Plan price, not collected cash.</p>
          <div className="mt-4">
            <AdminTrendChart series={mrrTrend} valueFormat="currency" />
          </div>
        </AdminPanel>
        {bridge ? (
          <AdminPanel>
            <h2 className="text-base font-semibold text-gray-900">MRR bridge (this month)</h2>
            <div className="mt-4">
              <AdminMrrBridge bridge={bridge} />
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-gray-500">GRR</dt>
                <dd className="font-semibold">{bridge.grr}%</dd>
              </div>
              <div>
                <dt className="text-gray-500">NRR</dt>
                <dd className="font-semibold">{bridge.nrr}%</dd>
              </div>
              <div>
                <dt className="text-gray-500">Revenue churn</dt>
                <dd className="font-semibold">{bridge.revenue_churn_rate}%</dd>
              </div>
              <div>
                <dt className="text-gray-500">Quick ratio</dt>
                <dd className="font-semibold">{bridge.quick_ratio}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Trial → paid</dt>
                <dd className="font-semibold">{d.trial_to_paid_rate ?? 0}%</dd>
              </div>
            </dl>
          </AdminPanel>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <AdminPanel>
          <h2 className="text-base font-semibold text-gray-900">Revenue by plan</h2>
          <div className="mt-4">
            <AdminHorizontalBars
              rows={(d.revenue_by_plan ?? []).map((p) => ({
                label: p.plan_name,
                value: p.mrr,
                hint: `(${formatAdminNumber(p.count)} subs)`,
              }))}
            />
          </div>
        </AdminPanel>
        <AdminPanel>
          <h2 className="text-base font-semibold text-gray-900">Billing period</h2>
          <div className="mt-4">
            <AdminHorizontalBars
              rows={[
                { label: "Monthly", value: d.billing_breakdown?.monthly ?? 0 },
                { label: "Yearly", value: d.billing_breakdown?.yearly ?? 0 },
              ]}
            />
          </div>
        </AdminPanel>
      </div>

      {topProviders.length > 0 ? (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Provider</AdminTh>
              <AdminTh className="text-right">Catalog MRR</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {topProviders.map((r) => (
              <tr key={r.provider_id}>
                <AdminTd>{r.business_name}</AdminTd>
                <AdminTd className="text-right tabular-nums">{formatAdminCurrency(r.revenue)}</AdminTd>
              </tr>
            ))}
          </AdminTableBody>
        </AdminDataTable>
      ) : null}

      {healthContractsQ.data?.contracts?.length ? (
        <AdminMetricContractsGlossary
          title="Marketplace metric glossary"
          contracts={healthContractsQ.data.contracts}
        />
      ) : null}
    </div>
  );
}
