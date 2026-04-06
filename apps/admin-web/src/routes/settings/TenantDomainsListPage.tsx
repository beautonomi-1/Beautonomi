import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useSuperadminPage } from "@/hooks/useSuperadminPage";
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

type DomainRow = Record<string, unknown> & {
  id?: string;
  hostname?: string;
  tenant_id?: string;
  environment?: string;
  is_active?: boolean;
};

export function TenantDomainsListPage() {
  const { allowed, denied } = useSuperadminPage("Tenant domains are superadmin-only (matches API + nav).");

  const q = useQuery({
    queryKey: adminQueryKeys.tenantDomains(),
    queryFn: () =>
      adminApi.getJson<{ domains: DomainRow[]; tenants: Record<string, unknown>[] }>(
        "/api/admin/tenant-domains",
        { timeoutMs: 60_000 }
      ),
    enabled: allowed,
  });

  const domains = q.data?.domains ?? [];

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Tenant domains" />
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
      <AdminPageHeader title="Tenant domains" description="GET /api/admin/tenant-domains" />
      <p className="text-sm text-gray-600">
        <a href={legacyAdminHref("/admin/settings/tenant-domains")} className="font-medium text-gray-900 underline">
          Add domains in legacy →
        </a>
      </p>
      {domains.length === 0 ? (
        <EmptyState title="No domains" />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Hostname</AdminTh>
              <AdminTh>Tenant</AdminTh>
              <AdminTh>Environment</AdminTh>
              <AdminTh>Active</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {domains.map((d) => (
              <tr key={String(d.id)}>
                <AdminTd className="font-mono text-xs">{String(d.hostname ?? "")}</AdminTd>
                <AdminTd className="font-mono text-xs">{String(d.tenant_id ?? "").slice(0, 8)}…</AdminTd>
                <AdminTd>{String(d.environment ?? "")}</AdminTd>
                <AdminTd>{d.is_active ? "yes" : "no"}</AdminTd>
              </tr>
            ))}
          </AdminTableBody>
        </AdminDataTable>
      )}
    </div>
  );
}
