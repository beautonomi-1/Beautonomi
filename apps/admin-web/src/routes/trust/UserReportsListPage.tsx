import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ADMIN_SECTION_PROVIDERS_OPERATIONS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { adminTabButtonClass } from "@/lib/adminUi";
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

type UserReportsPayload = {
  data: Record<string, unknown>[];
  has_more: boolean;
};

export function UserReportsListPage() {
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_PROVIDERS_OPERATIONS,
    "Providers & operations access is required."
  );
  const [sp, setSp] = useSearchParams();
  const status = sp.get("status") || "all";
  const offset = Math.max(0, parseInt(sp.get("offset") || "0", 10) || 0);
  const qk = useMemo(() => adminQueryKeys.userReports(`s=${status}|o=${offset}`), [status, offset]);

  const q = useQuery({
    queryKey: qk,
    queryFn: async () => {
      const p = new URLSearchParams();
      p.set("limit", "50");
      p.set("offset", String(offset));
      if (status !== "all") p.set("status", status);
      return adminApi.getJson<UserReportsPayload>(`/api/admin/user-reports?${p}`, { timeoutMs: 60_000 });
    },
    enabled: allowed,
  });

  const rows = q.data?.data ?? [];
  const hasMore = q.data?.has_more ?? false;

  function setStatus(next: string) {
    const n = new URLSearchParams(sp);
    if (next === "all") n.delete("status");
    else n.set("status", next);
    n.delete("offset");
    setSp(n, { replace: true });
  }

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="User reports" />
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

  const tabs = ["all", "pending", "resolved", "dismissed"] as const;

  return (
    <div className="space-y-6">
      <AdminPageHeader title="User reports" description="GET /api/admin/user-reports" />
      <p className="text-sm text-gray-600">
        <a href={legacyAdminHref("/admin/user-reports")} className="font-medium text-gray-900 underline">
          Legacy user reports (resolve) →
        </a>
      </p>
      <AdminPanel>
        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button
              key={t}
              type="button"
              className={adminTabButtonClass(status === t)}
              onClick={() => setStatus(t)}
            >
              {t}
            </button>
          ))}
        </div>
      </AdminPanel>
      {rows.length === 0 ? (
        <EmptyState title="No reports" />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Type</AdminTh>
              <AdminTh>Status</AdminTh>
              <AdminTh>Reporter</AdminTh>
              <AdminTh>Reported</AdminTh>
              <AdminTh>Description</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((r) => {
              const row = r as Record<string, unknown>;
              const rep = row.reporter as { full_name?: string; email?: string } | null;
              const reported = row.reported as { full_name?: string; email?: string } | null;
              return (
                <tr key={String(row.id ?? "")}>
                  <AdminTd>{String(row.report_type ?? "")}</AdminTd>
                  <AdminTd>{String(row.status ?? "")}</AdminTd>
                  <AdminTd className="text-xs">{String(rep?.full_name ?? rep?.email ?? "")}</AdminTd>
                  <AdminTd className="text-xs">{String(reported?.full_name ?? reported?.email ?? "")}</AdminTd>
                  <AdminTd className="max-w-xs truncate text-xs">{String(row.description ?? "")}</AdminTd>
                </tr>
              );
            })}
          </AdminTableBody>
        </AdminDataTable>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          className="rounded border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
          disabled={offset <= 0}
          onClick={() => {
            const n = new URLSearchParams(sp);
            n.set("offset", String(Math.max(0, offset - 50)));
            setSp(n, { replace: true });
          }}
        >
          Previous
        </button>
        <button
          type="button"
          className="rounded border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
          disabled={!hasMore}
          onClick={() => {
            const n = new URLSearchParams(sp);
            n.set("offset", String(offset + 50));
            setSp(n, { replace: true });
          }}
        >
          Next
        </button>
      </div>
    </div>
  );
}
