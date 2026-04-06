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
import { legacyAdminHref } from "@/lib/legacyAdminOrigin";

type PlanRow = Record<string, unknown> & { name?: string; id?: string; pricing_plan?: unknown };

export function PlansListPage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_FINANCE, "Finance access is required.");

  const q = useQuery({
    queryKey: adminQueryKeys.plans(),
    queryFn: () => adminApi.getJson<PlanRow[]>("/api/admin/plans", { timeoutMs: 60_000 }),
    enabled: allowed,
  });

  const rows = Array.isArray(q.data) ? q.data : [];

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Plans" />
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
      <AdminPageHeader title="Plans" description="GET /api/admin/plans (read-only list)" />
      <p className="text-sm text-gray-600">
        <a href={legacyAdminHref("/admin/plans")} className="font-medium text-gray-900 underline">
          Edit plans in legacy admin →
        </a>
      </p>
      {rows.length === 0 ? (
        <EmptyState title="No plans" />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Name</AdminTh>
              <AdminTh>ID</AdminTh>
              <AdminTh>Pricing linked</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((r) => (
              <tr key={String(r.id)}>
                <AdminTd className="font-medium">{String(r.name ?? "")}</AdminTd>
                <AdminTd className="font-mono text-xs">{String(r.id ?? "")}</AdminTd>
                <AdminTd>{r.pricing_plan ? "yes" : "no"}</AdminTd>
              </tr>
            ))}
          </AdminTableBody>
        </AdminDataTable>
      )}
    </div>
  );
}
