import { useQuery } from "@tanstack/react-query";
import { ADMIN_SECTION_CONTENT_CATALOG } from "@beautonomi/admin-access";
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

type ResourcesPayload = { data?: Record<string, unknown>[] };

export function ContentResourcesPage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_CONTENT_CATALOG, "Content & catalog access is required.");

  const q = useQuery({
    queryKey: adminQueryKeys.contentResources(),
    queryFn: () => adminApi.getRawJson<ResourcesPayload>("/api/admin/content/resources", { timeoutMs: 60_000 }),
    enabled: allowed,
  });

  const rows = q.data?.data ?? [];

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="CMS resources" />
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
      <AdminPageHeader
        title="CMS resources"
        description="Tenant-scoped learning/resources rows from GET /api/admin/content/resources. Create and update remain in the legacy admin or API for now."
      />
      {rows.length === 0 ? (
        <EmptyState title="No resources" />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Title</AdminTh>
              <AdminTh>Type</AdminTh>
              <AdminTh>Published</AdminTh>
              <AdminTh>Updated</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((r) => {
              const row = r as Record<string, unknown>;
              const rk = String(row.id ?? row.slug ?? "");
              return (
                <tr key={rk || JSON.stringify(row).slice(0, 40)}>
                  <AdminTd className="font-medium">{String(row.title ?? "")}</AdminTd>
                  <AdminTd className="text-xs">{String(row.type ?? row.category ?? "")}</AdminTd>
                  <AdminTd>{String(row.is_active ?? row.is_published ?? "")}</AdminTd>
                  <AdminTd className="text-xs text-gray-500">{String(row.updated_at ?? row.created_at ?? "")}</AdminTd>
                </tr>
              );
            })}
          </AdminTableBody>
        </AdminDataTable>
      )}
    </div>
  );
}
