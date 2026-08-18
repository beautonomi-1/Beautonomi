import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ADMIN_SECTION_USERS_TRUST } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
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

type UserBlocksPayload = {
  data: Record<string, unknown>[];
  has_more: boolean;
  meta?: { total?: number };
};

function displayUser(
  userId: string,
  profile: { full_name?: string | null; email?: string | null } | null | undefined,
): string {
  if (profile?.full_name?.trim()) return profile.full_name.trim();
  if (profile?.email?.trim()) return profile.email.trim();
  return userId.slice(0, 8) + "…";
}

export function UserBlocksListPage() {
  useAdminDocumentTitle("Blocked Users");
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_USERS_TRUST,
    "Users & trust access is required.",
  );
  const [sp, setSp] = useSearchParams();
  const userId = sp.get("user_id") || "";
  const offset = Math.max(0, parseInt(sp.get("offset") || "0", 10) || 0);
  const qk = useMemo(
    () => adminQueryKeys.userBlocks(`u=${userId}|o=${offset}`),
    [userId, offset],
  );

  const [filterDraft, setFilterDraft] = useState(userId);

  const q = useQuery({
    queryKey: qk,
    queryFn: async () => {
      const p = new URLSearchParams();
      p.set("limit", "50");
      p.set("offset", String(offset));
      if (userId) p.set("user_id", userId);
      return adminApi.getJson<UserBlocksPayload>(`/api/admin/user-blocks?${p}`, { timeoutMs: 60_000 });
    },
    enabled: allowed,
  });

  const rows = q.data?.data ?? [];
  const hasMore = q.data?.has_more ?? false;
  const total = q.data?.meta?.total;

  function applyUserFilter() {
    const n = new URLSearchParams(sp);
    const trimmed = filterDraft.trim();
    if (trimmed) n.set("user_id", trimmed);
    else n.delete("user_id");
    n.delete("offset");
    setSp(n, { replace: true });
  }

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Blocked users" />
        <AdminPanel>
          <AdminPageSkeleton rows={5} />
        </AdminPanel>
      </div>
    );
  }
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Blocked users" />
        <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Blocked users"
        description="User-initiated blocks from customer and provider mobile apps."
      />

      <AdminPanel>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500">Filter by user ID</label>
            <input
              className="mt-1 w-72 rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs"
              value={filterDraft}
              onChange={(e) => setFilterDraft(e.target.value)}
              placeholder="UUID — blocker or blocked"
            />
          </div>
          <button
            type="button"
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white"
            onClick={applyUserFilter}
          >
            Apply
          </button>
          {userId ? (
            <button
              type="button"
              className="text-sm text-primary underline"
              onClick={() => {
                setFilterDraft("");
                const n = new URLSearchParams(sp);
                n.delete("user_id");
                n.delete("offset");
                setSp(n, { replace: true });
              }}
            >
              Clear filter
            </button>
          ) : null}
        </div>
      </AdminPanel>

      <AdminPanel>
        {typeof total === "number" ? (
          <p className="mb-4 text-sm text-gray-500">{total} block{total === 1 ? "" : "s"} in tenant</p>
        ) : null}
        {rows.length === 0 ? (
          <EmptyState title="No blocks found" description="Try clearing filters or check another tenant." />
        ) : (
          <AdminDataTable>
            <AdminTableHead>
              <tr>
                <AdminTh>Blocker</AdminTh>
                <AdminTh>Blocked</AdminTh>
                <AdminTh>Reason</AdminTh>
                <AdminTh>Created</AdminTh>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {rows.map((r) => {
                const blockerId = String(r.blocker_id ?? "");
                const blockedId = String(r.blocked_user_id ?? "");
                const blocker = r.blocker as { full_name?: string; email?: string } | null;
                const blocked = r.blocked as { full_name?: string; email?: string } | null;
                return (
                  <tr key={String(r.id)}>
                    <AdminTd>
                      <Link
                        className="text-primary underline"
                        to={adminSpaTo(`/admin/users/${encodeURIComponent(blockerId)}`)}
                      >
                        {displayUser(blockerId, blocker)}
                      </Link>
                    </AdminTd>
                    <AdminTd>
                      <Link
                        className="text-primary underline"
                        to={adminSpaTo(`/admin/users/${encodeURIComponent(blockedId)}`)}
                      >
                        {displayUser(blockedId, blocked)}
                      </Link>
                    </AdminTd>
                    <AdminTd>{String(r.reason ?? "—")}</AdminTd>
                    <AdminTd>
                      {r.created_at ? new Date(String(r.created_at)).toLocaleString() : "—"}
                    </AdminTd>
                  </tr>
                );
              })}
            </AdminTableBody>
          </AdminDataTable>
        )}
        <div className="mt-4 flex gap-3">
          {offset > 0 ? (
            <button
              type="button"
              className="text-sm text-primary underline"
              onClick={() => {
                const n = new URLSearchParams(sp);
                n.set("offset", String(Math.max(0, offset - 50)));
                setSp(n, { replace: true });
              }}
            >
              Previous
            </button>
          ) : null}
          {hasMore ? (
            <button
              type="button"
              className="text-sm text-primary underline"
              onClick={() => {
                const n = new URLSearchParams(sp);
                n.set("offset", String(offset + 50));
                setSp(n, { replace: true });
              }}
            >
              Next
            </button>
          ) : null}
        </div>
      </AdminPanel>
    </div>
  );
}
