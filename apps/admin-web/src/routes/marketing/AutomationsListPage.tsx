import { useSearchParams } from "react-router-dom";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ADMIN_SECTION_MARKETING_COMMS } from "@beautonomi/admin-access";
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

export function AutomationsListPage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_MARKETING_COMMS, "Marketing access is required.");
  const [sp] = useSearchParams();
  const search = sp.get("search") || "";
  const status = sp.get("status") || "all";
  const type = sp.get("type") || "all";
  const qk = useMemo(() => adminQueryKeys.automations(`q=${search}|s=${status}|t=${type}`), [search, status, type]);

  const q = useQuery({
    queryKey: qk,
    queryFn: async () => {
      const p = new URLSearchParams();
      if (search) p.set("search", search);
      if (status !== "all") p.set("status", status);
      if (type !== "all") p.set("type", type);
      const qs = p.toString();
      return adminApi.getJson<Record<string, unknown>[]>(`/api/admin/automations${qs ? `?${qs}` : ""}`, { timeoutMs: 60_000 });
    },
    enabled: allowed,
  });
  const rows = q.data ?? [];

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Automations" />
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
      <AdminPageHeader title="Automations" description="GET /api/admin/automations" />
      {rows.length === 0 ? (
        <EmptyState title="No automations" />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Name</AdminTh>
              <AdminTh>Provider</AdminTh>
              <AdminTh>Trigger</AdminTh>
              <AdminTh>Active</AdminTh>
              <AdminTh>Executions</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((r) => {
              const row = r as Record<string, unknown>;
              return (
                <tr key={String(row.id ?? "")}>
                  <AdminTd className="font-medium">{String(row.name ?? "")}</AdminTd>
                  <AdminTd className="text-xs">{String(row.provider_name ?? "")}</AdminTd>
                  <AdminTd className="text-xs">{String(row.trigger_type ?? "")}</AdminTd>
                  <AdminTd>{String(row.is_active ?? "")}</AdminTd>
                  <AdminTd className="tabular-nums">{String(row.execution_count ?? "")}</AdminTd>
                </tr>
              );
            })}
          </AdminTableBody>
        </AdminDataTable>
      )}
    </div>
  );
}
