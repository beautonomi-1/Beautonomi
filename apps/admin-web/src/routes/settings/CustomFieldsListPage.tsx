import { useSearchParams } from "react-router-dom";
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

type Field = Record<string, unknown> & { id?: string; name?: string; label?: string; entity_type?: string };

export function CustomFieldsListPage() {
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_PLATFORM_CONFIG,
    "Platform configuration access is required."
  );
  const [sp, setSp] = useSearchParams();
  const entity = sp.get("entity_type") || "";

  const q = useQuery({
    queryKey: adminQueryKeys.customFields(entity || "all"),
    queryFn: async () => {
      const p = new URLSearchParams();
      if (entity) p.set("entity_type", entity);
      return adminApi.getJson<{ fields: Field[] }>(`/api/admin/custom-fields?${p}`, { timeoutMs: 30_000 });
    },
    enabled: allowed,
  });

  const rows = q.data?.fields ?? [];

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Custom fields" />
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
      <AdminPageHeader title="Custom fields" description="GET /api/admin/custom-fields" />
      <p className="text-sm text-gray-600">
        <a href={legacyAdminHref("/admin/custom-fields")} className="font-medium text-gray-900 underline">
          Manage in legacy →
        </a>
      </p>
      <AdminPanel>
        <label className="text-sm text-gray-600">
          Entity{" "}
          <select
            className="ml-2 rounded border border-gray-300 px-2 py-1 text-sm"
            value={entity}
            onChange={(e) => {
              const n = new URLSearchParams(sp);
              if (e.target.value) n.set("entity_type", e.target.value);
              else n.delete("entity_type");
              setSp(n, { replace: true });
            }}
          >
            <option value="">All</option>
            <option value="user">user</option>
            <option value="provider">provider</option>
            <option value="booking">booking</option>
            <option value="service">service</option>
          </select>
        </label>
      </AdminPanel>
      {rows.length === 0 ? (
        <EmptyState title="No custom fields" />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Name</AdminTh>
              <AdminTh>Label</AdminTh>
              <AdminTh>Entity</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((r) => (
              <tr key={String(r.id)}>
                <AdminTd className="font-mono text-xs">{String(r.name ?? "")}</AdminTd>
                <AdminTd>{String(r.label ?? "")}</AdminTd>
                <AdminTd>{String(r.entity_type ?? "")}</AdminTd>
              </tr>
            ))}
          </AdminTableBody>
        </AdminDataTable>
      )}
    </div>
  );
}
