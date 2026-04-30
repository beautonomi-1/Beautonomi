import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { adminApi } from "@/lib/adminClient";
import { useSuperadminPage } from "@/hooks/useSuperadminPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { CpBack, CpField, EnvSelect } from "./cpShared";
import {
  AdminDataTable,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
} from "@/components/admin/AdminDataTable";
import { datetimeLocalToIsoOrNull, isoToDatetimeLocalValue } from "@/lib/maintenance-datetime";
import {
  PUBLIC_SITE_MAINTENANCE_EXEMPT_PREFIXES,
  PROVIDER_WEB_MAINTENANCE_EXEMPT_PREFIXES,
} from "@beautonomi/maintenance-paths";

type MaintenanceScope = "public_site" | "provider_web" | "customer_app" | "provider_app";
const MAINTENANCE_SCOPES: MaintenanceScope[] = [
  "public_site",
  "provider_web",
  "customer_app",
  "provider_app",
];
const SCOPE_LABELS: Record<MaintenanceScope, string> = {
  public_site: "Customer public site (marketing/booking web)",
  provider_web: "Provider / partner web (/provider)",
  customer_app: "Customer app (Expo)",
  provider_app: "Provider app (Expo)",
};

type MaintConfig = {
  enabled: boolean;
  title: string;
  message: string;
  cta_label?: string | null;
  countdown_end_at?: string | null;
  countdown_label?: string | null;
  /** provider_web only: default true */
  allow_partner_funnel?: boolean;
};

function defaultMaint(): MaintConfig {
  return {
    enabled: false,
    title: "We'll be back soon",
    message: "We're performing scheduled maintenance.",
    cta_label: null,
    countdown_end_at: null,
    countdown_label: null,
    allow_partner_funnel: true,
  };
}

function emptyMaintenanceRecord(): Record<MaintenanceScope, MaintConfig> {
  return {
    public_site: defaultMaint(),
    provider_web: defaultMaint(),
    customer_app: defaultMaint(),
    provider_app: defaultMaint(),
  };
}

/** Deep-merge API payloads with defaults so every scope field (e.g. allow_partner_funnel) is always controlled. */
function normalizeMaintenanceFromApi(
  data: Partial<Record<MaintenanceScope, Partial<MaintConfig>>> | null | undefined
): Record<MaintenanceScope, MaintConfig> {
  const base = emptyMaintenanceRecord();
  if (!data) return base;
  return {
    public_site: { ...base.public_site, ...data.public_site },
    provider_web: { ...base.provider_web, ...data.provider_web },
    customer_app: { ...base.customer_app, ...data.customer_app },
    provider_app: { ...base.provider_app, ...data.provider_app },
  };
}

function previewUrl(scope: MaintenanceScope): string {
  const base = typeof window !== "undefined" ? window.location.origin : "";
  if (scope === "public_site") return `${base}/?maintenance_preview=1`;
  if (scope === "provider_web") return `${base}/provider?maintenance_preview=1`;
  return `${base}/maintenance-preview?scope=${scope}`;
}

