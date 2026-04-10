import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_PLATFORM_CONFIG } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { adminToolbarButtonClass } from "@/lib/adminUi";
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
import { adminSpaTo } from "@/lib/adminSpaPath";

type FlagRow = {
  id: string;
  feature_name: string;
  category?: string;
  is_enabled: boolean;
  description?: string;
  tenant_id?: string | null;
};

export function FeatureFlagsListPage() {
  useAdminDocumentTitle("Feature Flags");
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_PLATFORM_CONFIG,
    "Platform configuration access is required."
  );
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: adminQueryKeys.featureFlags(),
    queryFn: () => adminApi.getJson<FlagRow[]>("/api/admin/feature-flags", { timeoutMs: 60_000 }),
    enabled: allowed,
  });

  const rows = Array.isArray(q.data) ? q.data : [];

  const toggleMut = useMutation({
    mutationFn: ({ id, is_enabled }: { id: string; is_enabled: boolean }) =>
      adminApi.patchJson(`/api/admin/feature-flags/${id}`, { is_enabled }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: adminQueryKeys.featureFlags() }),
  });

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

  // Group by category
  const byCategory: Record<string, FlagRow[]> = {};
  for (const flag of rows) {
    const cat = flag.category ?? "Uncategorised";
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(flag);
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Feature flags"
        description="Toggle features on/off per tenant or globally."
        actions={
          <button
            type="button"
            className={adminToolbarButtonClass(q.isFetching)}
            disabled={q.isFetching}
            onClick={() => void q.refetch()}
          >
            Refresh
          </button>
        }
      />
      <p className="text-sm text-gray-600">
        <Link to={adminSpaTo("/admin/control-plane/feature-flags")} className="font-medium text-gray-900 underline">
          Control plane tools (preview &amp; resolver) →
        </Link>
      </p>
      {rows.length === 0 ? (
        <EmptyState title="No flags" />
      ) : (
        Object.entries(byCategory).sort(([a], [b]) => a.localeCompare(b)).map(([cat, flags]) => (
          <div key={cat}>
            <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{cat}</h3>
            <AdminDataTable>
              <AdminTableHead>
                <tr>
                  <AdminTh>Feature</AdminTh>
                  <AdminTh>Description</AdminTh>
                  <AdminTh>Scope</AdminTh>
                  <AdminTh>Enabled</AdminTh>
                </tr>
              </AdminTableHead>
              <AdminTableBody>
                {flags.map((r) => (
                  <tr key={r.id}>
                    <AdminTd className="font-mono text-xs font-medium">{r.feature_name}</AdminTd>
                    <AdminTd className="max-w-xs text-xs text-gray-500">{r.description ?? "—"}</AdminTd>
                    <AdminTd className="text-xs">{r.tenant_id ? "Tenant" : "Global"}</AdminTd>
                    <AdminTd>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={r.is_enabled}
                        disabled={toggleMut.isPending}
                        onClick={() => toggleMut.mutate({ id: r.id, is_enabled: !r.is_enabled })}
                        className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors disabled:opacity-50 ${
                          r.is_enabled ? "bg-indigo-600" : "bg-gray-200"
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition ${
                            r.is_enabled ? "translate-x-4" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </AdminTd>
                  </tr>
                ))}
              </AdminTableBody>
            </AdminDataTable>
          </div>
        ))
      )}
    </div>
  );
}
