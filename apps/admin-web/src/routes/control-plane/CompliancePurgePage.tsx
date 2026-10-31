import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { readAdminScopeFromStorage } from "@beautonomi/admin-api-client";
import { useSuperadminPage } from "@/hooks/useSuperadminPage";
import { adminApi } from "@/lib/adminClient";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { downloadAdminBlob } from "@/lib/adminCsvDownload";
import { providerPurgeConfirmationEmails } from "@/lib/compliance/providerPurgeConfirmationEmails";
import { adminToast } from "@/lib/adminToast";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { CpBack, CpField } from "./cpShared";

const USER_PHRASE = "DELETE USER FOREVER" as const;
const PROVIDER_PHRASE = "PURGE PROVIDER ORG" as const;

type PurgeAuditMeta = {
  page: number;
  limit: number;
  total: number;
  has_more: boolean;
};

type PurgeAuditEntry = {
  id: string;
  created_at: string;
  actor_user_id: string | null;
  tenant_id: string | null;
  purge_type: string | null;
  target_user_id: string | null;
  provider_id: string | null;
  reason: string | null;
  report?: unknown;
  purged_user_ids: string[] | null;
  purge_after_at: string | null;
  actor?: { id?: string; full_name?: string | null; email?: string | null } | null;
};

function normalizeEmail(e: string): string {
  return e
    .trim()
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, "");
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    adminToast.success("Copied to clipboard");
  } catch {
    adminToast.error("Could not copy to clipboard");
  }
}

function formatRetention(purgeAfter: string | null): string {
  if (!purgeAfter) return "Legacy (no expiry set)";
  return new Date(purgeAfter).toLocaleString(undefined, { hour12: false });
}

