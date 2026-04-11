import { useState } from "react";
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

interface SecurityData {
  session_stats?: {
    active_sessions?: number;
    sessions_last_24h?: number;
    failed_logins_24h?: number;
    suspicious_logins_24h?: number;
  };
  policy?: {
    mfa_required?: boolean;
    session_timeout_minutes?: number;
    max_failed_logins?: number;
    ip_allowlist_enabled?: boolean;
    rate_limiting_enabled?: boolean;
  };
  recent_events?: {
    id?: string;
    type?: string;
    user_email?: string;
    ip?: string;
    created_at?: string;
    risk_score?: number;
    resolved?: boolean;
  }[];
  audit_summary?: {
    total_events_24h?: number;
    admin_actions_24h?: number;
    failed_actions_24h?: number;
  };
  [key: string]: unknown;
}

export function SecurityPolicyPage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_OPERATIONS, "Operations access is required.");
  const [showRaw, setShowRaw] = useState(false);

  const q = useQuery({
    queryKey: adminQueryKeys.security(),
    queryFn: () => adminApi.getJson<SecurityData>("/api/admin/security", { timeoutMs: 30_000 }),
    enabled: allowed,
    refetchInterval: 60_000,
  });

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Security" />
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
  const sessions = data?.session_stats;
  const policy = data?.policy;
  const events = Array.isArray(data?.recent_events) ? data!.recent_events : [];
  const audit = data?.audit_summary;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Security"
        description="Session statistics, failed logins, and platform security policy snapshot."
        actions={
          <button
            type="button"
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"
            onClick={() => setShowRaw((v) => !v)}
          >
            {showRaw ? "Hide raw" : "Raw data"}
          </button>
        }
      />

      {/* Session stats */}
      {sessions && (
        <AdminPanel>
          <h2 className="mb-4 text-sm font-semibold text-gray-900">Session statistics (24h)</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: "Active Sessions", value: sessions.active_sessions ?? 0, cls: "text-gray-900" },
              { label: "Sessions (24h)", value: sessions.sessions_last_24h ?? 0, cls: "text-blue-700" },
              { label: "Failed Logins", value: sessions.failed_logins_24h ?? 0, cls: sessions.failed_logins_24h ? "text-red-700" : "text-gray-900" },
              { label: "Suspicious", value: sessions.suspicious_logins_24h ?? 0, cls: sessions.suspicious_logins_24h ? "text-amber-700" : "text-gray-900" },
            ].map(({ label, value, cls }) => (
              <div key={label} className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-center">
                <div className={`text-2xl font-bold ${cls}`}>{value}</div>
                <div className="mt-1 text-xs text-gray-500">{label}</div>
              </div>
            ))}
          </div>
        </AdminPanel>
      )}

      {/* Audit summary */}
      {audit && (
        <AdminPanel>
          <h2 className="mb-4 text-sm font-semibold text-gray-900">Audit activity (24h)</h2>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Total events", value: audit.total_events_24h ?? 0 },
              { label: "Admin actions", value: audit.admin_actions_24h ?? 0 },
              { label: "Failed actions", value: audit.failed_actions_24h ?? 0 },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-center">
                <div className="text-2xl font-bold text-gray-900">{value}</div>
                <div className="mt-1 text-xs text-gray-500">{label}</div>
              </div>
            ))}
          </div>
        </AdminPanel>
      )}

      {/* Security policy */}
      {policy && (
        <AdminPanel>
          <h2 className="mb-4 text-sm font-semibold text-gray-900">Security policy</h2>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[
              { label: "MFA Required", value: policy.mfa_required ? "Yes" : "No", ok: policy.mfa_required },
              { label: "Session Timeout", value: policy.session_timeout_minutes ? `${policy.session_timeout_minutes} min` : "—" },
              { label: "Max Failed Logins", value: policy.max_failed_logins ?? "—" },
              { label: "IP Allowlist", value: policy.ip_allowlist_enabled ? "Enabled" : "Disabled", ok: policy.ip_allowlist_enabled },
              { label: "Rate Limiting", value: policy.rate_limiting_enabled ? "Enabled" : "Disabled", ok: policy.rate_limiting_enabled },
            ].map(({ label, value, ok }) => (
              <div key={label} className="flex justify-between rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
                <dt className="text-sm text-gray-500">{label}</dt>
                <dd className={`text-sm font-medium ${ok === true ? "text-green-700" : ok === false ? "text-amber-700" : "text-gray-900"}`}>
                  {String(value)}
                </dd>
              </div>
            ))}
          </dl>
        </AdminPanel>
      )}

      {/* Recent security events */}
      {events.length > 0 && (
        <AdminPanel>
          <h2 className="mb-3 text-sm font-semibold text-gray-900">Recent security events</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-100 bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Type</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">User</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">IP</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Risk</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Time</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {events.map((e, i) => (
                  <tr key={e.id ?? i} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono text-xs text-gray-700">{e.type ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-gray-600">{e.user_email ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-500">{e.ip ?? "—"}</td>
                    <td className="px-3 py-2 text-right">
                      {e.risk_score != null && (
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${e.risk_score > 70 ? "bg-red-100 text-red-800" : e.risk_score > 40 ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800"}`}>
                          {e.risk_score}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500">
                      {e.created_at ? new Date(e.created_at).toLocaleString() : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${e.resolved ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
                        {e.resolved ? "Resolved" : "Active"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AdminPanel>
      )}

      {!sessions && !policy && events.length === 0 && (
        <AdminPanel>
          <p className="py-6 text-center text-sm text-gray-400">
            No structured security data. See raw response below.
          </p>
        </AdminPanel>
      )}

      {showRaw && (
        <AdminPanel>
          <h2 className="mb-2 text-sm font-semibold text-gray-900">Raw response (GET /api/admin/security)</h2>
          <pre className="max-h-[480px] overflow-auto rounded bg-gray-50 p-4 text-xs">
            {JSON.stringify(q.data, null, 2)}
          </pre>
        </AdminPanel>
      )}
    </div>
  );
}
