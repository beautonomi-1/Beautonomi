import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ADMIN_SECTION_OPERATIONS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";

interface ErrorEvent {
  id?: string;
  severity?: "error" | "warning" | "info" | string;
  message?: string;
  source?: string;
  count?: number;
  first_seen?: string;
  last_seen?: string;
  resolved?: boolean;
}

interface MonitoringData {
  summary?: {
    total_errors?: number;
    critical?: number;
    warning?: number;
    info?: number;
    resolved?: number;
  };
  errors?: ErrorEvent[];
  probes?: Record<string, unknown>[];
  checked_at?: string;
  [key: string]: unknown;
}

const SEVERITY_STYLE: Record<string, string> = {
  error: "bg-red-100 text-red-800",
  warning: "bg-amber-100 text-amber-800",
  info: "bg-blue-100 text-blue-800",
};

export function MonitoringHealthPage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_OPERATIONS, "Operations access is required.");
  const [sp, setSp] = useSearchParams();
  const hours = sp.get("hours") || "24";
  const [showRaw, setShowRaw] = useState(false);

  const q = useQuery({
    queryKey: adminQueryKeys.monitoringHealth(hours),
    queryFn: () =>
      adminApi.getJson<MonitoringData>(`/api/admin/monitoring/health?hours=${encodeURIComponent(hours)}`, {
        timeoutMs: 120_000,
      }),
    enabled: allowed,
    refetchInterval: 60_000,
  });

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Monitoring" />
        <AdminPanel>
          <AdminPageSkeleton rows={4} />
        </AdminPanel>
      </div>
    );
  }
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;
  }

  const data = q.data;
  const summary = data?.summary;
  const errors = Array.isArray(data?.errors) ? data!.errors : [];

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Monitoring"
        description="Platform error logs and health probes."
        actions={
          <div className="flex items-center gap-2">
            <select
              value={hours}
              onChange={(e) => {
                const n = new URLSearchParams(sp);
                n.set("hours", e.target.value);
                setSp(n, { replace: true });
              }}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="1">Last 1h</option>
              <option value="6">Last 6h</option>
              <option value="24">Last 24h</option>
              <option value="72">Last 72h</option>
              <option value="168">Last 7d</option>
            </select>
            <button
              type="button"
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"
              onClick={() => void q.refetch()}
            >
              Refresh
            </button>
            <button
              type="button"
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"
              onClick={() => setShowRaw((v) => !v)}
            >
              {showRaw ? "Hide raw" : "Raw data"}
            </button>
          </div>
        }
      />

      {/* Summary */}
      {summary && (
        <AdminPanel>
          <h2 className="mb-4 text-sm font-semibold text-gray-900">Error summary (last {hours}h)</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            {[
              { label: "Total Errors", value: summary.total_errors ?? 0, cls: "text-gray-900" },
              { label: "Critical", value: summary.critical ?? 0, cls: "text-red-700" },
              { label: "Warnings", value: summary.warning ?? 0, cls: "text-amber-700" },
              { label: "Info", value: summary.info ?? 0, cls: "text-blue-700" },
              { label: "Resolved", value: summary.resolved ?? 0, cls: "text-green-700" },
            ].map(({ label, value, cls }) => (
              <div key={label} className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-center">
                <div className={`text-2xl font-bold ${cls}`}>{value}</div>
                <div className="mt-1 text-xs text-gray-500">{label}</div>
              </div>
            ))}
          </div>
        </AdminPanel>
      )}

      {/* Error log table */}
      {errors.length > 0 ? (
        <AdminPanel>
          <h2 className="mb-3 text-sm font-semibold text-gray-900">Error events ({errors.length})</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-100 bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Severity</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Message</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Source</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Count</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Last seen</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {errors.map((e, i) => (
                  <tr key={e.id ?? i} className="hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_STYLE[e.severity ?? "info"] ?? "bg-gray-100 text-gray-600"}`}>
                        {e.severity ?? "info"}
                      </span>
                    </td>
                    <td className="max-w-xs truncate px-3 py-2 text-xs text-gray-700">{e.message ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-500">{e.source ?? "—"}</td>
                    <td className="px-3 py-2 text-right font-medium">{e.count ?? 1}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">
                      {e.last_seen ? new Date(e.last_seen).toLocaleString() : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${e.resolved ? "bg-green-100 text-green-800" : "bg-red-50 text-red-700"}`}>
                        {e.resolved ? "Resolved" : "Open"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AdminPanel>
      ) : (
        <AdminPanel>
          <p className="py-6 text-center text-sm text-gray-400">
            No error events in the last {hours} hours. See raw response for probe data.
          </p>
        </AdminPanel>
      )}

      {showRaw && (
        <AdminPanel>
          <h2 className="mb-2 text-sm font-semibold text-gray-900">Raw response (GET /api/admin/monitoring/health)</h2>
          <pre className="max-h-[480px] overflow-auto rounded bg-gray-50 p-4 text-xs">
            {JSON.stringify(q.data, null, 2)}
          </pre>
        </AdminPanel>
      )}
    </div>
  );
}
