import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useSuperadminPage } from "@/hooks/useSuperadminPage";
import { adminApi } from "@/lib/adminClient";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { CpBack, CpField } from "./cpShared";

const USER_PHRASE = "DELETE USER FOREVER" as const;
const PROVIDER_PHRASE = "PURGE PROVIDER ORG" as const;

type PurgeAuditEntry = {
  id: string;
  created_at: string;
  actor_user_id: string | null;
  tenant_id: string | null;
  purge_type: string | null;
  target_user_id: string | null;
  provider_id: string | null;
  reason: string | null;
  report: unknown;
  purged_user_ids: string[] | null;
};

function normalizeEmail(e: string): string {
  return e
    .trim()
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, "");
}

export function CompliancePurgePage() {
  const { allowed, denied } = useSuperadminPage(
    "Compliance purge tools are superadmin-only and match POST /api/admin/compliance/*."
  );

  const [auditLoading, setAuditLoading] = useState(true);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [entries, setEntries] = useState<PurgeAuditEntry[]>([]);

  const loadAudit = useCallback(async () => {
    if (!allowed) return;
    setAuditLoading(true);
    setAuditError(null);
    try {
      const d = await adminApi.getJson<{ entries?: PurgeAuditEntry[] }>(
        "/api/admin/compliance/purge-audit?limit=50"
      );
      setEntries(Array.isArray(d.entries) ? d.entries : []);
    } catch (e) {
      setAuditError(e instanceof Error ? e.message : "Failed to load purge audit log");
      setEntries([]);
    } finally {
      setAuditLoading(false);
    }
  }, [allowed]);

  useEffect(() => {
    void loadAudit();
  }, [loadAudit]);

  const [userId, setUserId] = useState("");
  const [userEmailHint, setUserEmailHint] = useState("");
  const [userReason, setUserReason] = useState("");
  const [userEmailConfirm, setUserEmailConfirm] = useState("");
  const [userPhrase, setUserPhrase] = useState("");
  const [userAck, setUserAck] = useState(false);
  const [userBusy, setUserBusy] = useState(false);
  const [userLoadBusy, setUserLoadBusy] = useState(false);
  const [userMsg, setUserMsg] = useState<string | null>(null);
  const [userDoneReport, setUserDoneReport] = useState<string | null>(null);

  const loadUserHint = async () => {
    const id = userId.trim();
    if (!id) {
      setUserMsg("Enter a user UUID first.");
      return;
    }
    setUserLoadBusy(true);
    setUserMsg(null);
    try {
      const u = await adminApi.getJson<Record<string, unknown>>(
        `/api/admin/compliance/lookup-user/${encodeURIComponent(id)}`,
      );
      const em = u.email != null ? String(u.email) : "";
      setUserEmailHint(em);
      setUserMsg(em ? `Loaded account email on file: ${em}` : "User loaded but no email on record.");
    } catch (e) {
      setUserEmailHint("");
      setUserMsg(e instanceof Error ? e.message : "Could not load user");
    } finally {
      setUserLoadBusy(false);
    }
  };

  const submitUserPurge = async () => {
    setUserMsg(null);
    setUserDoneReport(null);
    const id = userId.trim();
    if (!id) {
      setUserMsg("User id is required.");
      return;
    }
    if (userReason.trim().length < 20) {
      setUserMsg("Reason must be at least 20 characters (audit requirement).");
      return;
    }
    if (!userAck) {
      setUserMsg("Confirm that you understand this action is irreversible.");
      return;
    }
    if (userPhrase.trim() !== USER_PHRASE) {
      setUserMsg(`Type exactly: ${USER_PHRASE}`);
      return;
    }
    setUserBusy(true);
    try {
      const payload = await adminApi.postJson<{
        report?: unknown;
        compliance_audit_id?: string | null;
        compliance_audit_write_error?: string | null;
      }>("/api/admin/compliance/purge-user", {
        user_id: id,
        reason: userReason.trim(),
        confirmation_phrase: USER_PHRASE,
        target_email_confirmation: userEmailConfirm.trim(),
        acknowledge_irreversible: true,
      });
      setUserDoneReport(
        JSON.stringify(
          {
            report: payload?.report,
            compliance_audit_id: payload?.compliance_audit_id,
            compliance_audit_write_error: payload?.compliance_audit_write_error,
          },
          null,
          2
        )
      );
      setUserMsg("Account purged. Retain the report below if required for compliance.");
      void loadAudit();
    } catch (e) {
      setUserMsg(e instanceof Error ? e.message : "Purge failed");
    } finally {
      setUserBusy(false);
    }
  };

  const [providerId, setProviderId] = useState("");
  const [providerBusinessEmail, setProviderBusinessEmail] = useState("");
  const [providerBillingEmail, setProviderBillingEmail] = useState("");
  const [providerOwnerEmail, setProviderOwnerEmail] = useState("");
  const [providerReason, setProviderReason] = useState("");
  const [providerEmailTyped, setProviderEmailTyped] = useState("");
  const [providerPhrase, setProviderPhrase] = useState("");
  const [providerAck, setProviderAck] = useState(false);
  const [providerBusy, setProviderBusy] = useState(false);
  const [providerLoadBusy, setProviderLoadBusy] = useState(false);
  const [providerMsg, setProviderMsg] = useState<string | null>(null);
  const [providerDoneReport, setProviderDoneReport] = useState<string | null>(null);

  const loadProviderHint = async () => {
    const id = providerId.trim();
    if (!id) {
      setProviderMsg("Enter a provider UUID first.");
      return;
    }
    setProviderLoadBusy(true);
    setProviderMsg(null);
    try {
      const p = await adminApi.getJson<Record<string, unknown>>(
        `/api/admin/providers/${encodeURIComponent(id)}`
      );
      const biz = p.email != null ? String(p.email) : "";
      const owner =
        p.owner && typeof p.owner === "object" && p.owner !== null && "email" in p.owner
          ? String((p.owner as { email?: unknown }).email ?? "")
          : "";
      setProviderBusinessEmail(biz);
      setProviderOwnerEmail(owner);
      setProviderMsg(
        biz || owner
          ? `Business email: ${biz || "—"} · Owner email: ${owner || "—"}`
          : "Provider loaded; no emails found for confirmation typing."
      );
    } catch (e) {
      setProviderBusinessEmail("");
      setProviderBillingEmail("");
      setProviderOwnerEmail("");
      setProviderMsg(e instanceof Error ? e.message : "Could not load provider");
    } finally {
      setProviderLoadBusy(false);
    }
  };

  const submitProviderPurge = async () => {
    setProviderMsg(null);
    setProviderDoneReport(null);
    const id = providerId.trim();
    if (!id) {
      setProviderMsg("Provider id is required.");
      return;
    }
    if (providerReason.trim().length < 20) {
      setProviderMsg("Reason must be at least 20 characters (audit requirement).");
      return;
    }
    if (!providerAck) {
      setProviderMsg("Confirm that you understand this action is irreversible.");
      return;
    }
    if (providerPhrase.trim() !== PROVIDER_PHRASE) {
      setProviderMsg(`Type exactly: ${PROVIDER_PHRASE}`);
      return;
    }
    const allowedEmails = [providerBusinessEmail, providerBillingEmail, providerOwnerEmail].filter(
      (e) => e && e.trim(),
    );
    const typed = normalizeEmail(providerEmailTyped);
    const ok = allowedEmails.some((e) => normalizeEmail(e) === typed);
    if (!ok) {
      setProviderMsg(
        "Typed email must match business, billing, or owner profile email (server also accepts owner Auth email if it differs).",
      );
      return;
    }
    setProviderBusy(true);
    try {
      const payload = await adminApi.postJson<{
        report?: unknown;
        compliance_audit_id?: string | null;
        compliance_audit_write_error?: string | null;
      }>("/api/admin/compliance/purge-provider", {
        provider_id: id,
        reason: providerReason.trim(),
        confirmation_phrase: PROVIDER_PHRASE,
        typed_email_confirmation: providerEmailTyped.trim(),
        acknowledge_irreversible: true,
      });
      setProviderDoneReport(
        JSON.stringify(
          {
            report: payload?.report,
            compliance_audit_id: payload?.compliance_audit_id,
            compliance_audit_write_error: payload?.compliance_audit_write_error,
          },
          null,
          2
        )
      );
      setProviderMsg("Provider organization purged. Retain the report below if required.");
      void loadAudit();
    } catch (e) {
      setProviderMsg(e instanceof Error ? e.message : "Purge failed");
    } finally {
      setProviderBusy(false);
    }
  };

  if (denied) return denied;

  return (
    <div className="space-y-8">
      <CpBack />
      <AdminPageHeader
        title="Compliance purge"
        description="Superadmin-only erasure flows with immutable audit logging. Use only for verified DSAR / legal requests."
      />

      {auditLoading ? (
        <AdminPageSkeleton />
      ) : auditError ? (
        <AdminRetryBlock message={auditError} onRetry={() => void loadAudit()} />
      ) : (
        <AdminPanel className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">Recent purge audit (read-only)</h2>
          <p className="text-sm text-gray-600">
            <code className="rounded bg-gray-100 px-1">GET /api/admin/compliance/purge-audit</code>
          </p>
          {entries.length === 0 ? (
            <p className="text-sm text-gray-500">No entries yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-xs uppercase text-gray-500">
                    <th className="py-2 pr-2 font-medium">When</th>
                    <th className="py-2 pr-2 font-medium">Type</th>
                    <th className="py-2 pr-2 font-medium">Target</th>
                    <th className="py-2 font-medium">Reason (preview)</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((row) => (
                    <tr key={row.id} className="border-b border-gray-100">
                      <td className="py-2 pr-2 whitespace-nowrap text-gray-700">
                        {new Date(row.created_at).toLocaleString(undefined, { hour12: false })}
                      </td>
                      <td className="py-2 pr-2 capitalize">{row.purge_type ?? "—"}</td>
                      <td className="py-2 pr-2 font-mono text-xs text-gray-700">
                        <span className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:gap-x-3">
                          {row.target_user_id ? (
                            <Link
                              className="text-primary underline"
                              to={adminSpaTo(`/admin/users/${row.target_user_id}`)}
                            >
                              user {row.target_user_id.slice(0, 8)}…
                            </Link>
                          ) : null}
                          {row.provider_id ? (
                            <Link
                              className="text-primary underline"
                              to={adminSpaTo(`/admin/providers/${row.provider_id}`)}
                            >
                              provider {row.provider_id.slice(0, 8)}…
                            </Link>
                          ) : null}
                          {!row.target_user_id && !row.provider_id ? "—" : null}
                        </span>
                      </td>
                      <td className="max-w-xs truncate py-2 text-gray-600" title={row.reason ?? ""}>
                        {row.reason ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AdminPanel>
      )}

      <AdminPanel className="space-y-4 border-red-100 bg-red-50/30">
        <h2 className="text-lg font-semibold text-red-900">Purge platform user</h2>
        <p className="text-sm text-red-800/90">
          Permanently deletes the login and cascading data. You cannot purge your own account or another superadmin.
        </p>
        <div className="flex flex-wrap gap-2">
          <CpField label="User id (UUID)">
            <input
              className="w-full max-w-md rounded-lg border border-gray-200 px-2 py-1.5 font-mono text-sm"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
            />
          </CpField>
          <div className="flex items-end">
            <button
              type="button"
              disabled={userLoadBusy}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm disabled:opacity-50"
              onClick={() => void loadUserHint()}
            >
              {userLoadBusy ? "Loading…" : "Load account"}
            </button>
          </div>
        </div>
        {userEmailHint ? (
          <p className="text-sm text-gray-700">
            Email on file: <span className="font-medium">{userEmailHint}</span>
          </p>
        ) : null}
        <CpField label="Reason (min. 20 characters)">
          <textarea
            className="mt-1 w-full max-w-xl rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
            rows={4}
            value={userReason}
            onChange={(e) => setUserReason(e.target.value)}
            placeholder="Ticket ID, DSAR reference, or legal basis…"
          />
        </CpField>
        <CpField label="Type account email exactly (confirmation)">
          <input
            className="w-full max-w-md rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
            value={userEmailConfirm}
            onChange={(e) => setUserEmailConfirm(e.target.value)}
            autoComplete="off"
          />
        </CpField>
        <CpField label={`Confirmation phrase (exactly: ${USER_PHRASE})`}>
          <input
            className="w-full max-w-md rounded-lg border border-gray-200 px-2 py-1.5 font-mono text-sm"
            value={userPhrase}
            onChange={(e) => setUserPhrase(e.target.value)}
            autoComplete="off"
          />
        </CpField>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={userAck} onChange={(e) => setUserAck(e.target.checked)} />
          <span>I understand this is irreversible and authorized under our compliance process.</span>
        </label>
        {userMsg ? <p className="text-sm text-gray-800">{userMsg}</p> : null}
        {userDoneReport ? (
          <pre className="max-h-64 overflow-auto rounded-lg bg-gray-900 p-3 text-xs text-gray-100">{userDoneReport}</pre>
        ) : null}
        <button
          type="button"
          disabled={userBusy}
          className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          onClick={() => void submitUserPurge()}
        >
          {userBusy ? "Purging…" : "Execute user purge"}
        </button>
      </AdminPanel>

      <AdminPanel className="space-y-4 border-red-100 bg-red-50/30">
        <h2 className="text-lg font-semibold text-red-900">Purge provider organization</h2>
        <p className="text-sm text-red-800/90">
          Permanently removes the provider org and related data. Typed email must match business, billing, or owner
          profile email; the API also accepts the owner Supabase Auth email when it differs from profile.
        </p>
        <div className="flex flex-wrap gap-2">
          <CpField label="Provider id (UUID)">
            <input
              className="w-full max-w-md rounded-lg border border-gray-200 px-2 py-1.5 font-mono text-sm"
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
            />
          </CpField>
          <div className="flex items-end">
            <button
              type="button"
              disabled={providerLoadBusy}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm disabled:opacity-50"
              onClick={() => void loadProviderHint()}
            >
              {providerLoadBusy ? "Loading…" : "Load provider"}
            </button>
          </div>
        </div>
        {(providerBusinessEmail || providerBillingEmail || providerOwnerEmail) && (
          <p className="text-sm text-gray-700">
            Business: <span className="font-medium">{providerBusinessEmail || "—"}</span>
            <br />
            Billing: <span className="font-medium">{providerBillingEmail || "—"}</span>
            <br />
            Owner: <span className="font-medium">{providerOwnerEmail || "—"}</span>
          </p>
        )}
        <CpField label="Reason (min. 20 characters)">
          <textarea
            className="mt-1 w-full max-w-xl rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
            rows={4}
            value={providerReason}
            onChange={(e) => setProviderReason(e.target.value)}
          />
        </CpField>
        <CpField label="Type matching business or owner email">
          <input
            className="w-full max-w-md rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
            value={providerEmailTyped}
            onChange={(e) => setProviderEmailTyped(e.target.value)}
            autoComplete="off"
          />
        </CpField>
        <CpField label={`Confirmation phrase (exactly: ${PROVIDER_PHRASE})`}>
          <input
            className="w-full max-w-md rounded-lg border border-gray-200 px-2 py-1.5 font-mono text-sm"
            value={providerPhrase}
            onChange={(e) => setProviderPhrase(e.target.value)}
            autoComplete="off"
          />
        </CpField>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={providerAck} onChange={(e) => setProviderAck(e.target.checked)} />
          <span>I understand this is irreversible and authorized under our compliance process.</span>
        </label>
        {providerMsg ? <p className="text-sm text-gray-800">{providerMsg}</p> : null}
        {providerDoneReport ? (
          <pre className="max-h-64 overflow-auto rounded-lg bg-gray-900 p-3 text-xs text-gray-100">
            {providerDoneReport}
          </pre>
        ) : null}
        <button
          type="button"
          disabled={providerBusy}
          className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          onClick={() => void submitProviderPurge()}
        >
          {providerBusy ? "Purging…" : "Execute provider purge"}
        </button>
      </AdminPanel>
    </div>
  );
}
