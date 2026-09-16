import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { ADMIN_SECTION_OVERVIEW } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { invalidateAdminShellCounts } from "@/lib/invalidateAdminShellCounts";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";

type NotificationRow = {
  id: string;
  title?: string;
  message?: string;
  created_at?: string;
  link?: string;
  read?: boolean;
  is_read?: boolean;
  type?: string;
};

const PAGE_SIZE = 25;

export function NotificationsInboxPage() {
  useAdminDocumentTitle("Notifications");
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_OVERVIEW,
    "You do not have access to the notifications inbox.",
  );
  const qc = useQueryClient();
  const [sp, setSp] = useSearchParams();
  const page = Math.max(0, parseInt(sp.get("page") || "0", 10) || 0);
  const unreadOnly = sp.get("unread_only") === "1";
  const typeFilter = sp.get("type") ?? "";
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const listQ = useQuery({
    queryKey: adminQueryKeys.adminNotifications(`page-${page}-${unreadOnly}-${typeFilter}`),
    queryFn: () => {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
      });
      if (unreadOnly) params.set("unread_only", "true");
      if (typeFilter) params.set("type", typeFilter);
      return adminApi.getJson<{
        notifications: NotificationRow[];
        total?: number;
        total_unread?: number;
        has_more?: boolean;
      }>(`/api/admin/notifications?${params.toString()}`);
    },
    enabled: allowed,
  });

  const refreshShell = () => {
    invalidateAdminShellCounts(qc);
    void listQ.refetch();
    setSelectedIds(new Set());
  };

  const markRead = useMutation({
    mutationFn: (ids: string[]) =>
      Promise.all(
        ids.map((id) =>
          adminApi.patchJson(`/api/admin/notifications/${encodeURIComponent(id)}`, { is_read: true }),
        ),
      ),
    onSuccess: () => refreshShell(),
  });

  const markUnread = useMutation({
    mutationFn: (ids: string[]) =>
      Promise.all(
        ids.map((id) =>
          adminApi.patchJson(`/api/admin/notifications/${encodeURIComponent(id)}`, { is_read: false }),
        ),
      ),
    onSuccess: () => refreshShell(),
  });

  const deleteIds = useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 1) {
        await adminApi.deleteJson(`/api/admin/notifications/${encodeURIComponent(ids[0]!)}`);
        return { deleted: 1 };
      }
      return adminApi.postJson<{ deleted: number }>("/api/admin/notifications/bulk-delete", { ids });
    },
    onSuccess: () => refreshShell(),
  });

  const markAllRead = useMutation({
    mutationFn: () => adminApi.postJson("/api/admin/notifications/mark-all-read", {}),
    onSuccess: () => refreshShell(),
  });

  const setFilter = (key: "unread_only" | "type" | "page", value: string) => {
    setSp(
      (prev) => {
        const n = new URLSearchParams(prev);
        if (key === "page") {
          if (value === "0") n.delete("page");
          else n.set("page", value);
        } else if (key === "unread_only") {
          if (value === "1") n.set("unread_only", "1");
          else n.delete("unread_only");
          n.delete("page");
        } else if (key === "type") {
          if (value) n.set("type", value);
          else n.delete("type");
          n.delete("page");
        }
        return n;
      },
      { replace: true },
    );
    setSelectedIds(new Set());
  };

  if (denied) return denied;

  const rows = listQ.data?.notifications ?? [];
  const totalUnread = listQ.data?.total_unread ?? 0;
  const hasMore = listQ.data?.has_more ?? false;

  const pageIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const selectedOnPage = pageIds.filter((id) => selectedIds.has(id));

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const togglePage = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        for (const id of pageIds) next.delete(id);
      } else {
        for (const id of pageIds) next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Notifications</h1>
          <p className="text-sm text-gray-600">{totalUnread} unread</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(e) => setFilter("unread_only", e.target.checked ? "1" : "0")}
            />
            Unread only
          </label>
          <select
            className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
            value={typeFilter}
            onChange={(e) => setFilter("type", e.target.value)}
          >
            <option value="">All types</option>
            <option value="admin_ops_alert">Ops alerts</option>
            <option value="agent_proposal">Agent proposals</option>
            <option value="support_queue">Support queue</option>
            <option value="support_ticket_updated">Support tickets</option>
            <option value="system">System</option>
          </select>
          {totalUnread > 0 ? (
            <button
              type="button"
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"
              onClick={() => void markAllRead.mutateAsync()}
              disabled={markAllRead.isPending}
            >
              Mark all read
            </button>
          ) : null}
        </div>
      </div>

      {rows.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={allOnPageSelected} onChange={togglePage} />
            Select page ({selectedOnPage.length}/{rows.length})
          </label>
          {selectedOnPage.length > 0 ? (
            <>
              <button
                type="button"
                className="rounded-lg border border-gray-200 bg-white px-3 py-1 text-sm hover:bg-gray-50"
                disabled={markRead.isPending}
                onClick={() => void markRead.mutateAsync(selectedOnPage)}
              >
                Mark selected read
              </button>
              <button
                type="button"
                className="rounded-lg border border-red-200 bg-white px-3 py-1 text-sm text-red-700 hover:bg-red-50"
                disabled={deleteIds.isPending}
                onClick={() => void deleteIds.mutateAsync(selectedOnPage)}
              >
                Delete selected
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      {listQ.isLoading ? (
        <AdminPageSkeleton rows={4} />
      ) : listQ.isError ? (
        isAdminApiAuthFailure(listQ.error) ? (
          <PermissionDenied />
        ) : (
          <AdminRetryBlock
            message={listQ.error instanceof Error ? listQ.error.message : "Could not load notifications"}
            onRetry={() => void listQ.refetch()}
          />
        )
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500">No notifications to show.</p>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
          {rows.map((n) => {
            const unread = !(n.read ?? n.is_read);
            const href = n.link ? adminSpaTo(n.link) : undefined;
            const checked = selectedIds.has(n.id);
            return (
              <li key={n.id} className={`flex gap-2 p-4 ${unread ? "bg-primary/5" : ""}`}>
                <input
                  type="checkbox"
                  className="mt-1 shrink-0"
                  checked={checked}
                  onChange={() => toggleOne(n.id)}
                  aria-label={`Select ${n.title ?? "notification"}`}
                />
                <div className="min-w-0 flex-1">
                  {href ? (
                    <Link
                      to={href}
                      className="font-medium text-gray-900 hover:text-primary"
                      onClick={() => {
                        if (unread) void markRead.mutateAsync([n.id]);
                      }}
                    >
                      {n.title ?? "Notification"}
                    </Link>
                  ) : (
                    <span className="font-medium text-gray-900">{n.title ?? "Notification"}</span>
                  )}
                  {n.message ? <p className="mt-1 text-sm text-gray-600">{n.message}</p> : null}
                  {n.created_at ? (
                    <p className="mt-1 text-xs text-gray-400">{new Date(n.created_at).toLocaleString()}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  {unread ? (
                    <button
                      type="button"
                      className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
                      onClick={() => void markRead.mutateAsync([n.id])}
                    >
                      Mark read
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
                      onClick={() => void markUnread.mutateAsync([n.id])}
                    >
                      Mark unread
                    </button>
                  )}
                  <button
                    type="button"
                    className="rounded p-2 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                    aria-label="Delete"
                    onClick={() => void deleteIds.mutateAsync([n.id])}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm disabled:opacity-40"
          disabled={page === 0}
          onClick={() => setFilter("page", String(page - 1))}
        >
          Previous
        </button>
        <span className="text-xs text-gray-500">Page {page + 1}</span>
        <button
          type="button"
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm disabled:opacity-40"
          disabled={!hasMore}
          onClick={() => setFilter("page", String(page + 1))}
        >
          Next
        </button>
      </div>
    </div>
  );
}
