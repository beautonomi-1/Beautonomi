import { useQuery } from "@tanstack/react-query";
import type { AdminSection } from "@beautonomi/admin-access";
import type { UserRole } from "@beautonomi/types";
import { ALL_SECTIONS, SECTION_LABELS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useSuperadminPage } from "@/hooks/useSuperadminPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
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

export function TeamPermissionsMatrixPage() {
  const { allowed, denied } = useSuperadminPage("Team permissions matrix is superadmin-only in nav.");

  const q = useQuery({
    queryKey: adminQueryKeys.sectionPermissions(),
    queryFn: () =>
      adminApi.getJson<{ sectionRoles: Record<AdminSection, UserRole[]> }>(
        "/api/admin/settings/section-permissions",
        { timeoutMs: 30_000 }
      ),
    enabled: allowed,
  });

  const matrix = q.data?.sectionRoles;

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Team permissions" />
        <AdminPanel>
          <AdminPageSkeleton rows={4} />
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
        title="Team permissions"
        description="Read-only matrix from GET /api/admin/settings/section-permissions"
      />
      <p className="text-sm text-gray-600">
        <a href={legacyAdminHref("/admin/settings/team-permissions")} className="font-medium text-gray-900 underline">
          Edit assignments in legacy (PUT) →
        </a>
      </p>
      <AdminDataTable>
        <AdminTableHead>
          <tr>
            <AdminTh>Section</AdminTh>
            <AdminTh>Roles</AdminTh>
          </tr>
        </AdminTableHead>
        <AdminTableBody>
          {ALL_SECTIONS.map((section) => (
            <tr key={section}>
              <AdminTd className="font-medium">{SECTION_LABELS[section]}</AdminTd>
              <AdminTd className="text-xs">{(matrix?.[section] ?? []).join(", ") || "—"}</AdminTd>
            </tr>
          ))}
        </AdminTableBody>
      </AdminDataTable>
    </div>
  );
}
