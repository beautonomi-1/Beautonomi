import { useQuery } from "@tanstack/react-query";
import { ADMIN_SECTION_INTEGRATIONS_DEV } from "@beautonomi/admin-access";
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

type KeyRow = Record<string, unknown> & { id?: string; name?: string; is_active?: boolean };

export function ApiKeysListPage() {
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_INTEGRATIONS_DEV,
    "Integrations & dev access is required."
  );

  const q = useQuery({
    queryKey: adminQueryKeys.apiKeys("all"),
    queryFn: () => adminApi.getJson<{ keys: KeyRow[] }>("/api/admin/api-keys", { timeoutMs: 30_000 }),
    enabled: allowed,
  });

  const rows = q.data?.keys ?? [];

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="API keys" />
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
      <AdminPageHeader title="API keys" description="GET /api/admin/api-keys (secrets stripped server-side)" />
      {rows.length === 0 ? (
        <EmptyState title="No API keys" />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Name</AdminTh>
              <AdminTh>Active</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((r) => (
              <tr key={String(r.id)}>
                <AdminTd className="font-medium">{String(r.name ?? r.id)}</AdminTd>
                <AdminTd>{r.is_active ? "yes" : "no"}</AdminTd>
              </tr>
            ))}
          </AdminTableBody>
        </AdminDataTable>
      )}
    </div>
  );
}