export function CpAuditLogPage() {
  const { denied } = useSuperadminPage("Control plane is superadmin-only.");
  const [page, setPage] = useState(1);
  const [area, setArea] = useState("");
  const [recordKey, setRecordKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<
    Array<{
      id: string;
      changed_by: string | null;
      area: string;
      record_key: string;
      created_at: string;
    }>
  >([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let c = false;
    (async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: String(page), limit: "20" });
        if (area) params.set("area", area);
        if (recordKey) params.set("record_key", recordKey);
        const inner = await adminApi.getJson<{ items: typeof items; total: number }>(
          `/api/admin/control-plane/config-change-log?${params}`
        );
        if (c) return;
        setItems(inner?.items ?? []);
        setTotal(inner?.total ?? 0);
      } catch {
        if (!c) {
          setItems([]);
          setTotal(0);
        }
      } finally {
        if (!c) setLoading(false);
      }
    })();
    return () => {
      c = true;
    };
  }, [page, area, recordKey]);

  if (denied) return denied;

  return (
    <div className="space-y-6">
      <CpBack />
      <AdminPageHeader title="Config change log" description="Audit trail for flags, integrations, and modules." />
      <div className="flex flex-wrap gap-4">
        <CpField label="Area">
          <select
            className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
            value={area || "all"}
            onChange={(e) => setArea(e.target.value === "all" ? "" : e.target.value)}
          >
            <option value="all">All</option>
            <option value="flags">flags</option>
            <option value="integration">integration</option>
            <option value="module">module</option>
            <option value="ai_template">ai_template</option>
          </select>
        </CpField>
        <CpField label="Record key">
          <input
            className="w-56 rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
            value={recordKey}
            onChange={(e) => setRecordKey(e.target.value)}
            placeholder="e.g. gemini.production"
          />
        </CpField>
      </div>
      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <AdminPanel>
          <p className="mb-3 text-sm text-gray-600">Total: {total}</p>
          <ul className="space-y-3 text-sm">
            {items.map((it) => (
              <li key={it.id} className="border-b border-gray-100 pb-2">
                <span className="font-medium">{it.area}</span> · {it.record_key}
                <span className="mt-1 block text-xs text-gray-500">
                  {it.changed_by ?? "—"} · {new Date(it.created_at).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              className="rounded border border-gray-200 px-3 py-1 text-sm disabled:opacity-50"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </button>
            <button
              type="button"
              className="rounded border border-gray-200 px-3 py-1 text-sm disabled:opacity-50"
              disabled={items.length < 20}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </AdminPanel>
      )}
    </div>
  );
}

export function CpMaintenancePage() {
  const { allowed, denied } = useSuperadminPage("Control plane is superadmin-only.");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [maintenance, setMaintenance] = useState<Record<MaintenanceScope, MaintConfig>>(emptyMaintenanceRecord());

  useEffect(() => {
    if (!allowed) return;
    let c = false;
    (async () => {
      setLoading(true);
      try {
        const data = await adminApi.getJson<Record<MaintenanceScope, MaintConfig>>("/api/admin/maintenance");
        if (c || !data) return;
        setMaintenance(normalizeMaintenanceFromApi(data));
      } catch (e) {
        if (!c) setMsg(e instanceof Error ? e.message : "Load failed");
      } finally {
        if (!c) setLoading(false);
      }
    })();
    return () => {
      c = true;
    };
  }, [allowed]);

  const updateScope = (scope: MaintenanceScope, patch: Partial<MaintConfig>) => {
    setMaintenance((prev) => ({ ...prev, [scope]: { ...prev[scope], ...patch } }));
  };

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const saved = await adminApi.patchJson<Record<MaintenanceScope, MaintConfig>>("/api/admin/maintenance", {
        maintenance,
      });
      setMaintenance(normalizeMaintenanceFromApi(saved));
      setMsg("Saved.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (denied) return denied;

  return (
    <div className="space-y-6">
      <CpBack />
      <AdminPageHeader
        title="Maintenance & Coming Soon"
        description={
          <span>
            Per-scope maintenance or coming-soon pages. Use Preview to open the site in a new tab with maintenance on.
            Scoped saves use the admin tenant picker (same as Next admin).{" "}
            <Link to="sign-ups" className="font-medium text-primary underline">
              View notify sign-ups
            </Link>
          </span>
        }
      />
      {msg ? (
        <AdminPanel>
          <p className="text-sm text-gray-700">{msg}</p>
        </AdminPanel>
      ) : null}
      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <>
          {MAINTENANCE_SCOPES.map((scope) => (
            <AdminPanel key={scope} className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">{SCOPE_LABELS[scope]}</h2>
                  <p className="text-xs text-gray-500">Scope: {scope}</p>
                  {scope === "public_site" ? (
                    <p className="mt-1 text-xs text-gray-600">
                      Partner funnel and auth stay live:{" "}
                      {PUBLIC_SITE_MAINTENANCE_EXEMPT_PREFIXES.map((path, i) => (
                        <span key={path}>
                          {i > 0 ? ", " : null}
                          <code className="rounded bg-gray-100 px-0.5 text-[11px]">{path}</code>
                        </span>
                      ))}
                      .
                    </p>
                  ) : null}
                  {scope === "provider_web" ? (
                    <p className="mt-1 text-xs text-gray-600">
                      Optional funnel bypass when maintenance is on (toggle below):{" "}
                      {PROVIDER_WEB_MAINTENANCE_EXEMPT_PREFIXES.map((path, i) => (
                        <span key={path}>
                          {i > 0 ? ", " : null}
                          <code className="rounded bg-gray-100 px-0.5 text-[11px]">{path}</code>
                        </span>
                      ))}
                      .
                    </p>
                  ) : null}
                </div>
                <a
                  href={previewUrl(scope)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary"
                >
                  Preview <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-900">
                <input
                  type="checkbox"
                  checked={maintenance[scope].enabled}
                  onChange={(e) => updateScope(scope, { enabled: e.target.checked })}
                />
                Enable maintenance for this scope
              </label>
              {scope === "provider_web" ? (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <label className="flex items-start gap-3 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={maintenance.provider_web.allow_partner_funnel !== false}
                      onChange={(e) => updateScope("provider_web", { allow_partner_funnel: e.target.checked })}
                    />
                    <span>
                      <span className="font-medium text-gray-900">Keep onboarding &amp; checkout available</span>
                      <span className="mt-1 block text-xs text-gray-600">
                        When unchecked, maintenance covers all of <code className="text-xs">/provider</code>, including
                        onboarding, embed, and subscription checkout (full provider-web outage).
                      </span>
                    </span>
                  </label>
                </div>
              ) : null}
              <CpField label="Title">
                <input
                  className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                  value={maintenance[scope].title}
                  onChange={(e) => updateScope(scope, { title: e.target.value })}
                  placeholder="We'll be back soon"
                />
              </CpField>
              <CpField label="Message">
                <textarea
                  className="min-h-[80px] w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                  value={maintenance[scope].message}
                  onChange={(e) => updateScope(scope, { message: e.target.value })}
                  placeholder="We're performing scheduled maintenance."
                />
              </CpField>
              <CpField label='CTA button label (optional, e.g. "Notify me when we are back")'>
                <input
                  className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                  value={maintenance[scope].cta_label ?? ""}
                  onChange={(e) => updateScope(scope, { cta_label: e.target.value || null })}
                  placeholder="Notify me"
                />
              </CpField>
              <div className="grid gap-3 sm:grid-cols-2">
                <CpField label="Countdown end (local)">
                  <input
                    type="datetime-local"
                    className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                    value={isoToDatetimeLocalValue(maintenance[scope].countdown_end_at)}
                    onChange={(e) => {
                      updateScope(scope, { countdown_end_at: datetimeLocalToIsoOrNull(e.target.value) });
                    }}
                  />
                </CpField>
                <CpField label='Countdown label (e.g. "Launching in")'>
                  <input
                    className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                    value={maintenance[scope].countdown_label ?? ""}
                    onChange={(e) => updateScope(scope, { countdown_label: e.target.value || null })}
                    placeholder="Launching in"
                  />
                </CpField>
              </div>
            </AdminPanel>
          ))}
          <button
            type="button"
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? "Saving…" : "Save all"}
          </button>
        </>
      )}
    </div>
  );
}

