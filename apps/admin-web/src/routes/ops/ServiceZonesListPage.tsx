import { useSearchParams } from "react-router-dom";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { ADMIN_SECTION_OPERATIONS } from "@beautonomi/admin-access";
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

type ZoneRow = Record<string, unknown>;

export function ServiceZonesListPage() {
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_OPERATIONS,
    "Operations access is required for market coverage (same section as /api/admin/service-zones)."
  );
  const [sp, setSp] = useSearchParams();
  const archived = sp.get("include_archived") === "1" || sp.get("include_archived") === "true";
  const qk = useMemo(() => adminQueryKeys.serviceZones(archived ? "archived" : "active"), [archived]);

  const q = useQuery({
    queryKey: qk,
    queryFn: async () => {
      const p = archived ? "?include_archived=true" : "";
      return adminApi.getJson<ZoneRow[]>(`/api/admin/service-zones${p}`, { timeoutMs: 60_000 });
    },
    enabled: allowed,
  });
  const rows = q.data ?? [];

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Service zones" />
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
      <AdminPageHeader title="Market coverage" description="GET /api/admin/service-zones" />
      <AdminPanel>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={archived}
            onChange={(e) => {
              const n = new URLSearchParams(sp);
              if (e.target.checked) n.set("include_archived", "true");
              else n.delete("include_archived");
              setSp(n, { replace: true });
            }}
          />
          Include archived
        </label>
      </AdminPanel>
      {rows.length === 0 ? (
        <EmptyState title="No zones" />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Name</AdminTh>
              <AdminTh>Country</AdminTh>
              <AdminTh>Status</AdminTh>
              <AdminTh>Inclusions</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((z) => (
              <tr key={String(z.id ?? "")}>
                <AdminTd className="font-medium">{String(z.name ?? "")}</AdminTd>
                <AdminTd>{String(z.country_code ?? "")}</AdminTd>
                <AdminTd>{String(z.status ?? "")}</AdminTd>
                <AdminTd className="tabular-nums">{String(z.inclusion_count ?? "")}</AdminTd>
              </tr>
            ))}
          </AdminTableBody>
        </AdminDataTable>
      )}
    </div>
  );
}