export function CompliancePurgePage() {
  const { allowed, denied } = useSuperadminPage(
    "Compliance purge tools are superadmin-only and match POST /api/admin/compliance/*.",
  );

  const [sp, setSp] = useSearchParams();

  const auditPage = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
  const auditLimit = Math.min(100, Math.max(1, parseInt(sp.get("limit") || "50", 10) || 50));
  const auditSearch = sp.get("search") || "";
  const auditPurgeType = sp.get("purge_type") || "";
  const auditActorId = sp.get("actor_user_id") || "";
  const auditTenantId = sp.get("tenant_id") || "";
  const auditTargetUserId = sp.get("target_user_id") || "";
  const auditProviderId = sp.get("provider_id") || "";
  const auditStartDate = sp.get("start_date") || "";
  const auditEndDate = sp.get("end_date") || "";
  const expandedAuditId = sp.get("audit") || "";

  const updateAuditParams = useCallback(
    (next: Record<string, string | null>) => {
      const n = new URLSearchParams(sp);
      for (const [k, v] of Object.entries(next)) {
        if (v == null || v === "") n.delete(k);
        else n.set(k, v);
      }
      setSp(n, { replace: true });
    },
    [sp, setSp],
  );

  const auditFilterParams = useMemo(() => {
    const p = new URLSearchParams();
    if (auditSearch) p.set("search", auditSearch);
    if (auditPurgeType) p.set("purge_type", auditPurgeType);
    if (auditActorId) p.set("actor_user_id", auditActorId);
    if (auditTenantId) p.set("tenant_id", auditTenantId);
    if (auditTargetUserId) p.set("target_user_id", auditTargetUserId);
    if (auditProviderId) p.set("provider_id", auditProviderId);
    if (auditStartDate) p.set("start_date", auditStartDate);
    if (auditEndDate) p.set("end_date", auditEndDate);
    return p;
  }, [
    auditSearch,
    auditPurgeType,
    auditActorId,
    auditTenantId,
    auditTargetUserId,
    auditProviderId,
    auditStartDate,
    auditEndDate,
  ]);

  const auditQueryString = useMemo(() => {
    const p = new URLSearchParams(auditFilterParams);
    p.set("page", String(auditPage));
    p.set("limit", String(auditLimit));
    return p.toString();
  }, [auditFilterParams, auditPage, auditLimit]);

  const auditExportQueryString = auditFilterParams.toString();

  const hasAuditFilters = auditFilterParams.toString().length > 0;

  const [auditLoading, setAuditLoading] = useState(true);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [entries, setEntries] = useState<PurgeAuditEntry[]>([]);
  const [auditMeta, setAuditMeta] = useState<PurgeAuditMeta | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailEntry, setDetailEntry] = useState<PurgeAuditEntry | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  const loadAudit = useCallback(async () => {
    if (!allowed) return;
    setAuditLoading(true);
    setAuditError(null);
    try {
      const d = await adminApi.getJson<{ entries?: PurgeAuditEntry[]; meta?: PurgeAuditMeta }>(
        `/api/admin/compliance/purge-audit?${auditQueryString}`,
      );
      setEntries(Array.isArray(d.entries) ? d.entries : []);
      setAuditMeta(d.meta ?? null);
    } catch (e) {
      setAuditError(e instanceof Error ? e.message : "Failed to load purge audit log");
      setEntries([]);
      setAuditMeta(null);
    } finally {
      setAuditLoading(false);
    }
  }, [allowed, auditQueryString]);

  useEffect(() => {
    void loadAudit();
  }, [loadAudit]);

  useEffect(() => {
    if (!expandedAuditId || !allowed) {
      setDetailEntry(null);
      setDetailError(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);
    void adminApi
      .getJson<{ entry?: PurgeAuditEntry }>(
        `/api/admin/compliance/purge-audit?id=${encodeURIComponent(expandedAuditId)}`,
      )
      .then((d) => {
        if (cancelled) return;
        setDetailEntry(d.entry ?? null);
      })
      .catch((e) => {
        if (cancelled) return;
        setDetailError(e instanceof Error ? e.message : "Failed to load audit detail");
        setDetailEntry(null);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [expandedAuditId, allowed]);

  const totalPages = auditMeta ? Math.max(1, Math.ceil(auditMeta.total / auditMeta.limit)) : 1;

  const [userId, setUserId] = useState("");
  const [userEmailHint, setUserEmailHint] = useState("");
  const [userReason, setUserReason] = useState("");
  const [userEmailConfirm, setUserEmailConfirm] = useState("");
  const [userPhrase, setUserPhrase] = useState("");
  const [userAck, setUserAck] = useState(false);
  const [userBusy, setUserBusy] = useState(false);
  const [userPreviewBusy, setUserPreviewBusy] = useState(false);
  const [userLoadBusy, setUserLoadBusy] = useState(false);
  const [userMsg, setUserMsg] = useState<string | null>(null);
  const [userDoneReport, setUserDoneReport] = useState<string | null>(null);
  const [userPreviewReport, setUserPreviewReport] = useState<string | null>(null);

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

  const buildUserBody = (dryRun: boolean) => ({
    user_id: userId.trim(),
    reason: userReason.trim(),
    confirmation_phrase: USER_PHRASE,
    target_email_confirmation: userEmailConfirm.trim(),
    acknowledge_irreversible: true as const,
    ...(dryRun ? { dry_run: true } : {}),
  });

  const validateUserForm = (): string | null => {
    const id = userId.trim();
    if (!id) return "User id is required.";
    if (userReason.trim().length < 20) return "Reason must be at least 20 characters (audit requirement).";
    if (!userAck) return "Confirm that you understand this action is irreversible.";
    if (userPhrase.trim() !== USER_PHRASE) return `Type exactly: ${USER_PHRASE}`;
    return null;
  };

  const previewUserPurge = async () => {
    setUserMsg(null);
    const err = validateUserForm();
    if (err) {
      setUserMsg(err);
      return;
    }
    setUserPreviewBusy(true);
    try {
      const payload = await adminApi.postJson<{ dry_run?: boolean; preview?: unknown }>(
        "/api/admin/compliance/purge-user",
        buildUserBody(true),
      );
      setUserPreviewReport(JSON.stringify(payload, null, 2));
      setUserMsg("Preview loaded. No data was deleted.");
    } catch (e) {
      setUserMsg(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setUserPreviewBusy(false);
    }
  };

  const submitUserPurge = async () => {
    setUserMsg(null);
    setUserDoneReport(null);
    const err = validateUserForm();
    if (err) {
      setUserMsg(err);
      return;
    }
    setUserBusy(true);
    try {
      const payload = await adminApi.postJson<{
        report?: unknown;
        compliance_audit_id?: string | null;
        compliance_audit_write_error?: string | null;
      }>("/api/admin/compliance/purge-user", buildUserBody(false));
      setUserDoneReport(
        JSON.stringify(
          {
            report: payload?.report,
            compliance_audit_id: payload?.compliance_audit_id,
            compliance_audit_write_error: payload?.compliance_audit_write_error,
          },
          null,
          2,
        ),
      );
      setUserPreviewReport(null);
      setUserMsg("Account purged. Retain the report below if required for compliance.");
      updateAuditParams({ page: "1" });
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
  const [providerLookupTenantId, setProviderLookupTenantId] = useState<string | null>(null);
  const [providerReason, setProviderReason] = useState("");
  const [providerEmailTyped, setProviderEmailTyped] = useState("");
  const [providerPhrase, setProviderPhrase] = useState("");
  const [providerAck, setProviderAck] = useState(false);
  const [providerBusy, setProviderBusy] = useState(false);
  const [providerPreviewBusy, setProviderPreviewBusy] = useState(false);
  const [providerLoadBusy, setProviderLoadBusy] = useState(false);
  const [providerMsg, setProviderMsg] = useState<string | null>(null);
  const [providerDoneReport, setProviderDoneReport] = useState<string | null>(null);
  const [providerPreviewReport, setProviderPreviewReport] = useState<string | null>(null);

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
        `/api/admin/compliance/lookup-provider/${encodeURIComponent(id)}`,
      );
      const emails = providerPurgeConfirmationEmails({
        email: p.email as string | null,
        billing_email: p.billing_email as string | null,
        owner: p.owner as { email?: string | null } | null,
      });
      setProviderBusinessEmail(emails.businessEmail);
      setProviderBillingEmail(emails.billingEmail);
      setProviderOwnerEmail(emails.ownerEmail);
      const tid = p.tenant_id != null ? String(p.tenant_id) : null;
      setProviderLookupTenantId(tid);
      const { scope, tenantId: pickerTenant } = readAdminScopeFromStorage();
      const pickerMismatch =
        tid && scope === "tenant" && pickerTenant && pickerTenant !== tid
          ? ` Provider tenant is ${tid.slice(0, 8)}… — set the admin tenant picker to this tenant before Preview or Execute.`
          : "";
      setProviderMsg(
        (emails.businessEmail || emails.billingEmail || emails.ownerEmail
          ? `Business: ${emails.businessEmail || "—"} · Billing: ${emails.billingEmail || "—"} · Owner: ${emails.ownerEmail || "—"}`
          : "Provider loaded; no emails found for confirmation typing.") + pickerMismatch,
      );
    } catch (e) {
      setProviderBusinessEmail("");
      setProviderBillingEmail("");
      setProviderOwnerEmail("");
      setProviderLookupTenantId(null);
      setProviderMsg(e instanceof Error ? e.message : "Could not load provider");
    } finally {
      setProviderLoadBusy(false);
    }
  };

  const validateProviderForm = (): string | null => {
    const id = providerId.trim();
    if (!id) return "Provider id is required.";
    if (providerReason.trim().length < 20) return "Reason must be at least 20 characters (audit requirement).";
    if (!providerAck) return "Confirm that you understand this action is irreversible.";
    if (providerPhrase.trim() !== PROVIDER_PHRASE) return `Type exactly: ${PROVIDER_PHRASE}`;
    const allowedEmails = [providerBusinessEmail, providerBillingEmail, providerOwnerEmail].filter(
      (e) => e && e.trim(),
    );
    const typed = normalizeEmail(providerEmailTyped);
    const ok = allowedEmails.some((e) => normalizeEmail(e) === typed);
    if (!ok) {
      return "Typed email must match business, billing, or owner profile email (server also accepts owner Auth email if it differs).";
    }
    return null;
  };

  const buildProviderBody = (dryRun: boolean) => ({
    provider_id: providerId.trim(),
    reason: providerReason.trim(),
    confirmation_phrase: PROVIDER_PHRASE,
    typed_email_confirmation: providerEmailTyped.trim(),
    acknowledge_irreversible: true as const,
    ...(dryRun ? { dry_run: true } : {}),
  });

  const previewProviderPurge = async () => {
    setProviderMsg(null);
    const err = validateProviderForm();
    if (err) {
      setProviderMsg(err);
      return;
    }
    setProviderPreviewBusy(true);
    try {
      const payload = await adminApi.postJson<{ dry_run?: boolean; preview?: unknown }>(
        "/api/admin/compliance/purge-provider",
        buildProviderBody(true),
      );
      setProviderPreviewReport(JSON.stringify(payload, null, 2));
      setProviderMsg("Preview loaded. No data was deleted.");
    } catch (e) {
      setProviderMsg(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setProviderPreviewBusy(false);
    }
  };

  const submitProviderPurge = async () => {
    setProviderMsg(null);
    setProviderDoneReport(null);
    const err = validateProviderForm();
    if (err) {
      setProviderMsg(err);
      return;
    }
    setProviderBusy(true);
    try {
      const payload = await adminApi.postJson<{
        report?: unknown;
        compliance_audit_id?: string | null;
        compliance_audit_write_error?: string | null;
      }>("/api/admin/compliance/purge-provider", buildProviderBody(false));
      setProviderDoneReport(
        JSON.stringify(
          {
            report: payload?.report,
            compliance_audit_id: payload?.compliance_audit_id,
            compliance_audit_write_error: payload?.compliance_audit_write_error,
          },
          null,
          2,
        ),
      );
      setProviderPreviewReport(null);
      setProviderMsg("Provider organization purged. Retain the report below if required.");
      updateAuditParams({ page: "1" });
      void loadAudit();
    } catch (e) {
      setProviderMsg(e instanceof Error ? e.message : "Purge failed");
    } finally {
      setProviderBusy(false);
    }
  };

  if (denied) return denied;

  const tenantBanner = (
    <AdminPanel className="border-amber-100 bg-amber-50/60 text-sm text-amber-950">
      <p className="font-medium">Tenant picker applies to Preview and Execute</p>
      <p className="mt-1 text-amber-900/90">
        Set the admin scope to the subject&apos;s tenant before purging a user or provider in that tenant.{" "}
        <strong>Load account</strong> uses platform-wide lookup; purge APIs enforce tenant scope. Failed attempts
        appear in{" "}
        <Link className="underline" to={adminSpaTo("/admin/audit-logs?search=compliance_purge")}>
          Audit logs
        </Link>{" "}
        (search <code className="rounded bg-amber-100/80 px-1">compliance_purge</code>), not in the table below.
      </p>
      {providerLookupTenantId ? (
        <p className="mt-2 font-mono text-xs text-amber-900">
          Last loaded provider tenant: {providerLookupTenantId}
        </p>
      ) : null}
    </AdminPanel>
  );

  return (
    <div className="space-y-8">
      <CpBack />
      <AdminPageHeader
        title="Compliance purge"
        description="Superadmin-only erasure flows with immutable audit logging. Use only for verified DSAR / legal requests."
      />

      {tenantBanner}

      <AdminPanel className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Recent purge audit (read-only)</h2>
            <p className="text-sm text-gray-600">
              <code className="rounded bg-gray-100 px-1">GET /api/admin/compliance/purge-audit</code>
            </p>
          </div>
          <button
            type="button"
            disabled={auditLoading}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm disabled:opacity-50"
            onClick={() =>
              void downloadAdminBlob(
                `/api/admin/export/compliance-purge-audit${auditExportQueryString ? `?${auditExportQueryString}` : ""}`,
                `compliance-purge-audit-${Date.now()}.csv`,
              ).catch(() => adminToast.error("Export failed — please try again"))
            }
          >
            Export CSV
          </button>
        </div>

        <p className="text-xs text-gray-500">Click a reason to load the full compliance report below the table.</p>

        <div key={auditFilterParams.toString() || "no-filters"} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <select
            value={auditPurgeType}
            onChange={(e) => updateAuditParams({ purge_type: e.target.value || null, page: "1" })}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">All types</option>
            <option value="user">user</option>
            <option value="provider_org">provider_org</option>
            <option value="tenant_reset">tenant_reset</option>
          </select>
          <input
            type="search"
            placeholder="Search reason"
            defaultValue={auditSearch}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            onBlur={(e) => updateAuditParams({ search: e.target.value.trim() || null, page: "1" })}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                updateAuditParams({ search: (e.target as HTMLInputElement).value.trim() || null, page: "1" });
              }
            }}
          />
          <input
            type="date"
            value={auditStartDate}
            onChange={(e) => updateAuditParams({ start_date: e.target.value || null, page: "1" })}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            title="Start date"
          />
          <input
            type="date"
            value={auditEndDate}
            onChange={(e) => updateAuditParams({ end_date: e.target.value || null, page: "1" })}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            title="End date"
          />
          <input
            type="text"
            placeholder="Actor user UUID"
            defaultValue={auditActorId}
            className="rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs"
            onBlur={(e) => updateAuditParams({ actor_user_id: e.target.value.trim() || null, page: "1" })}
          />
          <input
            type="text"
            placeholder="Tenant UUID"
            defaultValue={auditTenantId}
            className="rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs"
            onBlur={(e) => updateAuditParams({ tenant_id: e.target.value.trim() || null, page: "1" })}
          />
          <input
            type="text"
            placeholder="Target user UUID"
            defaultValue={auditTargetUserId}
            className="rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs"
            onBlur={(e) => updateAuditParams({ target_user_id: e.target.value.trim() || null, page: "1" })}
          />
          <input
            type="text"
            placeholder="Provider UUID"
            defaultValue={auditProviderId}
            className="rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs"
            onBlur={(e) => updateAuditParams({ provider_id: e.target.value.trim() || null, page: "1" })}
          />
          {hasAuditFilters ? (
            <button
              type="button"
              className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 sm:col-span-2 lg:col-span-4"
              onClick={() =>
                updateAuditParams({
                  search: null,
                  purge_type: null,
                  actor_user_id: null,
                  tenant_id: null,
                  target_user_id: null,
                  provider_id: null,
                  start_date: null,
                  end_date: null,
                  page: "1",
                  audit: null,
                })
              }
            >
              Clear all filters
            </button>
          ) : null}
        </div>

        {!auditLoading && auditMeta ? (
          <p className="text-sm text-gray-600">
            Page {auditMeta.page} of {totalPages} · showing {entries.length} of {auditMeta.total} entries
          </p>
        ) : null}

        {auditLoading ? (
          <AdminPageSkeleton rows={4} />
        ) : auditError ? (
          <AdminRetryBlock message={auditError} onRetry={() => void loadAudit()} />
        ) : entries.length === 0 ? (
          <p className="text-sm text-gray-500">
            {hasAuditFilters ? "No matching purge audit entries. Try clearing filters." : "No entries yet."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs uppercase text-gray-500">
                  <th className="py-2 pr-2 font-medium">When</th>
                  <th className="py-2 pr-2 font-medium">Type</th>
                  <th className="py-2 pr-2 font-medium">Actor</th>
                  <th className="py-2 pr-2 font-medium">Target</th>
                  <th className="py-2 pr-2 font-medium">Tenant</th>
                  <th className="py-2 pr-2 font-medium">Reason</th>
                  <th className="py-2 font-medium">Retention until</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((row) => {
                  const isOpen = expandedAuditId === row.id;
                  const actorLabel = row.actor?.full_name || row.actor?.email;
                  return (
                    <tr key={row.id} className="border-b border-gray-100 align-top">
                      <td className="py-2 pr-2 whitespace-nowrap text-gray-700">
                        {new Date(row.created_at).toLocaleString(undefined, { hour12: false })}
                      </td>
                      <td className="py-2 pr-2 capitalize">{row.purge_type ?? "—"}</td>
                      <td className="py-2 pr-2 text-gray-700">
                        {actorLabel ? (
                          <span>{actorLabel}</span>
                        ) : row.actor_user_id ? (
                          <span title={row.actor_user_id}>Actor removed · {row.actor_user_id.slice(0, 8)}…</span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-2 pr-2 font-mono text-xs text-gray-700">
                        <div className="flex flex-col gap-1">
                          {row.target_user_id ? (
                            <span className="flex items-center gap-1">
                              user: {row.target_user_id}
                              <button
                                type="button"
                                className="text-primary underline"
                                onClick={() => void copyText(row.target_user_id!)}
                              >
                                copy
                              </button>
                            </span>
                          ) : null}
                          {row.provider_id ? (
                            <span className="flex items-center gap-1">
                              provider: {row.provider_id}
                              <button
                                type="button"
                                className="text-primary underline"
                                onClick={() => void copyText(row.provider_id!)}
                              >
                                copy
                              </button>
                            </span>
                          ) : null}
                          {!row.target_user_id && !row.provider_id ? (
                            row.purge_type === "tenant_reset" && row.tenant_id ? (
                              <span title={row.tenant_id}>tenant reset · {row.tenant_id.slice(0, 8)}…</span>
                            ) : (
                              "—"
                            )
                          ) : null}
                        </div>
                      </td>
                      <td className="py-2 pr-2 font-mono text-xs">{row.tenant_id ?? "—"}</td>
                      <td className="max-w-xs py-2 pr-2 text-gray-600">
                        <button
                          type="button"
                          className="text-left underline decoration-gray-300 hover:decoration-gray-600"
                          onClick={() => updateAuditParams({ audit: isOpen ? null : row.id })}
                        >
                          {row.reason ?? "—"}
                        </button>
                      </td>
                      <td className="py-2 whitespace-nowrap text-gray-600">{formatRetention(row.purge_after_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {expandedAuditId ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-medium text-gray-900">Audit detail</h3>
              <button
                type="button"
                className="text-sm text-gray-600 underline"
                onClick={() => updateAuditParams({ audit: null })}
              >
                Close
              </button>
            </div>
            {detailLoading ? (
              <p className="mt-2 text-sm text-gray-600">Loading report…</p>
            ) : detailError ? (
              <p className="mt-2 text-sm text-red-700">{detailError}</p>
            ) : detailEntry ? (
              <div className="mt-3 space-y-2">
                {detailEntry.purged_user_ids?.length ? (
                  <p className="text-xs text-gray-600">
                    Purged auth user ids: {detailEntry.purged_user_ids.join(", ")}
                  </p>
                ) : null}
                <button
                  type="button"
                  className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm"
                  onClick={() =>
                    downloadJson(`compliance-purge-audit-${detailEntry.id}.json`, {
                      id: detailEntry.id,
                      report: detailEntry.report,
                      purged_user_ids: detailEntry.purged_user_ids,
                    })
                  }
                >
                  Download report JSON
                </button>
                <pre className="max-h-64 overflow-auto rounded-lg bg-gray-900 p-3 text-xs text-gray-100">
                  {JSON.stringify(detailEntry.report, null, 2)}
                </pre>
              </div>
            ) : (
              <p className="mt-2 text-sm text-gray-500">No detail loaded.</p>
            )}
          </div>
        ) : null}

        {!auditLoading && auditMeta && auditMeta.total > 0 ? (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="rounded border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
              disabled={auditPage <= 1}
              onClick={() => updateAuditParams({ page: String(auditPage - 1) })}
            >
              Previous
            </button>
            <span className="text-sm text-gray-600">
              Page {auditPage} of {totalPages}
            </span>
            <button
              type="button"
              className="rounded border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
              disabled={auditPage >= totalPages}
              onClick={() => updateAuditParams({ page: String(auditPage + 1) })}
            >
              Next
            </button>
            <select
              value={String(auditLimit)}
              onChange={(e) => updateAuditParams({ limit: e.target.value, page: "1" })}
              className="rounded border border-gray-300 px-2 py-2 text-sm"
            >
              {[25, 50, 100].map((n) => (
                <option key={n} value={String(n)}>
                  {n} / page
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </AdminPanel>

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
        {userPreviewReport ? (
          <pre className="max-h-64 overflow-auto rounded-lg bg-gray-800 p-3 text-xs text-gray-100">{userPreviewReport}</pre>
        ) : null}
        {userDoneReport ? (
          <pre className="max-h-64 overflow-auto rounded-lg bg-gray-900 p-3 text-xs text-gray-100">{userDoneReport}</pre>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={userPreviewBusy || userBusy}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium disabled:opacity-50"
            onClick={() => void previewUserPurge()}
          >
            {userPreviewBusy ? "Previewing…" : "Preview impact"}
          </button>
          <button
            type="button"
            disabled={userBusy}
            className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            onClick={() => void submitUserPurge()}
          >
            {userBusy ? "Purging…" : "Execute user purge"}
          </button>
        </div>
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
        <CpField label="Type matching business, billing, or owner email">
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
        {providerPreviewReport ? (
          <pre className="max-h-64 overflow-auto rounded-lg bg-gray-800 p-3 text-xs text-gray-100">
            {providerPreviewReport}
          </pre>
        ) : null}
        {providerDoneReport ? (
          <pre className="max-h-64 overflow-auto rounded-lg bg-gray-900 p-3 text-xs text-gray-100">
            {providerDoneReport}
          </pre>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={providerPreviewBusy || providerBusy}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium disabled:opacity-50"
            onClick={() => void previewProviderPurge()}
          >
            {providerPreviewBusy ? "Previewing…" : "Preview impact"}
          </button>
          <button
            type="button"
            disabled={providerBusy}
            className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            onClick={() => void submitProviderPurge()}
          >
            {providerBusy ? "Purging…" : "Execute provider purge"}
          </button>
        </div>
      </AdminPanel>
    </div>
  );
}
