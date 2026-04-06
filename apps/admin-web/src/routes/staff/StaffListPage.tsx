import { useQuery } from "@tanstack/react-query";
import { ADMIN_SECTION_PROVIDERS_OPERATIONS } from "@beautonomi/admin-access";
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

type StaffPayload = {
  staff: Record<string, unknown>[];
  statistics: Record<string, unknown>;
};

export function StaffListPage() {
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_PROVIDERS_OPERATIONS,
    "Providers & operations access is required."
  );
  const qk = adminQueryKeys.staff("default");

  const q = useQuery({
    queryKey: qk,
    queryFn: () => adminApi.getJson<StaffPayload>("/api/admin/staff", { timeoutMs: 60_000 }),
    enabled: allowed,
  });

  const staff = q.data?.staff ?? [];
  const stats = q.data?.statistics;

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Staff" />
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
      <AdminPageHeader title="Staff" description="GET /api/admin/staff" />
      <p className="text-sm text-gray-600">
        <a href={legacyAdminHref("/admin/staff")} className="font-medium text-gray-900 underline">
          Legacy staff (reset password, edit) →
        </a>
      </p>
      {stats ? (
        <AdminPanel>
          <pre className="max-h-40 overflow-auto text-xs text-gray-700">{JSON.stringify(stats, null, 2)}</pre>
        </AdminPanel>
      ) : null}
      {staff.length === 0 ? (
        <EmptyState title="No staff rows" />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Name</AdminTh>
              <AdminTh>Email</AdminTh>
              <AdminTh>Provider</AdminTh>
              <AdminTh>Role</AdminTh>
              <AdminTh>Active</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {staff.map((s) => {
              const row = s as Record<string, unknown>;
              const prov = row.provider as { business_name?: string } | undefined;
              return (
                <tr key={String(row.id ?? row.email ?? "")}>
                  <AdminTd className="font-medium">{String(row.name ?? "")}</AdminTd>
                  <AdminTd className="text-xs">{String(row.email ?? "")}</AdminTd>
                  <AdminTd className="text-xs">{String(prov?.business_name ?? "")}</AdminTd>
                  <AdminTd>{String(row.role ?? "")}</AdminTd>
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
