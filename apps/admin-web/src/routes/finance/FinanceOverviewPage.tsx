import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ADMIN_SECTION_FINANCE } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { legacyAdminHref } from "@/lib/legacyAdminOrigin";

type FinanceSummary = Record<string, number | Record<string, unknown> | null | undefined>;

export function FinanceOverviewPage() {
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_FINANCE,
    "Finance access is required."
  );
  const [sp] = useSearchParams();
  const start = sp.get("start_date") ?? "";
  const end = sp.get("end_date") ?? "";
  const rangeKey = `${start}|${end}`;

  const q = useQuery({
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

  const metrics = useMemo(() => {
    const d = q.data;
    if (!d) return [];
    const pick: [string, number][] = [];
    for (const [k, v] of Object.entries(d)) {
      if (typeof v === "number" && !Number.isNaN(v)) pick.push([k, v]);
    }
    return pick.sort((a, b) => a[0].localeCompare(b[0]));
  }, [q.data]);

  if (denied) return denied;

  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Finance" description="Summary from GET /api/admin/finance/summary" />
        <AdminPanel>
          <AdminPageSkeleton rows={6} />
        </AdminPanel>
      </div>
    );
  }

  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Finance" />
        <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Finance"
        description="Ledger-derived totals. Optional URL params: start_date, end_date (ISO)."
      />
      <p className="text-sm text-gray-600">
        <a href={legacyAdminHref("/admin/finance")} className="font-medium text-gray-900 underline">
          Open legacy finance UI for transactions export →
        </a>
      </p>
      <AdminPanel>
        <p className="mb-4 text-sm text-gray-600">
          Filter via query string, e.g. <code className="rounded bg-gray-100 px-1">?start_date=2026-01-01&end_date=2026-01-31</code>
        </p>
        <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {metrics.map(([k, v]) => (
            <div key={k} className="rounded-lg border border-gray-100 p-3">
              <dt className="text-gray-500">{k.replace(/_/g, " ")}</dt>
              <dd className="font-semibold tabular-nums">{v.toLocaleString(undefined, { maximumFractionDigits: 2 })}</dd>
            </div>
          ))}
        </dl>
      </AdminPanel>
    </div>
  );
}
