import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { adminToast } from "@/lib/adminToast";
import { cn } from "@/lib/cn";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { EmptyState } from "@/components/ui/EmptyState";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import {
  AdminDataTable,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
} from "@/components/admin/AdminDataTable";
import { Search, Send, User } from "lucide-react";

type PickerUser = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
};

type DeliveryLog = {
  id: string;
  created_at: string;
  event_type: string;
  template_key: string | null;
  status: string;
  diagnosis: string;
  error_message: string | null;
  channels: string[];
  app_type: string | null;
  tenant_id: string | null;
  onesignal_id: string | null;
  invalid_aliases: string[] | null;
  recipients_count: number;
};

type LogsSummary = { sent: number; failed: number; suppressed: number };

type LogsPayload = {
  logs: DeliveryLog[];
  meta: { page: number; limit: number; total: number; has_more: boolean; summary: LogsSummary };
};

function formatDateTime(iso: string | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return String(iso).slice(0, 19);
  }
}

function statusClasses(status: string): string {
  if (status === "sent") return "bg-emerald-100 text-emerald-800";
  if (status === "failed") return "bg-red-100 text-red-800";
  if (status === "suppressed") return "bg-amber-100 text-amber-900";
  return "bg-gray-100 text-gray-600";
}

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export function NotificationDeliveryLogsTab({ enabled }: { enabled: boolean }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search, 300);
  const [selectedUser, setSelectedUser] = useState<PickerUser | null>(null);
  const [statusFilter, setStatusFilter] = useState("");

  const usersQuery = useQuery({
    queryKey: adminQueryKeys.notificationLogUsers(debouncedSearch),
    queryFn: () =>
      adminApi.getJson<{ users: PickerUser[] }>(
        `/api/admin/notification-logs${debouncedSearch ? `?search=${encodeURIComponent(debouncedSearch)}` : ""}`,
      ),
    enabled,
  });

  const logsSignature = `s=${statusFilter}`;
  const logsQuery = useQuery({
    queryKey: adminQueryKeys.notificationLogsForUser(selectedUser?.id ?? "none", logsSignature),
    queryFn: () => {
      const p = new URLSearchParams({ user_id: selectedUser!.id, limit: "50" });
      if (statusFilter) p.set("status", statusFilter);
      return adminApi.getJson<LogsPayload>(`/api/admin/notification-logs?${p.toString()}`);
    },
    enabled: enabled && Boolean(selectedUser?.id),
  });

  const testPushMut = useMutation({
    mutationFn: (userIdToTest: string) =>
      adminApi.postJson<{ success: boolean; message?: string }>(
        "/api/admin/notification-logs",
        { user_id: userIdToTest },
      ),
    onSuccess: (res) => {
      adminToast.success(res?.message || "Test push submitted.");
      if (selectedUser?.id) {
        void qc.invalidateQueries({
          queryKey: [...adminQueryKeys.root, "notification-logs", "user", selectedUser.id],
        });
      }
    },
    onError: (e: Error) => adminToast.error(e.message || "Failed to send test push."),
  });

  const users = usersQuery.data?.users ?? [];
  const logs = logsQuery.data?.logs ?? [];
  const summary = logsQuery.data?.meta?.summary;

  const userLabel = useMemo(() => {
    if (!selectedUser) return "";
    return selectedUser.full_name || selectedUser.email || selectedUser.id;
  }, [selectedUser]);

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      {/* User picker */}
      <AdminPanel className="h-fit">
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            placeholder="Search name, email, or user ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-h-11 w-full rounded-xl border border-gray-300 py-2.5 pl-10 pr-3 text-sm"
          />
        </div>

        {usersQuery.isLoading ? (
          <p className="px-1 py-6 text-center text-sm text-gray-500">Loading users…</p>
        ) : usersQuery.error ? (
          <AdminRetryBlock message={(usersQuery.error as Error).message} onRetry={() => void usersQuery.refetch()} />
        ) : users.length === 0 ? (
          <p className="px-1 py-6 text-center text-sm text-gray-500">No users found.</p>
        ) : (
          <ul className="max-h-[60vh] space-y-1 overflow-y-auto">
            {users.map((u) => {
              const isActive = selectedUser?.id === u.id;
              return (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedUser(u)}
                    className={cn(
                      "flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left transition-colors",
                      isActive
                        ? "border-gray-900 bg-gray-900 text-white"
                        : "border-gray-200 bg-white text-gray-800 hover:bg-gray-50",
                    )}
                  >
                    <User className={cn("mt-0.5 h-4 w-4 shrink-0", isActive ? "text-white" : "text-gray-400")} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{u.full_name || "—"}</span>
                      <span className={cn("block truncate text-xs", isActive ? "text-gray-200" : "text-gray-500")}>
                        {u.email || u.id}
                      </span>
                      {u.role ? (
                        <span className={cn("mt-0.5 inline-block text-[10px] uppercase", isActive ? "text-gray-300" : "text-gray-400")}>
                          {u.role}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </AdminPanel>

      {/* Logs for selected user */}
      <div className="space-y-4">
        {!selectedUser ? (
          <EmptyState
            title="Select a user"
            description="Pick a user on the left to see their push / email / SMS delivery history."
          />
        ) : (
          <>
            <AdminPanel>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-900">{userLabel}</p>
                  <p className="truncate font-mono text-xs text-gray-500">{selectedUser.id}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="min-h-10 rounded-xl border border-gray-300 px-3 py-2 text-sm"
                    aria-label="Status filter"
                  >
                    <option value="">All statuses</option>
                    <option value="sent">Sent</option>
                    <option value="failed">Failed</option>
                    <option value="suppressed">Suppressed</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => void logsQuery.refetch()}
                    disabled={logsQuery.isFetching}
                    className="min-h-10 rounded-xl border border-gray-300 px-3 text-sm disabled:opacity-50"
                  >
                    Refresh
                  </button>
                  <button
                    type="button"
                    onClick={() => selectedUser && testPushMut.mutate(selectedUser.id)}
                    disabled={testPushMut.isPending}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" />
                    {testPushMut.isPending ? "Sending…" : "Send test push"}
                  </button>
                </div>
              </div>

              {summary ? (
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 font-medium text-emerald-800">
                    {summary.sent} sent
                  </span>
                  <span className="rounded-full bg-red-100 px-2.5 py-0.5 font-medium text-red-800">
                    {summary.failed} failed
                  </span>
                  <span className="rounded-full bg-amber-100 px-2.5 py-0.5 font-medium text-amber-900">
                    {summary.suppressed} suppressed
                  </span>
                  <span className="text-gray-500">
                    (showing {logsQuery.data?.meta?.total ?? 0} most recent)
                  </span>
                </div>
              ) : null}
            </AdminPanel>

            {logsQuery.isLoading ? (
              <AdminPanel>
                <p className="py-8 text-center text-sm text-gray-500">Loading delivery logs…</p>
              </AdminPanel>
            ) : logsQuery.error ? (
              <AdminRetryBlock message={(logsQuery.error as Error).message} onRetry={() => void logsQuery.refetch()} />
            ) : logs.length === 0 ? (
              <EmptyState
                title="No delivery logs"
                description="No notifications have been recorded for this user with the current filter."
              />
            ) : (
              <AdminDataTable>
                <AdminTableHead>
                  <tr>
                    <AdminTh>When</AdminTh>
                    <AdminTh>Event</AdminTh>
                    <AdminTh>Channels</AdminTh>
                    <AdminTh>Status</AdminTh>
                    <AdminTh>Diagnosis</AdminTh>
                  </tr>
                </AdminTableHead>
                <AdminTableBody>
                  {logs.map((log) => (
                    <tr key={log.id}>
                      <AdminTd className="whitespace-nowrap text-xs text-gray-600">
                        {formatDateTime(log.created_at)}
                      </AdminTd>
                      <AdminTd>
                        <span className="block font-mono text-xs text-gray-900">
                          {log.template_key || log.event_type}
                        </span>
                        {log.app_type ? (
                          <span className="text-[10px] uppercase text-gray-400">{log.app_type} app</span>
                        ) : null}
                      </AdminTd>
                      <AdminTd>
                        <div className="flex flex-wrap gap-1">
                          {(log.channels ?? []).map((ch) => (
                            <span
                              key={ch}
                              className="inline-flex rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium uppercase text-gray-700"
                            >
                              {ch}
                            </span>
                          ))}
                        </div>
                      </AdminTd>
                      <AdminTd>
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize",
                            statusClasses(log.status),
                          )}
                        >
                          {log.status}
                        </span>
                      </AdminTd>
                      <AdminTd className="max-w-md">
                        <span className="block text-xs text-gray-700">{log.diagnosis}</span>
                        {log.invalid_aliases && log.invalid_aliases.length > 0 ? (
                          <span className="mt-0.5 block text-[10px] text-amber-700">
                            Invalid aliases: {log.invalid_aliases.length}
                          </span>
                        ) : null}
                        {log.onesignal_id ? (
                          <span className="mt-0.5 block truncate font-mono text-[10px] text-gray-400">
                            {log.onesignal_id}
                          </span>
                        ) : null}
                      </AdminTd>
                    </tr>
                  ))}
                </AdminTableBody>
              </AdminDataTable>
            )}
          </>
        )}
      </div>
    </div>
  );
}
