import { useSearchParams } from "react-router-dom";
import { useMemo } from "react";
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

export function CatalogServicesPage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_CONTENT_CATALOG, "Content & catalog access is required.");
  const [sp] = useSearchParams();
  const categoryId = sp.get("category_id") || "";
  const qk = useMemo(() => adminQueryKeys.catalogServices(categoryId || "all"), [categoryId]);

  const q = useQuery({
    queryKey: qk,
    queryFn: async () => {
      const p = categoryId ? `?category_id=${encodeURIComponent(categoryId)}` : "";
      return adminApi.getJson<Record<string, unknown>[]>(`/api/admin/catalog/services${p}`, { timeoutMs: 60_000 });
    },
    enabled: allowed,
  });
  const rows = q.data ?? [];

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Catalog" />
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

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Master services" description="GET /api/admin/catalog/services" />
      {rows.length === 0 ? (
        <EmptyState title="No services" />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Name</AdminTh>
              <AdminTh>Category</AdminTh>
              <AdminTh>Duration</AdminTh>
              <AdminTh>Active</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((r) => {
              const row = r as Record<string, unknown>;
              return (
                <tr key={String(row.id ?? "")}>
                  <AdminTd className="font-medium">{String(row.name ?? "")}</AdminTd>
                  <AdminTd className="text-xs">{String(row.category_name ?? "")}</AdminTd>
                  <AdminTd className="tabular-nums">{String(row.default_duration_minutes ?? "")}</AdminTd>
                  <AdminTd>{String(row.is_active ?? "")}</AdminTd>
                </tr>
              );
            })}
          </AdminTableBody>
        </AdminDataTable>
      )}
    </div>
  );
}
