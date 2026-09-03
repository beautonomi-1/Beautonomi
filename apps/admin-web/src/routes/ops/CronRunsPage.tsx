import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useSuperadminPage } from "@/hooks/useSuperadminPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
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
import { adminToolbarButtonClass } from "@/lib/adminUi";
import { cn } from "@/lib/cn";

interface CronRunRow {
  id: number;
  job_name: string;
  started_at: string;
  finished_at?: string | null;
  status: string;
  summary?: unknown;
  error?: string | null;
}

function formatDuration(startedAt: string, finishedAt?: string | null): string {
  if (!finishedAt) return "—";
  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function CronRunsPage() {
  useAdminDocumentTitle("Cron runs");
  const { allowed, denied } = useSuperadminPage("Superadmin access is required to view cron history.");
  const [statusFilter, setStatusFilter] = useState("");
  const [jobFilter, setJobFilter] = useState("");

  const query = useQuery({
    queryKey: adminQueryKeys.cronRuns(statusFilter, jobFilter),
    enabled: allowed,
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "100" });
      if (statusFilter) params.set("status", statusFilter);
      if (jobFilter.trim()) params.set("job_name", jobFilter.trim());
      return adminApi.getJson<CronRunRow[]>(`/api/admin/cron/runs?${params}`, {
        timeoutMs: 30_000,
      });
    },
  });

  if (denied) return denied;

  const rows = Array.isArray(query.data) ? query.data : [];
  const authFailed = isAdminApiAuthFailure(query.error);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Cron run history"
        description="Recent scheduled job executions from cron_runs. Failed rows link to webhook forensics on the Webhooks page."
      />

      <AdminPanel>
        <div className="mb-4 flex flex-wrap gap-2">
          <input
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
            placeholder="Filter by job name"
            value={jobFilter}
            onChange={(e) => setJobFilter(e.target.value)}
          />
          <select
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All statuses</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="running">Running</option>
            <option value="skipped">Skipped</option>
          </select>
          <button
            type="button"
            className={adminToolbarButtonClass()}
            onClick={() => void query.refetch()}
          >
            Refresh
          </button>
        </div>

        {query.isLoading ? (
          <AdminPageSkeleton rows={3} />
        ) : authFailed ? (
          <AdminRetryBlock message={query.error instanceof Error ? query.error.message : "Failed to load"} onRetry={() => void query.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState title="No cron runs yet" description="Runs appear after migration 864 is applied and crons execute." />
        ) : (
          <AdminDataTable>
            <AdminTableHead>
              <AdminTh>Job</AdminTh>
              <AdminTh>Status</AdminTh>
              <AdminTh>Started</AdminTh>
              <AdminTh>Duration</AdminTh>
              <AdminTh>Error</AdminTh>
            </AdminTableHead>
            <AdminTableBody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-gray-100">
                  <AdminTd className="font-mono text-xs">{row.job_name}</AdminTd>
                  <AdminTd>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        row.status === "failed"
                          ? "bg-red-100 text-red-800"
                          : row.status === "completed"
                            ? "bg-green-100 text-green-800"
                            : row.status === "running"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-gray-100 text-gray-700",
                      )}
                    >
                      {row.status}
                    </span>
                  </AdminTd>
                  <AdminTd className="text-xs text-gray-600">
                    {new Date(row.started_at).toLocaleString()}
                  </AdminTd>
                  <AdminTd className="text-xs text-gray-600">
                    {formatDuration(row.started_at, row.finished_at)}
                  </AdminTd>
                  <AdminTd className="max-w-xs truncate text-xs text-red-700" title={row.error ?? undefined}>
                    {row.error ?? "—"}
                  </AdminTd>
                </tr>
              ))}
            </AdminTableBody>
          </AdminDataTable>
        )}
      </AdminPanel>
    </div>
  );
}
