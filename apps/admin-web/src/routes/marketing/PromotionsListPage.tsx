import { useQuery } from "@tanstack/react-query";
import { ADMIN_SECTION_MARKETING_COMMS } from "@beautonomi/admin-access";
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

type Promo = Record<string, unknown> & { id?: string; name?: string; code?: string; is_active?: boolean };

export function PromotionsListPage() {
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_MARKETING_COMMS,
    "Marketing & comms access is required."
  );

  const q = useQuery({
    queryKey: adminQueryKeys.promotions(),
    queryFn: () => adminApi.getJson<Promo[]>("/api/admin/promotions", { timeoutMs: 60_000 }),
    enabled: allowed,
  });

  const rows = Array.isArray(q.data) ? q.data : [];

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Promotions" />
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
      <AdminPageHeader title="Promotions" description="GET /api/admin/promotions" />
      <p className="text-sm text-gray-600">
        <a href={legacyAdminHref("/admin/promotions")} className="font-medium text-gray-900 underline">
          Create / edit in legacy →
        </a>
      </p>
      {rows.length === 0 ? (
        <EmptyState title="No promotions" />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Name</AdminTh>
              <AdminTh>Code</AdminTh>
              <AdminTh>Active</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((r) => (
              <tr key={String(r.id)}>
                <AdminTd className="font-medium">{String(r.name ?? "")}</AdminTd>
                <AdminTd className="font-mono text-xs">{String(r.code ?? "")}</AdminTd>
                <AdminTd>{r.is_active ? "yes" : "no"}</AdminTd>
              </tr>
            ))}
          </AdminTableBody>
        </AdminDataTable>
      )}
    </div>
  );
}
