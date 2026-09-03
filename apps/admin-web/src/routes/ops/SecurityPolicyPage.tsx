import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_OPERATIONS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { adminToast } from "@/lib/adminToast";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";

interface SecuritySettings {
  password_policy?: {
    min_length?: number;
    require_uppercase?: boolean;
    require_lowercase?: boolean;
    require_numbers?: boolean;
    require_special_chars?: boolean;
    max_age_days?: number;
  };
  two_factor?: {
    enabled?: boolean;
    required_for_admins?: boolean;
  };
  rate_limiting?: {
    enabled?: boolean;
    max_attempts?: number;
    window_minutes?: number;
    lockout_minutes?: number;
  };
  data_retention?: {
    enabled?: boolean;
    retention_days?: number;
    auto_delete_inactive_accounts?: boolean;
    inactive_threshold_days?: number;
  };
  admin_ip_allowlist?: string[];
  /** Minutes. 0 = disabled. */
  admin_session_max_age?: number;
  // stats (read-only from a different endpoint shape)
  session_stats?: Record<string, unknown>;
  recent_events?: unknown[];
  audit_summary?: Record<string, unknown>;
}

function NumberInput({
  label, value, onChange, min, max,
}: { label: string; value: number | undefined; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      <input
        type="number"
        min={min}
        max={max}
        value={value ?? ""}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
      />
    </div>
  );
}

function Toggle({
  label, description, checked, onChange,
}: { label: string; description?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-sm font-medium text-gray-900">{label}</div>
        {description && <div className="text-xs text-gray-500">{description}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${checked ? "bg-indigo-600" : "bg-gray-200"}`}
      >
        <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition ${checked ? "translate-x-4" : "translate-x-0"}`} />
      </button>
    </div>
  );
}

