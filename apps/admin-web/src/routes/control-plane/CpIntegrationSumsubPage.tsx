import { useEffect, useState } from "react";
import { adminApi } from "@/lib/adminClient";
import { useSuperadminPage } from "@/hooks/useSuperadminPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { CpBack, CpField, EnvSelect } from "./cpShared";

type VerificationMode = "off" | "manual" | "sumsub" | "both";

type FlagSnapshot = {
  id: string;
  feature_key: string;
  enabled: boolean;
};

const MODE_LABEL: Record<VerificationMode, string> = {
  off: "Off — verification unavailable",
  manual: "Manual only — admin reviews uploaded documents",
  sumsub: "Sumsub only — automated KYC (no manual fallback)",
  both: "Both — Sumsub primary, manual fallback",
};

function modeFromFlags(sumsub: boolean, manual: boolean): VerificationMode {
  if (sumsub && manual) return "both";
  if (sumsub) return "sumsub";
  if (manual) return "manual";
  return "off";
}

export function CpIntegrationSumsubPage() {
  const { allowed, denied } = useSuperadminPage("Control plane is superadmin-only.");
  const [env, setEnv] = useState("production");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [resolvedScope, setResolvedScope] = useState<{ scope: "global" | "tenant"; tenantId: string | null } | null>(null);
  const [form, setForm] = useState({
    enabled: false,
    level_name: "",
    app_token_secret: "",
    secret_key_secret: "",
    webhook_secret_secret: "",
  });
  const [secretsSet, setSecretsSet] = useState({ app_token: false, secret_key: false, webhook: false });

  // Verification policy flags (independent of Sumsub credentials/env)
  const [flags, setFlags] = useState<FlagSnapshot[]>([]);
  const [flagSaving, setFlagSaving] = useState(false);
  const [flagMsg, setFlagMsg] = useState<string | null>(null);

  const sumsubFlagOn = flags.find((f) => f.feature_key === "verification.sumsub.enabled")?.enabled ?? false;
  const manualFlagOn = flags.find((f) => f.feature_key === "verification.manual.enabled")?.enabled ?? true;
  const requiredProviders = flags.find((f) => f.feature_key === "provider_verification")?.enabled ?? false;
  const requiredPayouts = flags.find((f) => f.feature_key === "verification.sumsub.required_for_payouts")?.enabled ?? false;
  const currentMode = modeFromFlags(sumsubFlagOn, manualFlagOn);

  useEffect(() => {
    if (!allowed) return;
    let c = false;
    (async () => {
      setLoading(true);
      setMsg(null);
      try {
        const d = await adminApi.getJson<Record<string, unknown> | null>(
          `/api/admin/control-plane/integrations/sumsub?environment=${encodeURIComponent(env)}`
        );
        if (c || !d) return;
        setForm((p) => ({
          ...p,
          enabled: Boolean(d.enabled),
          level_name: String(d.level_name ?? ""),
        }));
        setSecretsSet({
          app_token: Boolean((d as { app_token_set?: boolean }).app_token_set),
          secret_key: Boolean((d as { secret_key_set?: boolean }).secret_key_set),
          webhook: Boolean((d as { webhook_secret_set?: boolean }).webhook_secret_set),
        });
        const ds = d as { _scope?: string; _tenant_id?: string | null };
        if (ds._scope === "global" || ds._scope === "tenant") {
          setResolvedScope({ scope: ds._scope, tenantId: ds._tenant_id ?? null });
        }
      } catch (e) {
        if (!c) setMsg(e instanceof Error ? e.message : "Load failed");
      } finally {
        if (!c) setLoading(false);
      }
    })();
    return () => {
      c = true;
    };
  }, [allowed, env]);

  useEffect(() => {
    if (!allowed) return;
    let c = false;
    (async () => {
      try {
        const res = await adminApi.getJson<{ data?: FlagSnapshot[] } | FlagSnapshot[]>("/api/admin/feature-flags");
        if (c) return;
        const rows: FlagSnapshot[] = (Array.isArray(res) ? res : (res as { data?: FlagSnapshot[] }).data) ?? [];
        const KEYS = ["verification.sumsub.enabled", "verification.manual.enabled", "provider_verification", "verification.sumsub.required_for_payouts"];
        setFlags(rows.filter((r) => KEYS.includes(r.feature_key)));
      } catch {
        // non-fatal — flags section stays hidden if load fails
      }
    })();
    return () => { c = true; };
  }, [allowed]);

  const saveFlags = async (updates: { feature_key: string; enabled: boolean }[]) => {
    setFlagSaving(true);
    setFlagMsg(null);
    try {
      for (const upd of updates) {
        const row = flags.find((f) => f.feature_key === upd.feature_key);
        if (row) {
          await adminApi.patchJson(`/api/admin/feature-flags/${row.id}`, { enabled: upd.enabled });
          setFlags((prev) => prev.map((f) => f.id === row.id ? { ...f, enabled: upd.enabled } : f));
        } else {
          // flag row doesn't exist yet — create it via POST
          const created = await adminApi.postJson<{ data?: FlagSnapshot }>("/api/admin/feature-flags", { feature_key: upd.feature_key, enabled: upd.enabled, feature_name: upd.feature_key, category: "control_plane" });
          const newRow = (created as { data?: FlagSnapshot }).data;
          if (newRow) setFlags((prev) => [...prev, newRow]);
        }
      }
      setFlagMsg("Saved.");
    } catch (e) {
      setFlagMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setFlagSaving(false);
    }
  };

  const applyMode = (mode: VerificationMode) => {
    const sumsub = mode === "sumsub" || mode === "both";
    const manual = mode === "manual" || mode === "both";
    void saveFlags([
      { feature_key: "verification.sumsub.enabled", enabled: sumsub },
      { feature_key: "verification.manual.enabled", enabled: manual },
    ]);
  };

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await adminApi.putJson("/api/admin/control-plane/integrations/sumsub", {
        environment: env,
        enabled: form.enabled,
        level_name: form.level_name || null,
        ...(form.app_token_secret ? { app_token_secret: form.app_token_secret } : {}),
        ...(form.secret_key_secret ? { secret_key_secret: form.secret_key_secret } : {}),
        ...(form.webhook_secret_secret ? { webhook_secret_secret: form.webhook_secret_secret } : {}),
      });
      setForm((p) => ({ ...p, app_token_secret: "", secret_key_secret: "", webhook_secret_secret: "" }));
      if (form.app_token_secret) setSecretsSet((s) => ({ ...s, app_token: true }));
      if (form.secret_key_secret) setSecretsSet((s) => ({ ...s, secret_key: true }));
      if (form.webhook_secret_secret) setSecretsSet((s) => ({ ...s, webhook: true }));
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
      <CpBack to=".." label="Integrations" />
      <AdminPageHeader title="Sumsub" description="KYC — credentials are not shown after save." />
      <EnvSelect value={env} onChange={setEnv} />
      <AdminPanel>
        <div className="space-y-2 text-sm text-gray-700">
          <p className="font-medium text-gray-900">Operational setup</p>
          <p>
            Register the Sumsub webhook URL{" "}
            <code className="rounded bg-gray-100 px-1 text-xs">/api/webhooks/sumsub</code> and send{" "}
            <code className="rounded bg-gray-100 px-1 text-xs">x-sumsub-env: {env}</code> when this is not production.
            Sumsub uses <code className="rounded bg-gray-100 px-1 text-xs">X-App-Token</code> plus HMAC signatures; keep
            app token, secret key, and webhook secret in sync with the selected environment.
          </p>
          <p>
            Mobile/web embeds also require{" "}
            <code className="rounded bg-gray-100 px-1 text-xs">SUMSUB_EMBED_REFRESH_SECRET</code> in the web app
            environment so token refresh works after the initial SDK token expires.
          </p>
        </div>
      </AdminPanel>
      {msg ? (
        <AdminPanel>
          <p className="text-sm text-gray-700">{msg}</p>
        </AdminPanel>
      ) : null}
      {!loading && resolvedScope ? (
        <div
          className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${
            resolvedScope.scope === "tenant"
              ? "border-indigo-200 bg-indigo-50 text-indigo-800"
              : "border-gray-200 bg-gray-50 text-gray-700"
          }`}
        >
          <span className="font-medium">
            {resolvedScope.scope === "tenant" ? "Tenant override" : "Global default"}
          </span>
          {resolvedScope.scope === "tenant" && resolvedScope.tenantId ? (
            <span className="font-mono text-xs text-indigo-600">{resolvedScope.tenantId}</span>
          ) : null}
          <span className="text-gray-400">
            {resolvedScope.scope === "tenant"
              ? "— editing the per-tenant override; the global default is not affected."
              : "— editing the global default; tenant-specific overrides take precedence for their tenants."}
          </span>
        </div>
      ) : null}
      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <AdminPanel className="space-y-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm((p) => ({ ...p, enabled: e.target.checked }))}
            />
            Enabled
          </label>
          <CpField label="Level name">
            <input
              className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
              value={form.level_name}
              onChange={(e) => setForm((p) => ({ ...p, level_name: e.target.value }))}
            />
          </CpField>
          <CpField label={`App token${secretsSet.app_token ? " (set)" : ""}`}>
            <input
              type="password"
              className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
              value={form.app_token_secret}
              onChange={(e) => setForm((p) => ({ ...p, app_token_secret: e.target.value }))}
            />
          </CpField>
          <CpField label={`Secret key${secretsSet.secret_key ? " (set)" : ""}`}>
            <input
              type="password"
              className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
              value={form.secret_key_secret}
              onChange={(e) => setForm((p) => ({ ...p, secret_key_secret: e.target.value }))}
            />
          </CpField>
          <CpField label={`Webhook secret${secretsSet.webhook ? " (set)" : ""}`}>
            <input
              type="password"
              className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
              value={form.webhook_secret_secret}
              onChange={(e) => setForm((p) => ({ ...p, webhook_secret_secret: e.target.value }))}
            />
          </CpField>
          <button
            type="button"
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </AdminPanel>
      )}

      {/* Verification mode card */}
      <AdminPageHeader title="Verification mode" description="Controls which verification paths are available to users and what providers are required to do." />
      {flagMsg ? (
        <AdminPanel>
          <p className="text-sm text-gray-700">{flagMsg}</p>
        </AdminPanel>
      ) : null}
      <AdminPanel className="space-y-4">
        <div>
          <p className="mb-2 text-sm font-medium text-gray-900">Mode</p>
          <div className="space-y-1.5">
            {(["both", "sumsub", "manual", "off"] as VerificationMode[]).map((mode) => (
              <label key={mode} className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="verification_mode"
                  value={mode}
                  checked={currentMode === mode}
                  onChange={() => applyMode(mode)}
                  disabled={flagSaving}
                />
                <span className={mode === "off" ? "text-red-600" : ""}>{MODE_LABEL[mode]}</span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-500">
            "Sumsub" paths require credentials configured above. Mode changes take effect immediately for API calls and on the next config-bundle refresh for mobile clients.
          </p>
        </div>
        <hr />
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-900">Provider requirements</p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={requiredProviders}
              disabled={flagSaving}
              onChange={(e) => void saveFlags([{ feature_key: "provider_verification", enabled: e.target.checked }])}
            />
            Require identity verification for providers to complete setup and go live
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={requiredPayouts}
              disabled={flagSaving}
              onChange={(e) => void saveFlags([{ feature_key: "verification.sumsub.required_for_payouts", enabled: e.target.checked }])}
            />
            Require approved identity verification before providers can request payouts
          </label>
        </div>
      </AdminPanel>
    </div>
  );
}
