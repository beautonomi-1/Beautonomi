import { useCallback, useEffect, useMemo, useState } from "react";
import { useSuperadminPage } from "@/hooks/useSuperadminPage";
import { adminApi } from "@/lib/adminClient";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { CpBack, CpField } from "./cpShared";

/**
 * Tenant "clean slate" — wipes a tenant's transactional data (bookings, payments, ledger, orders,
 * reviews, conversations, notifications, …) while preserving the structural spine (users,
 * providers, services, products, catalog, platform settings, tenant config).
 *
 * For full user erasure, use the sibling Compliance Purge page.
 */

const CONFIRMATION_PHRASE = "RESET TENANT TRANSACTIONS" as const;

type TenantSummary = {
  id: string;
  slug: string | null;
  name?: string | null;
  lifecycle?: string | null;
  region_code?: string | null;
};

type CountEntry = { rows?: number; via?: string; skipped?: string };

type ResetResponse = {
  tenant_id: string;
  tenant_slug: string;
  dry_run: boolean;
  compliance_audit_id: string | null;
  compliance_audit_write_error: string | null;
  counts: Record<string, CountEntry>;
  totals: { tables: number; rows: number };
  report?: unknown;
};

export function TenantResetPage() {
  const { allowed, denied } = useSuperadminPage(
    "Tenant transactional reset is superadmin-only and maps to POST /api/admin/compliance/reset-tenant."
  );

  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [tenantsLoading, setTenantsLoading] = useState(true);
  const [tenantsError, setTenantsError] = useState<string | null>(null);

  const [tenantId, setTenantId] = useState("");
  const [slugConfirmation, setSlugConfirmation] = useState("");
  const [reason, setReason] = useState("");
  const [phrase, setPhrase] = useState("");
  const [ack, setAck] = useState(false);
  const [allowDefaultTenant, setAllowDefaultTenant] = useState(false);

  const [previewBusy, setPreviewBusy] = useState(false);
  const [executeBusy, setExecuteBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [msgTone, setMsgTone] = useState<"info" | "error" | "success">("info");
  const [preview, setPreview] = useState<ResetResponse | null>(null);
  const [liveReport, setLiveReport] = useState<ResetResponse | null>(null);

  const selectedTenant = useMemo(
    () => tenants.find((t) => t.id === tenantId.trim()) ?? null,
    [tenants, tenantId]
  );

  const loadTenants = useCallback(async () => {
    if (!allowed) return;
    setTenantsLoading(true);
    setTenantsError(null);
    try {
      // `successResponse(data ?? [])` on the server → getJson unwraps to TenantSummary[].
      const list = await adminApi.getJson<TenantSummary[]>("/api/admin/tenants?include_inactive=true");
      setTenants(Array.isArray(list) ? list : []);
    } catch (e) {
      setTenantsError(e instanceof Error ? e.message : "Failed to load tenants");
      setTenants([]);
    } finally {
      setTenantsLoading(false);
    }
  }, [allowed]);

  useEffect(() => {
    void loadTenants();
  }, [loadTenants]);

  const resetFlow = () => {
    setPreview(null);
    setLiveReport(null);
    setMsg(null);
  };

  const validateShared = (): string | null => {
    if (!tenantId.trim()) return "Tenant is required.";
    if (reason.trim().length < 20) return "Reason must be at least 20 characters (audit requirement).";
    if (!ack) return "Confirm that you understand this is irreversible.";
    if (phrase.trim() !== CONFIRMATION_PHRASE) return `Type exactly: ${CONFIRMATION_PHRASE}`;
    if (!selectedTenant) return "Select a tenant from the list (unknown tenant id).";
    if ((selectedTenant.slug ?? "").toLowerCase() !== slugConfirmation.trim().toLowerCase()) {
      return "Tenant slug confirmation must match the selected tenant's slug.";
    }
    return null;
  };

  const runReset = async (dryRun: boolean) => {
    setMsg(null);
    setLiveReport(null);
    if (dryRun) setPreview(null);

    const err = validateShared();
    if (err) {
      setMsgTone("error");
      setMsg(err);
      return;
    }

    (dryRun ? setPreviewBusy : setExecuteBusy)(true);
    try {
      const body = {
        tenant_id: tenantId.trim(),
        tenant_slug_confirmation: slugConfirmation.trim(),
        reason: reason.trim(),
        confirmation_phrase: CONFIRMATION_PHRASE,
        acknowledge_irreversible: true,
        dry_run: dryRun,
        allow_default_tenant: allowDefaultTenant,
      };
      const resp = await adminApi.postJson<ResetResponse>(
        "/api/admin/compliance/reset-tenant",
        body
      );
      if (dryRun) {
        setPreview(resp);
        setMsg(
          `Dry run complete — ${resp.totals.rows.toLocaleString()} row${
            resp.totals.rows === 1 ? "" : "s"
          } across ${resp.totals.tables} table${resp.totals.tables === 1 ? "" : "s"} would be deleted. No data changed.`
        );
        setMsgTone("info");
      } else {
        setLiveReport(resp);
        setMsg(
          `Reset complete — ${resp.totals.rows.toLocaleString()} row${
            resp.totals.rows === 1 ? "" : "s"
          } deleted. Compliance audit id: ${resp.compliance_audit_id ?? "(not written)"}.`
        );
        setMsgTone("success");
      }
    } catch (e) {
      setMsgTone("error");
      setMsg(e instanceof Error ? e.message : "Tenant reset failed");
    } finally {
      (dryRun ? setPreviewBusy : setExecuteBusy)(false);
    }
  };

  if (denied) return denied;

  const slugMismatch =
    !!selectedTenant &&
    slugConfirmation.trim().length > 0 &&
    (selectedTenant.slug ?? "").toLowerCase() !== slugConfirmation.trim().toLowerCase();

  return (
    <div className="space-y-8">
      <CpBack />
      <AdminPageHeader
        title="Tenant transactional reset"
        description={
          <>
            <strong>Clean slate for a tenant.</strong> Wipes bookings, payments, orders, wallet/ledger movements,
            reviews, conversations, notifications, and support tickets scoped to that tenant. Preserves
            users, providers, services, products, catalog, platform settings, and tenant config.
          </>
        }
      />

      <AdminPanel className="space-y-2 border-amber-200 bg-amber-50/50">
        <p className="text-sm font-medium text-amber-900">Before you run this:</p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-amber-900/90">
          <li>Use the <em>Preview (dry run)</em> button first — it returns per-table counts without deleting anything.</li>
          <li>The default ZA tenant is blocked unless you explicitly tick <em>Allow default tenant</em>. Do not tick it unless you are truly wiping production.</li>
          <li>Every live run writes an immutable row to <code>compliance_purge_audit_log</code> with your user id, reason, and the per-table report.</li>
          <li>For <strong>full user erasure</strong> (DSAR / legal right-to-be-forgotten), use the Compliance Purge page instead.</li>
        </ul>
      </AdminPanel>

      <AdminPanel className="space-y-4 border-red-100 bg-red-50/30">
        <h2 className="text-lg font-semibold text-red-900">Target tenant</h2>

        <CpField label="Tenant">
          {tenantsLoading ? (
            <p className="text-sm text-gray-600">Loading tenants…</p>
          ) : tenantsError ? (
            <div className="flex flex-wrap items-center gap-2 text-sm text-red-700">
              <span>{tenantsError}</span>
              <button
                type="button"
                className="rounded border border-red-300 bg-white px-2 py-1 text-xs"
                onClick={() => void loadTenants()}
              >
                Retry
              </button>
            </div>
          ) : (
            <select
              className="w-full max-w-xl rounded-lg border border-gray-200 px-2 py-1.5 font-mono text-sm"
              value={tenantId}
              onChange={(e) => {
                setTenantId(e.target.value);
                resetFlow();
              }}
            >
              <option value="">— Select tenant —</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name ? `${t.name} · ` : ""}
                  {t.slug ?? "(no slug)"} · {t.id}
                </option>
              ))}
            </select>
          )}
        </CpField>

        {selectedTenant ? (
          <p className="text-sm text-gray-700">
            Selected: <span className="font-medium">{selectedTenant.name ?? selectedTenant.slug ?? "(unnamed)"}</span>
            <span className="ml-2 rounded bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-700">
              slug: {selectedTenant.slug ?? "—"}
            </span>
          </p>
        ) : null}

        <CpField label={`Type the tenant slug to confirm${selectedTenant ? ` (expected: ${selectedTenant.slug ?? ""})` : ""}`}>
          <input
            className="w-full max-w-md rounded-lg border border-gray-200 px-2 py-1.5 font-mono text-sm"
            value={slugConfirmation}
            onChange={(e) => setSlugConfirmation(e.target.value)}
            autoComplete="off"
          />
          {slugMismatch ? (
            <p className="mt-1 text-xs text-red-700">Does not match the selected tenant's slug.</p>
          ) : null}
        </CpField>

        <CpField label="Reason (min. 20 characters)">
          <textarea
            className="mt-1 w-full max-w-xl rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
            rows={4}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ticket ID, reset approval, or test-environment preparation context…"
          />
        </CpField>

        <CpField label={`Confirmation phrase (exactly: ${CONFIRMATION_PHRASE})`}>
          <input
            className="w-full max-w-md rounded-lg border border-gray-200 px-2 py-1.5 font-mono text-sm"
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            autoComplete="off"
          />
        </CpField>

        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
          <span>I understand this is irreversible and authorized under our reset process.</span>
        </label>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={allowDefaultTenant}
            onChange={(e) => setAllowDefaultTenant(e.target.checked)}
          />
          <span>
            Allow default tenant (only tick if you are intentionally wiping the production ZA tenant).
          </span>
        </label>

        {msg ? (
          <p
            className={
              msgTone === "error"
                ? "text-sm text-red-800"
                : msgTone === "success"
                  ? "text-sm text-emerald-800"
                  : "text-sm text-gray-800"
            }
          >
            {msg}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={previewBusy || executeBusy}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 disabled:opacity-50"
            onClick={() => void runReset(true)}
          >
            {previewBusy ? "Previewing…" : "Preview (dry run)"}
          </button>
          <button
            type="button"
            disabled={previewBusy || executeBusy || !preview || preview.tenant_id !== tenantId.trim()}
            className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            onClick={() => void runReset(false)}
            title={
              !preview
                ? "Run a preview first"
                : preview.tenant_id !== tenantId.trim()
                  ? "Preview is for a different tenant — re-preview before executing"
                  : undefined
            }
          >
            {executeBusy ? "Resetting…" : "Execute reset"}
          </button>
        </div>
      </AdminPanel>

      {(preview || liveReport) && (
        <AdminPanel className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">
            {liveReport ? "Reset result" : "Dry-run preview"}
          </h2>
          <p className="text-sm text-gray-600">
            Tenant <code className="rounded bg-gray-100 px-1">{(liveReport ?? preview)?.tenant_slug}</code>
            {" · "}
            <span className="font-medium">
              {(liveReport ?? preview)?.totals.rows.toLocaleString()} rows
            </span>
            {" across "}
            {(liveReport ?? preview)?.totals.tables} tables
            {liveReport?.compliance_audit_id ? (
              <>
                {" · audit "}
                <code className="rounded bg-gray-100 px-1 font-mono">{liveReport.compliance_audit_id}</code>
              </>
            ) : null}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs uppercase text-gray-500">
                  <th className="py-2 pr-2 font-medium">Table</th>
                  <th className="py-2 pr-2 font-medium">Rows</th>
                  <th className="py-2 font-medium">Via</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries((liveReport ?? preview)!.counts)
                  .sort((a, b) => (b[1].rows ?? 0) - (a[1].rows ?? 0))
                  .map(([table, entry]) => (
                    <tr key={table} className="border-b border-gray-100">
                      <td className="py-1.5 pr-2 font-mono text-xs text-gray-800">{table}</td>
                      <td className="py-1.5 pr-2 text-gray-800">
                        {entry.skipped ? <em className="text-gray-400">{entry.skipped}</em> : entry.rows ?? 0}
                      </td>
                      <td className="py-1.5 text-xs text-gray-500">{entry.via ?? "—"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {liveReport?.compliance_audit_write_error ? (
            <p className="text-xs text-red-700">
              Audit row write failed: {liveReport.compliance_audit_write_error}
            </p>
          ) : null}
        </AdminPanel>
      )}
    </div>
  );
}
