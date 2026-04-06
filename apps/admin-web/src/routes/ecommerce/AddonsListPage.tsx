import { useQuery } from "@tanstack/react-query";
import { ADMIN_SECTION_ECOMMERCE } from "@beautonomi/admin-access";
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

export function AddonsListPage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_ECOMMERCE, "E‑commerce access is required.");
  const q = useQuery({
    queryKey: adminQueryKeys.addons("default"),
    queryFn: () => adminApi.getJson<Record<string, unknown>[]>("/api/admin/addons", { timeoutMs: 60_000 }),
    enabled: allowed,
  });
  const rows = q.data ?? [];

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Add-ons" />
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
      <AdminPageHeader title="Add-ons" description="GET /api/admin/addons" />
      <p className="text-sm text-gray-600">
        <a href={legacyAdminHref("/admin/addons")} className="font-medium text-gray-900 underline">
          Legacy add-ons →
        </a>
      </p>
      {rows.length === 0 ? (
        <EmptyState title="No add-ons" />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Name</AdminTh>
              <AdminTh>Type</AdminTh>
              <AdminTh>Price</AdminTh>
              <AdminTh>Active</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((r) => {
              const row = r as Record<string, unknown>;
              return (
                <tr key={String(row.id ?? "")}>
                  <AdminTd className="font-medium">{String(row.name ?? row.title ?? "")}</AdminTd>
                  <AdminTd>{String(row.type ?? "")}</AdminTd>
                  <AdminTd className="tabular-nums">{String(row.price ?? "")}</AdminTd>
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