export function SecurityPolicyPage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_OPERATIONS, "Operations access is required.");
  useAdminDocumentTitle("Security");
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: adminQueryKeys.security(),
    queryFn: () => adminApi.getJson<SecuritySettings>("/api/admin/security", { timeoutMs: 30_000 }),
    enabled: allowed,
    refetchInterval: 60_000,
  });

  // Local editable copy
  const [draft, setDraft] = useState<SecuritySettings | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (q.data && !dirty) {
      setDraft(q.data);
    }
  }, [q.data, dirty]);

  function update<K extends keyof SecuritySettings>(
    section: K,
    field: string,
    value: unknown
  ) {
    setDraft((prev) => ({
      ...prev,
      [section]: { ...((prev?.[section] as Record<string, unknown>) ?? {}), [field]: value },
    }));
    setDirty(true);
  }

  function updateTop<K extends keyof SecuritySettings>(field: K, value: SecuritySettings[K]) {
    setDraft((prev) => ({
      ...prev,
      [field]: value,
    }));
    setDirty(true);
  }

  const saveMut = useMutation({
    mutationFn: (body: Partial<SecuritySettings>) =>
      adminApi.patchJson("/api/admin/security", body),
    onSuccess: () => {
      adminToast.success("Security settings saved");
      setDirty(false);
      void qc.invalidateQueries({ queryKey: adminQueryKeys.security() });
    },
    onError: (err: Error) => adminToast.error(err.message || "Failed to save security settings"),
  });

  const [showRaw, setShowRaw] = useState(false);

  if (denied) return denied;
  if (q.isLoading)
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Security" />
        <AdminPanel><AdminPageSkeleton rows={4} /></AdminPanel>
      </div>
    );
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;
  }

  const d = draft ?? q.data;
  const pw = d?.password_policy ?? {};
  const tf = d?.two_factor ?? {};
  // True when the operator is turning enforcement on in this unsaved edit.
  const enforcementBeingEnabled =
    Boolean(tf.required_for_admins) && !Boolean(q.data?.two_factor?.required_for_admins);
  const rl = d?.rate_limiting ?? {};
  const dr = d?.data_retention ?? {};
  const events = Array.isArray(d?.recent_events) ? d!.recent_events as Record<string, unknown>[] : [];
  const sessions = d?.session_stats as Record<string, unknown> | undefined;
  const audit = d?.audit_summary as Record<string, unknown> | undefined;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Security"
        description="Platform security policy, session controls, and audit activity."
        actions={
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"
              onClick={() => setShowRaw((v) => !v)}
            >
              {showRaw ? "Hide raw" : "Raw data"}
            </button>
            {dirty && (
              <button
                type="button"
                onClick={() => { setDraft(q.data ?? null); setDirty(false); }}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"
              >
                Discard
              </button>
            )}
            <button
              type="button"
              disabled={!dirty || saveMut.isPending}
              onClick={() => {
                if (!draft) return;
                saveMut.mutate({
                  password_policy: draft.password_policy,
                  two_factor: draft.two_factor,
                  rate_limiting: draft.rate_limiting,
                  data_retention: draft.data_retention,
                  admin_ip_allowlist: draft.admin_ip_allowlist ?? [],
                  admin_session_max_age: draft.admin_session_max_age ?? 0,
                });
              }}
              className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${dirty ? "bg-gray-900 hover:bg-gray-800" : "bg-gray-300 cursor-default"} disabled:opacity-50`}
            >
              {saveMut.isPending ? "Saving…" : dirty ? "Save changes" : "Saved"}
            </button>
          </div>
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
                <div className={`text-2xl font-bold ${cls}`}>{String(value)}</div>
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
                <div className="text-2xl font-bold text-gray-900">{String(value)}</div>
                <div className="mt-1 text-xs text-gray-500">{label}</div>
              </div>
            ))}
          </div>
        </AdminPanel>
      )}

      {/* Password policy */}
      <AdminPanel>
        <h2 className="mb-4 text-sm font-semibold text-gray-900">Password policy</h2>
        <div className="space-y-4">
          <NumberInput label="Minimum password length" value={pw.min_length} min={6} max={32} onChange={(v) => update("password_policy", "min_length", v)} />
          <NumberInput label="Password expires after (days, 0 = never)" value={pw.max_age_days} min={0} max={365} onChange={(v) => update("password_policy", "max_age_days", v)} />
          <div className="space-y-3">
            {[
              { field: "require_uppercase", label: "Require uppercase letter" },
              { field: "require_lowercase", label: "Require lowercase letter" },
              { field: "require_numbers", label: "Require number" },
              { field: "require_special_chars", label: "Require special character" },
            ].map(({ field, label }) => (
              <Toggle
                key={field}
                label={label}
                checked={Boolean((pw as Record<string, unknown>)[field])}
                onChange={(v) => update("password_policy", field, v)}
              />
            ))}
          </div>
        </div>
      </AdminPanel>

      {/* Two-factor */}
      <AdminPanel>
        <h2 className="mb-4 text-sm font-semibold text-gray-900">Two-factor authentication</h2>
        <div className="space-y-4">
          <Toggle
            label="Enable 2FA"
            description="Allow users to enroll in two-factor authentication."
            checked={Boolean(tf.enabled)}
            onChange={(v) => {
              // Requiring MFA is meaningless if enrollment is off — keep them consistent.
              if (!v && tf.required_for_admins) update("two_factor", "required_for_admins", false);
              update("two_factor", "enabled", v);
            }}
          />
          <Toggle
            label="Require 2FA for admins"
            description="Admins must complete 2FA (authenticator app) before any admin API or page will load."
            checked={Boolean(tf.required_for_admins)}
            onChange={(v) => {
              // Enabling enforcement requires enrollment to be on.
              if (v && !tf.enabled) update("two_factor", "enabled", true);
              update("two_factor", "required_for_admins", v);
            }}
          />

          {Boolean(tf.required_for_admins) && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <div className="font-semibold">
                {enforcementBeingEnabled ? "You are about to enforce admin 2FA" : "Admin 2FA enforcement is ON"}
              </div>
              <p className="mt-1 leading-relaxed">
                This policy is authoritative in <strong>every environment, including production</strong>. The
                moment it is saved, any admin whose current session is not at AAL2 — and anyone without an enrolled
                authenticator — is locked out of all <code>/api/admin/*</code> routes and admin pages until they
                complete 2FA.
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                <li>Make sure at least one superadmin has an authenticator enrolled before saving.</li>
                <li>
                  If everyone is locked out, follow the break-glass runbook
                  (<code>docs/ADMIN_MFA_BREAK_GLASS.md</code>) to remove a TOTP factor via the Supabase
                  service role.
                </li>
              </ul>
            </div>
          )}
        </div>
      </AdminPanel>

      {/* Rate limiting */}
      <AdminPanel>
        <h2 className="mb-4 text-sm font-semibold text-gray-900">Login rate limiting</h2>
        <div className="space-y-4">
          <Toggle
            label="Enable rate limiting"
            checked={Boolean(rl.enabled)}
            onChange={(v) => update("rate_limiting", "enabled", v)}
          />
          <div className="grid grid-cols-3 gap-4">
            <NumberInput label="Max attempts" value={rl.max_attempts} min={1} max={20} onChange={(v) => update("rate_limiting", "max_attempts", v)} />
            <NumberInput label="Window (minutes)" value={rl.window_minutes} min={1} max={60} onChange={(v) => update("rate_limiting", "window_minutes", v)} />
            <NumberInput label="Lockout (minutes)" value={rl.lockout_minutes} min={5} max={1440} onChange={(v) => update("rate_limiting", "lockout_minutes", v)} />
          </div>
        </div>
      </AdminPanel>

      {/* Data retention */}
      <AdminPanel>
        <h2 className="mb-4 text-sm font-semibold text-gray-900">Data retention</h2>
        <div className="space-y-4">
          <Toggle
            label="Enable data retention policy"
            checked={Boolean(dr.enabled)}
            onChange={(v) => update("data_retention", "enabled", v)}
          />
          <NumberInput label="Retain records for (days)" value={dr.retention_days} min={30} max={3650} onChange={(v) => update("data_retention", "retention_days", v)} />
          <Toggle
            label="Auto-delete inactive accounts"
            description="Delete accounts that have been inactive past the threshold."
            checked={Boolean(dr.auto_delete_inactive_accounts)}
            onChange={(v) => update("data_retention", "auto_delete_inactive_accounts", v)}
          />
          <NumberInput label="Inactive account threshold (days)" value={dr.inactive_threshold_days} min={90} max={3650} onChange={(v) => update("data_retention", "inactive_threshold_days", v)} />
        </div>
      </AdminPanel>

      <AdminPanel>
        <h2 className="mb-4 text-sm font-semibold text-gray-900">Admin IP allowlist</h2>
        <p className="mb-3 text-xs text-gray-500">
          One IPv4, IPv6, or CIDR per line. Empty list allows every IP. Your current IP must be included or the save is rejected.
        </p>
        <textarea
          className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm focus:border-gray-500 focus:outline-none"
          rows={5}
          value={(draft?.admin_ip_allowlist ?? []).join("\n")}
          onChange={(e) =>
            updateTop(
              "admin_ip_allowlist",
              e.target.value
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean),
            )
          }
          placeholder={"203.0.113.10\n10.0.0.0/8"}
        />
      </AdminPanel>

      <AdminPanel>
        <h2 className="mb-4 text-sm font-semibold text-gray-900">Admin session TTL</h2>
        <NumberInput
          label="Max session age (minutes, 0 = disabled)"
          value={draft?.admin_session_max_age}
          min={0}
          max={10080}
          onChange={(v) => updateTop("admin_session_max_age", v)}
        />
        <p className="mt-2 text-xs text-gray-500">
          After this many minutes from sign-in, admin APIs return 401 SESSION_EXPIRED. Default is 720 (12 hours) when unset.
        </p>
      </AdminPanel>

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
                  <tr key={String(e.id ?? i)} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono text-xs text-gray-700">{String(e.type ?? "—")}</td>
                    <td className="px-3 py-2 text-xs text-gray-600">{String(e.user_email ?? "—")}</td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-500">{String(e.ip ?? "—")}</td>
                    <td className="px-3 py-2 text-right">
                      {e.risk_score != null && (
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${Number(e.risk_score) > 70 ? "bg-red-100 text-red-800" : Number(e.risk_score) > 40 ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800"}`}>
                          {String(e.risk_score)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500">
                      {e.created_at ? new Date(String(e.created_at)).toLocaleString() : "—"}
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

      {showRaw && (
        <AdminPanel>
          <h2 className="mb-2 text-sm font-semibold text-gray-900">Raw response</h2>
          <pre className="max-h-[480px] overflow-auto rounded bg-gray-50 p-4 text-xs">
            {JSON.stringify(q.data, null, 2)}
          </pre>
        </AdminPanel>
      )}
    </div>
  );
}
