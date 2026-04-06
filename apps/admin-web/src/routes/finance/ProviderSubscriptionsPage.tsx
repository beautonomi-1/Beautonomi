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

type SubRow = Record<string, unknown> & {
  id?: string;
  status?: string;
  billing_period?: string;
  providers?: { business_name?: string } | null;
  subscription_plans?: { name?: string } | null;
};

export function ProviderSubscriptionsPage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_FINANCE, "Finance access is required.");
  const [sp, setSp] = useSearchParams();
  const status = sp.get("status") || "all";
  const qk = useMemo(() => `status=${status}`, [status]);

  const q = useQuery({
    queryKey: adminQueryKeys.providerSubscriptions(qk),
    queryFn: async () => {
      const p = new URLSearchParams();
      if (status !== "all") p.set("status", status);
      const qs = p.toString();
      return adminApi.getJson<SubRow[]>(`/api/admin/provider-subscriptions${qs ? `?${qs}` : ""}`, {
        timeoutMs: 60_000,
      });
    },
    enabled: allowed,
  });

  const rows = Array.isArray(q.data) ? q.data : [];

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Provider subscriptions" />
        <AdminPanel>
          <AdminPageSkeleton rows={5} />
        </AdminPanel>
      </div>
    );
  }
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Provider subscriptions" description="GET /api/admin/provider-subscriptions" />
      <AdminPanel>
        <label className="text-sm text-gray-600">
          Status{" "}
          <select
            className="ml-2 rounded border border-gray-300 px-2 py-1 text-sm"
            value={status}
            onChange={(e) => {
              const n = new URLSearchParams(sp);
              n.set("status", e.target.value);
              setSp(n, { replace: true });
            }}
          >
            <option value="all">all</option>
            <option value="active">active</option>
            <option value="cancelled">cancelled</option>
            <option value="past_due">past_due</option>
          </select>
        </label>
      </AdminPanel>
      {rows.length === 0 ? (
        <EmptyState title="No subscriptions" />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Provider</AdminTh>
              <AdminTh>Plan</AdminTh>
              <AdminTh>Status</AdminTh>
              <AdminTh>Period</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((r) => (
              <tr key={String(r.id)}>
                <AdminTd>{String(r.providers?.business_name ?? "")}</AdminTd>
                <AdminTd>{String(r.subscription_plans?.name ?? "")}</AdminTd>
                <AdminTd>{String(r.status ?? "")}</AdminTd>
                <AdminTd>{String(r.billing_period ?? "")}</AdminTd>
              </tr>
            ))}
          </AdminTableBody>
        </AdminDataTable>
      )}
    </div>
  );
}