type SignUpRow = { id: string; email: string; scope: string; created_at: string };

export function CpMaintenanceSignupsPage() {
  const { denied } = useSuperadminPage("Control plane is superadmin-only.");
  const [scope, setScope] = useState("all");
  const [list, setList] = useState<SignUpRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let c = false;
    (async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ limit: "500" });
        if (scope !== "all") params.set("scope", scope);
        const data = await adminApi.getJson<SignUpRow[]>(`/api/admin/maintenance-notify?${params}`);
        if (!c) setList(Array.isArray(data) ? data : []);
      } catch {
        if (!c) setList([]);
      } finally {
        if (!c) setLoading(false);
      }
    })();
    return () => {
      c = true;
    };
  }, [scope]);

  const exportCsv = () => {
    const headers = ["email", "scope", "created_at"];
    const rows = list.map((r) => [r.email, r.scope, r.created_at].join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `maintenance-notify-${scope}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (denied) return denied;

  return (
    <div className="space-y-6">
      <CpBack to=".." label="Maintenance" />
      <AdminPageHeader title="Maintenance notify sign-ups" description="Emails from the maintenance CTA." />
      <div className="flex flex-wrap items-center gap-3">
        <select
          className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
          value={scope}
          onChange={(e) => setScope(e.target.value)}
        >
          <option value="all">All scopes</option>
          {MAINTENANCE_SCOPES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm"
          onClick={exportCsv}
        >
          Export CSV
        </button>
      </div>
      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <AdminPanel>
          <AdminDataTable>
            <AdminTableHead>
              <tr>
                <AdminTh>Email</AdminTh>
                <AdminTh>Scope</AdminTh>
                <AdminTh>Created</AdminTh>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {list.map((r) => (
                <tr key={r.id}>
                  <AdminTd>{r.email}</AdminTd>
                  <AdminTd>{r.scope}</AdminTd>
                  <AdminTd className="text-xs">{new Date(r.created_at).toLocaleString()}</AdminTd>
                </tr>
              ))}
            </AdminTableBody>
          </AdminDataTable>
        </AdminPanel>
      )}
    </div>
  );
}

export function CpAiUsagePage() {
  const { denied } = useSuperadminPage("Control plane is superadmin-only.");
  const [page, setPage] = useState(1);
  const [featureKey, setFeatureKey] = useState("");
  const [providerId, setProviderId] = useState("");
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<
    Array<{
      id: string;
      feature_key: string;
      model: string;
      tokens_in: number;
      tokens_out: number;
      cost_estimate: number;
      success: boolean;
      created_at: string;
    }>
  >([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState({ tokens_in: 0, tokens_out: 0, cost_estimate: 0 });

  useEffect(() => {
    let c = false;
    (async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: String(page), limit: "20" });
        if (featureKey) params.set("feature_key", featureKey);
        if (providerId) params.set("provider_id", providerId);
        const inner = await adminApi.getJson<{
          items: typeof items;
          total: number;
          summary: typeof summary;
        }>(`/api/admin/control-plane/modules/ai/usage?${params}`);
        if (c) return;
        setItems(inner?.items ?? []);
        setTotal(inner?.total ?? 0);
        setSummary(inner?.summary ?? { tokens_in: 0, tokens_out: 0, cost_estimate: 0 });
      } catch {
        if (!c) {
          setItems([]);
          setTotal(0);
        }
      } finally {
        if (!c) setLoading(false);
      }
    })();
    return () => {
      c = true;
    };
  }, [page, featureKey, providerId]);

  if (denied) return denied;

  return (
    <div className="space-y-6">
      <CpBack to=".." label="AI module" />
      <AdminPageHeader title="AI usage" description="Token usage and cost estimates." />
      <div className="flex flex-wrap gap-4">
        <CpField label="Feature key">
          <input
            className="w-64 rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
            value={featureKey}
            onChange={(e) => setFeatureKey(e.target.value)}
          />
        </CpField>
        <CpField label="Provider ID">
          <input
            className="w-64 rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
            value={providerId}
            onChange={(e) => setProviderId(e.target.value)}
          />
        </CpField>
      </div>
      <AdminPanel>
        <p className="text-sm text-gray-600">
          Summary: tokens in {summary.tokens_in} · out {summary.tokens_out} · est. cost{" "}
          {summary.cost_estimate.toFixed?.(4) ?? summary.cost_estimate} · total rows {total}
        </p>
      </AdminPanel>
      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <AdminPanel>
          <AdminDataTable>
            <AdminTableHead>
              <tr>
                <AdminTh>Feature</AdminTh>
                <AdminTh>Model</AdminTh>
                <AdminTh>Tokens</AdminTh>
                <AdminTh>OK</AdminTh>
                <AdminTh>When</AdminTh>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {items.map((r) => (
                <tr key={r.id}>
                  <AdminTd className="text-xs">{r.feature_key}</AdminTd>
                  <AdminTd className="text-xs">{r.model}</AdminTd>
                  <AdminTd className="text-xs">
                    {r.tokens_in}/{r.tokens_out}
                  </AdminTd>
                  <AdminTd>{r.success ? "yes" : "no"}</AdminTd>
                  <AdminTd className="text-xs">{new Date(r.created_at).toLocaleString()}</AdminTd>
                </tr>
              ))}
            </AdminTableBody>
          </AdminDataTable>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              className="rounded border border-gray-200 px-3 py-1 text-sm disabled:opacity-50"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </button>
            <button
              type="button"
              className="rounded border border-gray-200 px-3 py-1 text-sm disabled:opacity-50"
              disabled={items.length < 20}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </AdminPanel>
      )}
    </div>
  );
}

type EntRow = {
  id: string;
  plan_id: string;
  feature_key: string;
  enabled: boolean;
  calls_per_day: number;
  max_tokens: number;
  model_tier: string;
};

export function CpAiEntitlementsPage() {
  const { denied } = useSuperadminPage("Control plane is superadmin-only.");
  const [planIdFilter, setPlanIdFilter] = useState("");
  const [items, setItems] = useState<EntRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState({
    plan_id: "",
    feature_key: "",
    enabled: true,
    calls_per_day: 0,
    max_tokens: 600,
    model_tier: "cheap",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const url = planIdFilter
        ? `/api/admin/control-plane/modules/ai/entitlements?plan_id=${encodeURIComponent(planIdFilter)}`
        : "/api/admin/control-plane/modules/ai/entitlements";
      const data = await adminApi.getJson<EntRow[]>(url);
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [planIdFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!form.plan_id || !form.feature_key) {
      setMsg("Plan ID and feature key required");
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      await adminApi.postJson("/api/admin/control-plane/modules/ai/entitlements", form);
      setMsg("Saved.");
      setForm((p) => ({ ...p, feature_key: "" }));
      void load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (denied) return denied;

  return (
    <div className="space-y-6">
      <CpBack to=".." label="AI module" />
      <AdminPageHeader title="AI plan entitlements" description="Per-plan limits." />
      {msg ? (
        <AdminPanel>
          <p className="text-sm text-gray-700">{msg}</p>
        </AdminPanel>
      ) : null}
      <AdminPanel className="grid gap-3 md:grid-cols-2">
        <CpField label="Filter plan ID">
          <input
            className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
            value={planIdFilter}
            onChange={(e) => setPlanIdFilter(e.target.value)}
            placeholder="UUID or empty for all"
          />
        </CpField>
        <CpField label="Plan ID (upsert)">
          <input
            className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
            value={form.plan_id}
            onChange={(e) => setForm((p) => ({ ...p, plan_id: e.target.value }))}
          />
        </CpField>
        <CpField label="Feature key">
          <input
            className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
            value={form.feature_key}
            onChange={(e) => setForm((p) => ({ ...p, feature_key: e.target.value }))}
          />
        </CpField>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => setForm((p) => ({ ...p, enabled: e.target.checked }))}
          />
          Enabled
        </label>
        <CpField label="Calls / day">
          <input
            type="number"
            className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
            value={form.calls_per_day}
            onChange={(e) => setForm((p) => ({ ...p, calls_per_day: parseInt(e.target.value, 10) || 0 }))}
          />
        </CpField>
        <CpField label="Max tokens">
          <input
            type="number"
            className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
            value={form.max_tokens}
            onChange={(e) => setForm((p) => ({ ...p, max_tokens: parseInt(e.target.value, 10) || 0 }))}
          />
        </CpField>
        <CpField label="Model tier">
          <input
            className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
            value={form.model_tier}
            onChange={(e) => setForm((p) => ({ ...p, model_tier: e.target.value }))}
          />
        </CpField>
        <button
          type="button"
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50 md:col-span-2"
          disabled={saving}
          onClick={() => void save()}
        >
          {saving ? "Saving…" : "Upsert entitlement"}
        </button>
      </AdminPanel>
      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <AdminPanel>
          <AdminDataTable>
            <AdminTableHead>
              <tr>
                <AdminTh>Plan</AdminTh>
                <AdminTh>Feature</AdminTh>
                <AdminTh>Calls/d</AdminTh>
                <AdminTh>Tier</AdminTh>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {items.map((r) => (
                <tr key={r.id}>
                  <AdminTd className="font-mono text-xs">{r.plan_id.slice(0, 8)}…</AdminTd>
                  <AdminTd className="text-xs">{r.feature_key}</AdminTd>
                  <AdminTd>{r.calls_per_day}</AdminTd>
                  <AdminTd>{r.model_tier}</AdminTd>
                </tr>
              ))}
            </AdminTableBody>
          </AdminDataTable>
        </AdminPanel>
      )}
    </div>
  );
}

type ScoreRow = {
  provider_id: string;
  business_name: string | null;
  computed_score: number;
  updated_at: string;
};

const PAGE_SIZE = 50;

export function CpRankingScoresPage() {
  const { denied } = useSuperadminPage("Control plane is superadmin-only.");
  const [env, setEnv] = useState<string>("production");
  const [scores, setScores] = useState<ScoreRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [recomputing, setRecomputing] = useState<string | "all" | null>(null);

  const loadFirst = useCallback(async () => {
    setLoading(true);
    try {
      const inner = await adminApi.getJson<{ scores: ScoreRow[] }>(
        `/api/admin/ranking/scores?environment=${encodeURIComponent(env)}&limit=${PAGE_SIZE}&offset=0`
      );
      const list = inner?.scores ?? [];
      setScores(list);
      setHasMore(list.length >= PAGE_SIZE);
    } catch {
      setScores([]);
    } finally {
      setLoading(false);
    }
  }, [env]);

  useEffect(() => {
    void loadFirst();
  }, [loadFirst]);

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const inner = await adminApi.getJson<{ scores: ScoreRow[] }>(
        `/api/admin/ranking/scores?environment=${encodeURIComponent(env)}&limit=${PAGE_SIZE}&offset=${scores.length}`
      );
      const list = inner?.scores ?? [];
      setScores((prev) => [...prev, ...list]);
      setHasMore(list.length >= PAGE_SIZE);
    } catch {
      /* ignore */
    } finally {
      setLoadingMore(false);
    }
  };

  const recomputeAll = async () => {
    setRecomputing("all");
    try {
      await adminApi.postJson("/api/admin/ranking/recompute", { full: true, environment: env });
      void loadFirst();
    } finally {
      setRecomputing(null);
    }
  };

  const recomputeOne = async (providerId: string) => {
    setRecomputing(providerId);
    try {
      await adminApi.postJson("/api/admin/ranking/recompute", { provider_id: providerId, environment: env });
      void loadFirst();
    } finally {
      setRecomputing(null);
    }
  };

  if (denied) return denied;

  return (
    <div className="space-y-6">
      <CpBack to=".." label="Ranking module" />
      <AdminPageHeader title="Provider ranking scores" description="Computed discoverability scores." />
      <div className="flex flex-wrap items-center gap-4">
        <EnvSelect value={env} onChange={setEnv} />
        <button
          type="button"
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm disabled:opacity-50"
          disabled={recomputing === "all"}
          onClick={() => void recomputeAll()}
        >
          {recomputing === "all" ? "Recomputing…" : "Recompute all"}
        </button>
        <span className="text-xs text-gray-500">
          Recompute uses <strong>{env}</strong> config.
        </span>
      </div>
      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <AdminPanel>
          <AdminDataTable>
            <AdminTableHead>
              <tr>
                <AdminTh>Provider</AdminTh>
                <AdminTh>Score</AdminTh>
                <AdminTh>Updated</AdminTh>
                <AdminTh />
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {scores.map((r) => (
                <tr key={r.provider_id}>
                  <AdminTd>{r.business_name ?? r.provider_id.slice(0, 8)}</AdminTd>
                  <AdminTd>{r.computed_score.toFixed?.(4) ?? r.computed_score}</AdminTd>
                  <AdminTd className="text-xs">{new Date(r.updated_at).toLocaleString()}</AdminTd>
                  <AdminTd>
                    <button
                      type="button"
                      className="text-xs font-medium text-primary underline disabled:opacity-50"
                      disabled={recomputing === r.provider_id}
                      onClick={() => void recomputeOne(r.provider_id)}
                    >
                      Recompute
                    </button>
                  </AdminTd>
                </tr>
              ))}
            </AdminTableBody>
          </AdminDataTable>
          {hasMore ? (
            <button
              type="button"
              className="mt-4 text-sm font-medium text-primary underline disabled:opacity-50"
              disabled={loadingMore}
              onClick={() => void loadMore()}
            >
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          ) : null}
        </AdminPanel>
      )}
    </div>
  );
}

type TemplateRow = {
  id: string;
  key: string;
  version: number;
  enabled: boolean;
  template: string;
  system_instructions: string;
};

export function CpAiTemplatesPage() {
  const { denied } = useSuperadminPage("Control plane is superadmin-only.");
  const [items, setItems] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    key: "",
    version: 1,
    enabled: true,
    platform_scopes: "",
    role_scopes: "",
    template: "",
    system_instructions: "",
    output_schema: "{}",
  });

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi.getJson<TemplateRow[]>("/api/admin/control-plane/modules/ai/templates");
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTemplates();
  }, [fetchTemplates]);

  const create = async () => {
    if (!form.key.trim()) {
      setMsg("Key required");
      return;
    }
    setCreating(true);
    setMsg(null);
    try {
      const platform_scopes = form.platform_scopes
        ? form.platform_scopes.split(",").map((s) => s.trim()).filter(Boolean)
        : null;
      const role_scopes = form.role_scopes
        ? form.role_scopes.split(",").map((s) => s.trim()).filter(Boolean)
        : null;
      const output_schema = JSON.parse(form.output_schema || "{}") as Record<string, unknown>;
      await adminApi.postJson("/api/admin/control-plane/modules/ai/templates", {
        key: form.key.trim(),
        version: form.version,
        enabled: form.enabled,
        platform_scopes: platform_scopes?.length ? platform_scopes : null,
        role_scopes: role_scopes?.length ? role_scopes : null,
        template: form.template,
        system_instructions: form.system_instructions,
        output_schema,
      });
      setMsg("Created.");
      setForm({
        key: "",
        version: 1,
        enabled: true,
        platform_scopes: "",
        role_scopes: "",
        template: "",
        system_instructions: "",
        output_schema: "{}",
      });
      void fetchTemplates();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Create failed");
    } finally {
      setCreating(false);
    }
  };

  if (denied) return denied;

  return (
    <div className="space-y-6">
      <CpBack to=".." label="AI module" />
      <AdminPageHeader title="AI prompt templates" description="Create and list templates by key/version." />
      {msg ? (
        <AdminPanel>
          <p className="text-sm text-gray-700">{msg}</p>
        </AdminPanel>
      ) : null}
      <AdminPanel className="space-y-3">
        <h2 className="font-semibold text-gray-900">New template</h2>
        <div className="grid gap-2 md:grid-cols-2">
          <CpField label="Key">
            <input
              className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
              value={form.key}
              onChange={(e) => setForm((p) => ({ ...p, key: e.target.value }))}
            />
          </CpField>
          <CpField label="Version">
            <input
              type="number"
              className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
              value={form.version}
              onChange={(e) => setForm((p) => ({ ...p, version: parseInt(e.target.value, 10) || 1 }))}
            />
          </CpField>
          <CpField label="Platform scopes (comma)">
            <input
              className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
              value={form.platform_scopes}
              onChange={(e) => setForm((p) => ({ ...p, platform_scopes: e.target.value }))}
            />
          </CpField>
          <CpField label="Role scopes (comma)">
            <input
              className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
              value={form.role_scopes}
              onChange={(e) => setForm((p) => ({ ...p, role_scopes: e.target.value }))}
            />
          </CpField>
        </div>
        <CpField label="Template">
          <textarea
            className="min-h-[80px] w-full rounded-lg border border-gray-200 px-2 py-1.5 font-mono text-xs"
            value={form.template}
            onChange={(e) => setForm((p) => ({ ...p, template: e.target.value }))}
          />
        </CpField>
        <CpField label="System instructions">
          <textarea
            className="min-h-[60px] w-full rounded-lg border border-gray-200 px-2 py-1.5 font-mono text-xs"
            value={form.system_instructions}
            onChange={(e) => setForm((p) => ({ ...p, system_instructions: e.target.value }))}
          />
        </CpField>
        <CpField label="Output schema (JSON)">
          <textarea
            className="min-h-[60px] w-full rounded-lg border border-gray-200 px-2 py-1.5 font-mono text-xs"
            value={form.output_schema}
            onChange={(e) => setForm((p) => ({ ...p, output_schema: e.target.value }))}
          />
        </CpField>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => setForm((p) => ({ ...p, enabled: e.target.checked }))}
          />
          Enabled
        </label>
        <button
          type="button"
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50"
          disabled={creating}
          onClick={() => void create()}
        >
          {creating ? "Creating…" : "Create"}
        </button>
      </AdminPanel>
      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <AdminPanel>
          <ul className="space-y-3 text-sm">
            {items.map((t) => (
              <li key={t.id} className="border-b border-gray-100 pb-2">
                <span className="font-medium">
                  {t.key} v{t.version}
                </span>{" "}
                {t.enabled ? "" : "(disabled)"}
                <p className="mt-1 line-clamp-2 text-xs text-gray-500">{t.template}</p>
              </li>
            ))}
          </ul>
        </AdminPanel>
      )}
    </div>
  );
}
