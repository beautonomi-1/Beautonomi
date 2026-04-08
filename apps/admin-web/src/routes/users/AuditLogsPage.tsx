import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ADMIN_SECTION_USERS_TRUST } from "@beautonomi/admin-access";
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
import { downloadAdminBlob } from "@/lib/adminCsvDownload";

type LogRow = Record<string, unknown> & {
  id?: string;
  action?: string;
  entity_type?: string;
  created_at?: string;
  actor?: { full_name?: string; email?: string } | null;
};

type LogsEnvelope = {
  data: LogRow[];
  meta?: { page: number; limit: number; total: number; has_more: boolean };
};

export function AuditLogsPage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_USERS_TRUST, "Users & trust access is required.");
  const [sp, setSp] = useSearchParams();
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
  const search = sp.get("search") || "";
  const qk = useMemo(() => `${page}|${search}`, [page, search]);

  const q = useQuery({
    queryKey: adminQueryKeys.auditLogs(qk),
    queryFn: async () => {
      const p = new URLSearchParams();
      p.set("page", String(page));
      p.set("limit", "30");
      if (search) p.set("search", search);
      return adminApi.getRawJson<LogsEnvelope>(`/api/admin/audit-logs?${p}`, { timeoutMs: 60_000 });
    },
    enabled: allowed,
  });

  const rows = q.data?.data ?? [];
  const meta = q.data?.meta;

  function updateParams(next: Record<string, string | null>) {
    const n = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(next)) {
      if (v == null || v === "") n.delete(k);
      else n.set(k, v);
    }
    setSp(n, { replace: true });
  }

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Audit logs" />
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
      <AdminPageHeader title="Audit logs" />
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
          onClick={() =>
            void downloadAdminBlob("/api/admin/export/audit-logs", `audit-logs-${Date.now()}.csv`).catch(() =>
              alert("Export failed")
            )
          }
        >
          Export CSV
        </button>
      </div>
      <AdminPanel>
        <input
          type="search"
          placeholder="Search action / entity / role"
          defaultValue={search}
          onBlur={(e) => updateParams({ search: e.target.value.trim() || null, page: "1" })}
          className="w-full max-w-md rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        {meta ? (
          <p className="mt-2 text-sm text-gray-600">
            Page {meta.page} · showing {rows.length} · total {meta.total}
          </p>
        ) : null}
      </AdminPanel>
      {rows.length === 0 ? (
        <EmptyState title="No logs" />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>When</AdminTh>
              <AdminTh>Actor</AdminTh>
              <AdminTh>Action</AdminTh>
              <AdminTh>Entity</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((r) => (
              <tr key={String(r.id)}>
                <AdminTd className="whitespace-nowrap text-xs">{String(r.created_at ?? "").slice(0, 19)}</AdminTd>
                <AdminTd className="text-xs">{String(r.actor?.full_name ?? r.actor?.email ?? "")}</AdminTd>
                <AdminTd className="text-xs">{String(r.action ?? "")}</AdminTd>
                <AdminTd className="text-xs">{String(r.entity_type ?? "")}</AdminTd>
              </tr>
            ))}
          </AdminTableBody>
        </AdminDataTable>
      )}
      {meta && meta.has_more ? (
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
            disabled={page <= 1}
            onClick={() => updateParams({ page: String(page - 1) })}
          >
            Previous
          </button>
          <button
            type="button"
            className="rounded border border-gray-300 px-3 py-2 text-sm"
            onClick={() => updateParams({ page: String(page + 1) })}
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}
