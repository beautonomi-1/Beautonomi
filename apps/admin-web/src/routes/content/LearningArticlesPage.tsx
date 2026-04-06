import { useSearchParams } from "react-router-dom";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ADMIN_SECTION_CONTENT_CATALOG } from "@beautonomi/admin-access";
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

export function LearningArticlesPage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_CONTENT_CATALOG, "Content & catalog access is required.");
  const [sp] = useSearchParams();
  const status = sp.get("status") || "";
  const qk = useMemo(() => adminQueryKeys.learningArticles(status || "all"), [status]);

  const q = useQuery({
    queryKey: qk,
    queryFn: async () => {
      const p = new URLSearchParams();
      if (status) p.set("status", status);
      const qs = p.toString();
      return adminApi.getJson<Record<string, unknown>[]>(`/api/admin/content/learning/articles${qs ? `?${qs}` : ""}`, {
        timeoutMs: 60_000,
      });
    },
    enabled: allowed,
  });
  const rows = q.data ?? [];

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Learning" />
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
      <AdminPageHeader title="Learning articles" description="GET /api/admin/content/learning/articles" />
      <p className="text-sm text-gray-600">
        <a href={legacyAdminHref("/admin/content/learning")} className="font-medium text-gray-900 underline">
          Legacy learning CMS →
        </a>
      </p>
      {rows.length === 0 ? (
        <EmptyState title="No articles" />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Title</AdminTh>
              <AdminTh>Slug</AdminTh>
              <AdminTh>Status</AdminTh>
              <AdminTh>Audience</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((r) => {
              const row = r as Record<string, unknown>;
              return (
                <tr key={String(row.id ?? "")}>
                  <AdminTd className="font-medium">{String(row.title ?? "")}</AdminTd>
                  <AdminTd className="font-mono text-xs">{String(row.slug ?? "")}</AdminTd>
                  <AdminTd>{String(row.status ?? "")}</AdminTd>
                  <AdminTd>{String(row.audience ?? "")}</AdminTd>
                </tr>
              );
            })}
          </AdminTableBody>
        </AdminDataTable>
      )}
    </div>
  );
}
