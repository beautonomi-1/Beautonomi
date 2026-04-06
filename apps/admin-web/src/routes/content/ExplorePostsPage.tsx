import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

type ExplorePayload = {
  posts: Record<string, unknown>[];
  total: number;
  limit: number;
  offset: number;
};

export function ExplorePostsPage() {
  const qc = useQueryClient();
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_CONTENT_CATALOG, "Content & catalog access is required.");
  const [sp, setSp] = useSearchParams();
  const offset = Math.max(0, parseInt(sp.get("offset") || "0", 10) || 0);
  const hidden = sp.get("hidden") || "";
  const qk = useMemo(() => adminQueryKeys.explorePosts(`o=${offset}|h=${hidden}`), [offset, hidden]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

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

  const modMut = useMutation({
    mutationFn: (action: "hide" | "unhide") =>
      adminApi.postJson<{ updated?: number }>("/api/admin/explore/posts", {
        action,
        post_ids: Array.from(selected),
        moderation_notes: action === "hide" && notes.trim() ? notes.trim() : undefined,
      }),
    onSuccess: async (res) => {
      setSelected(new Set());
      setMsg(`Updated ${res?.updated ?? 0} post(s).`);
      await qc.invalidateQueries({ queryKey: adminQueryKeys.explorePosts("") });
      await qc.invalidateQueries({ queryKey: qk });
    },
    onError: (e) => setMsg(e instanceof Error ? e.message : "Moderation failed"),
  });

  const toggle = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const allIds = rows.map((r) => String((r as { id?: string }).id ?? "")).filter(Boolean);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));

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
      <AdminPageHeader
        title="Explore posts"
        description="Tenant-scoped feed moderation. Select posts, then hide or unhide (POST /api/admin/explore/posts)."
      />
      {msg ? (
        <AdminPanel>
          <p className="text-sm text-gray-700">{msg}</p>
        </AdminPanel>
      ) : null}
      <AdminPanel>
        <p className="text-sm text-gray-600">
          Showing {rows.length} of {total}
        </p>
        {rows.length > 0 ? (
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <label className="flex flex-1 min-w-[200px] flex-col text-xs font-medium text-gray-600">
              Moderation note (optional, hide only)
              <textarea
                className="mt-1 min-h-[60px] rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 disabled:opacity-50"
                disabled={selected.size === 0 || modMut.isPending}
                onClick={() => modMut.mutate("hide")}
              >
                Hide selected
              </button>
              <button
                type="button"
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 disabled:opacity-50"
                disabled={selected.size === 0 || modMut.isPending}
                onClick={() => modMut.mutate("unhide")}
              >
                Unhide selected
              </button>
            </div>
          </div>
        ) : null}
      </AdminPanel>
      {rows.length === 0 ? (
        <EmptyState title="No posts" />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh className="w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => {
                    if (allSelected) setSelected(new Set());
                    else setSelected(new Set(allIds));
                  }}
                  aria-label="Select all on page"
                />
              </AdminTh>
              <AdminTh>Caption</AdminTh>
              <AdminTh>Status</AdminTh>
              <AdminTh>Hidden</AdminTh>
              <AdminTh>Likes</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((r) => {
              const row = r as Record<string, unknown>;
              const id = String(row.id ?? "");
              return (
                <tr key={id}>
                  <AdminTd>
                    <input
                      type="checkbox"
                      checked={selected.has(id)}
                      onChange={() => toggle(id)}
                      aria-label={`Select post ${id}`}
                    />
                  </AdminTd>
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
