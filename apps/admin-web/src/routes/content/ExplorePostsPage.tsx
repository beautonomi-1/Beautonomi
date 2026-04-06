import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
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

type ExplorePayload = {
  posts: Record<string, unknown>[];
  total: number;
  limit: number;
  offset: number;
};

export function ExplorePostsPage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_CONTENT_CATALOG, "Content & catalog access is required.");
  const [sp, setSp] = useSearchParams();
  const offset = Math.max(0, parseInt(sp.get("offset") || "0", 10) || 0);
  const hidden = sp.get("hidden") || "";
  const qk = useMemo(() => adminQueryKeys.explorePosts(`o=${offset}|h=${hidden}`), [offset, hidden]);

  const q = useQuery({
    queryKey: qk,
    queryFn: async () => {
      const p = new URLSearchParams();
      p.set("limit", "50");
      p.set("offset", String(offset));
      if (hidden === "true" || hidden === "false") p.set("hidden", hidden);
      return adminApi.getJson<ExplorePayload>(`/api/admin/explore/posts?${p}`, { timeoutMs: 60_000 });
    },
    enabled: allowed,
  });
  const rows = q.data?.posts ?? [];
  const total = q.data?.total ?? 0;

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Explore" />
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
      <AdminPageHeader title="Explore posts" description="GET /api/admin/explore/posts" />
      <p className="text-sm text-gray-600">
        <a href={legacyAdminHref("/admin/explore")} className="font-medium text-gray-900 underline">
          Legacy moderation →
        </a>
      </p>
      <AdminPanel>
        <p className="text-sm text-gray-600">
          Showing {rows.length} of {total}
        </p>
      </AdminPanel>
      {rows.length === 0 ? (
        <EmptyState title="No posts" />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Caption</AdminTh>
              <AdminTh>Status</AdminTh>
              <AdminTh>Hidden</AdminTh>
              <AdminTh>Likes</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((r) => {
              const row = r as Record<string, unknown>;
              return (
                <tr key={String(row.id ?? "")}>
                  <AdminTd className="max-w-md truncate text-xs">{String(row.caption ?? "").slice(0, 80)}</AdminTd>
                  <AdminTd>{String(row.status ?? "")}</AdminTd>
                  <AdminTd>{String(row.is_hidden ?? "")}</AdminTd>
                  <AdminTd className="tabular-nums">{String(row.like_count ?? "")}</AdminTd>
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
          disabled={offset + rows.length >= total}
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
