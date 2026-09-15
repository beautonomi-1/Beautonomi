import { useCallback, type MouseEvent as ReactMouseEvent } from "react";
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, ChevronDown, Trash2 } from "lucide-react";
import { AdminApiError } from "@beautonomi/admin-api-client";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { invalidateAdminShellCounts } from "@/lib/invalidateAdminShellCounts";

type AdminNotificationRow = {
  id: string;
  title?: string;
  message?: string;
  timestamp?: string;
  created_at?: string;
  link?: string;
  read?: boolean;
  is_read?: boolean;
};

type ActivityItem = {
  id: string;
  title?: string;
  message?: string;
  link?: string;
};

export function AdminNotificationBell() {
  const qc = useQueryClient();

  const notificationsQuery = useQuery({
    queryKey: adminQueryKeys.adminNotifications("bell"),
    queryFn: async () => {
      try {
        return await adminApi.getJson<{
          notifications?: AdminNotificationRow[];
          total_unread?: number;
        }>("/api/admin/notifications?limit=10");
      } catch (e) {
        if (e instanceof AdminApiError && (e.status === 401 || e.status === 403 || e.status >= 500)) {
          return { notifications: [], total_unread: 0 };
        }
        throw e;
      }
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const activityQuery = useQuery({
    queryKey: adminQueryKeys.activity(),
    queryFn: async () => {
      try {
        return await adminApi.getJson<{ activities?: ActivityItem[] }>("/api/admin/activity");
      } catch (e) {
        if (e instanceof AdminApiError && (e.status === 401 || e.status === 403 || e.status >= 500)) {
          return { activities: [] };
        }
        throw e;
      }
    },
    staleTime: 60_000,
    refetchInterval: 30_000,
    retry: false,
  });

  const markRead = useMutation({
    mutationFn: (id: string) =>
      adminApi.patchJson(`/api/admin/notifications/${encodeURIComponent(id)}`, { is_read: true }),
    onSuccess: () => invalidateAdminShellCounts(qc),
  });

  const deleteNotification = useMutation({
    mutationFn: (id: string) =>
      adminApi.deleteJson(`/api/admin/notifications/${encodeURIComponent(id)}`),
    onSuccess: () => invalidateAdminShellCounts(qc),
  });

  const markAllRead = useMutation({
    mutationFn: () => adminApi.postJson("/api/admin/notifications/mark-all-read", {}),
    onSuccess: () => invalidateAdminShellCounts(qc),
  });

  const unreadCount = notificationsQuery.data?.total_unread ?? 0;
  const notifications = notificationsQuery.data?.notifications ?? [];
  const queueItems = activityQuery.data?.activities ?? [];

  const activityLinkTo = useCallback((href: string) => adminSpaTo(href), []);

  const closeDetails = (e: ReactMouseEvent<HTMLElement>) => {
    const details = (e.currentTarget.closest("details") as HTMLDetailsElement | null);
    if (details) details.open = false;
  };

  return (
    <details className="relative">
      <summary
        className="relative flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center gap-1 rounded-xl p-2 hover:bg-gray-100 touch-manipulation"
        aria-label={
          unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"
        }
      >
        <Bell className="h-5 w-5 text-gray-600" aria-hidden />
        {unreadCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
        <ChevronDown className="hidden h-4 w-4 text-gray-400 sm:block" aria-hidden />
      </summary>
      <div className="absolute right-0 z-30 mt-1 w-96 max-h-[min(28rem,75vh)] overflow-auto rounded-lg border border-gray-200 bg-white p-2 text-xs shadow-lg">
        <div className="mb-2 flex items-center justify-between gap-2 px-1">
          <span className="font-semibold text-gray-900">Notifications</span>
          {unreadCount > 0 ? (
            <button
              type="button"
              className="text-primary hover:underline"
              onClick={() => void markAllRead.mutateAsync()}
              disabled={markAllRead.isPending}
            >
              Mark all read
            </button>
          ) : null}
        </div>

        {notificationsQuery.isLoading ? (
          <p className="px-1 text-gray-500">Loading…</p>
        ) : notifications.length === 0 ? (
          <p className="px-1 text-gray-500">No notifications.</p>
        ) : (
          <ul className="space-y-1">
            {notifications.map((n) => {
              const isUnread = !(n.read ?? n.is_read);
              const to = n.link ? activityLinkTo(n.link) : adminSpaTo("/admin/notifications/inbox");
              return (
                <li
                  key={n.id}
                  className={`flex items-start gap-1 rounded-lg px-1 py-1 ${isUnread ? "bg-primary/5" : ""}`}
                >
                  <Link
                    to={to}
                    className="min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left text-gray-800 hover:bg-primary/5"
                    onClick={(e: ReactMouseEvent<HTMLAnchorElement>) => {
                      if (isUnread) void markRead.mutateAsync(n.id);
                      closeDetails(e);
                    }}
                  >
                    <span className="font-medium text-gray-900">{n.title ?? "Notification"}</span>
                    <span className="mt-0.5 block text-gray-600">{n.message ?? ""}</span>
                  </Link>
                  <button
                    type="button"
                    className="mt-1 shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                    aria-label="Delete notification"
                    onClick={() => void deleteNotification.mutateAsync(n.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-2 border-t border-gray-100 pt-2">
          <Link
            to={adminSpaTo("/admin/notifications/inbox")}
            className="block px-2 py-1 text-primary hover:underline"
            onClick={closeDetails}
          >
            View all notifications
          </Link>
        </div>

        <div className="mt-3 border-t border-gray-100 pt-2">
          <div className="mb-1 flex items-center justify-between px-1">
            <span className="font-semibold text-gray-900">Queues</span>
            <span className="text-[10px] text-gray-500">Live work waiting</span>
          </div>
          {activityQuery.isLoading ? (
            <p className="px-1 text-gray-500">Loading queues…</p>
          ) : queueItems.length === 0 ? (
            <p className="px-1 text-gray-500">No queue items right now.</p>
          ) : (
            <ul className="space-y-1">
              {queueItems.slice(0, 8).map((a) => {
                const to = a.link ? activityLinkTo(a.link) : adminSpaTo("/dashboard");
                return (
                  <li key={a.id}>
                    <Link
                      to={to}
                      className="block rounded-lg px-2 py-1.5 text-left text-gray-800 hover:bg-gray-50"
                      onClick={closeDetails}
                    >
                      <span className="font-medium text-gray-900">{a.title ?? "Queue item"}</span>
                      {a.message ? (
                        <span className="mt-0.5 block text-gray-600">{a.message}</span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </details>
  );
}
