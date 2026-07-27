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

type Metrics = Record<string, unknown>;

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

  const topProviders = useMemo(() => {
    const tp = q.data?.top_providers;
    return Array.isArray(tp) ? (tp as Record<string, unknown>[]) : [];
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
  const headline: [string, string][] = ["mrr", "arr", "total_subscriptions", "active_subscriptions", "churn_rate", "arpu"].map(
    (k) => [k, typeof d[k] === "number" || typeof d[k] === "string" ? String(d[k]) : ""]
  );

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Subscription revenue"
        description="GET /api/admin/subscription-metrics · optional start_date, end_date"
      />
      <AdminPanel>
        <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {headline.map(([k, v]) => (
            <div key={k}>
              <dt className="text-gray-500">{k.replace(/_/g, " ")}</dt>
              <dd className="font-semibold">{v || "—"}</dd>
            </div>
          ))}
        </dl>
      </AdminPanel>
      {topProviders.length > 0 ? (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Provider</AdminTh>
              <AdminTh className="text-right">Revenue</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {topProviders.map((r, i) => (
              <tr key={i}>
                <AdminTd>{String(r.business_name ?? r.provider_id ?? "")}</AdminTd>
                <AdminTd className="text-right tabular-nums">{String(r.revenue ?? "")}</AdminTd>
              </tr>
            ))}
          </AdminTableBody>
        </AdminDataTable>
      ) : null}
    </div>
  );
}
