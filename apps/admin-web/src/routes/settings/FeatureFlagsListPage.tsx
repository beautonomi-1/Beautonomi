import { useQuery } from "@tanstack/react-query";
import { ADMIN_SECTION_PLATFORM_CONFIG } from "@beautonomi/admin-access";
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

type FlagRow = Record<string, unknown> & { id?: string; feature_name?: string; category?: string; is_enabled?: boolean };

export function FeatureFlagsListPage() {
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_PLATFORM_CONFIG,
    "Platform configuration access is required."
  );

  const q = useQuery({
    queryKey: adminQueryKeys.featureFlags(),
    queryFn: () => adminApi.getJson<FlagRow[]>("/api/admin/feature-flags", { timeoutMs: 60_000 }),
    enabled: allowed,
  });

  const rows = Array.isArray(q.data) ? q.data : [];

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Feature flags" />
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
      <AdminPageHeader title="Feature flags" description="GET /api/admin/feature-flags" />
      <p className="text-sm text-gray-600">
        <a href={legacyAdminHref("/admin/settings/feature-flags")} className="font-medium text-gray-900 underline">
          Edit in legacy →
        </a>{" "}
        ·{" "}
        <a href={legacyAdminHref("/admin/control-plane/feature-flags")} className="font-medium text-gray-900 underline">
          Control plane variant →
        </a>
      </p>
      {rows.length === 0 ? (
        <EmptyState title="No flags" />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Feature</AdminTh>
              <AdminTh>Category</AdminTh>
              <AdminTh>Enabled</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((r) => (
              <tr key={String(r.id ?? r.feature_name)}>
                <AdminTd className="font-medium">{String(r.feature_name ?? "")}</AdminTd>
                <AdminTd>{String(r.category ?? "")}</AdminTd>
                <AdminTd>{r.is_enabled ? "yes" : "no"}</AdminTd>
              </tr>
            ))}
          </AdminTableBody>
        </AdminDataTable>
      )}
    </div>
  );
}
