/**
 * Control-plane → Integrations → Didit
 *
 * Replaces CpIntegrationSumsubPage.  Shows:
 *   1. Env health (API key set y/n, workflow ID, webhook URL, last received)
 *   2. Effective verification mode per tenant
 *   3. All verification feature-flag toggles with live policy preview
 *   4. "Send test webhook / reprocess" affordance
 */
import { useEffect, useState } from "react";
import { adminApi } from "@/lib/adminClient";
import { useSuperadminPage } from "@/hooks/useSuperadminPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { CpBack, CpField, EnvSelect } from "./cpShared";

type VerificationMode = "off" | "manual" | "didit" | "both";

type FlagSnapshot = {
  id: string;
  feature_key: string;
  enabled: boolean;
  tenant_id?: string | null;
  metadata?: Record<string, unknown>;
};

function isGlobalFlag(flag: FlagSnapshot): boolean {
  return flag.tenant_id == null;
}

type DiditHealthData = {
  api_key_set: boolean;
  workflow_id_set: boolean;
  workflow_id_source?: "env" | "default";
  effective_workflow_id?: string;
  default_workflow_id?: string;
  kyb_workflow_id_set?: boolean;
  effective_kyb_workflow_id?: string | null;
  kyb_env_complete?: boolean;
  webhook_secret_set: boolean;
  missing_env_vars?: string[];
  base_url: string;
  environment: string;
  env_complete: boolean;
  webhook_url: string | null;
  webhook_url_uses_www?: boolean;
  webhook_url_may_redirect?: boolean;
  recommended_webhook_url?: string;
  last_webhook_received_at: string | null;
};

const MODE_LABEL: Record<VerificationMode, string> = {
  off:    "Off — verification unavailable",
  manual: "Manual only — admin reviews uploaded documents",
  didit:  "Didit only — automated KYC (no manual fallback)",
  both:   "Both — Didit primary, manual fallback",
};

const VERIFICATION_FLAGS = [
  {
    key: "verification.didit.enabled",
    feature_name: "Didit identity verification",
    category: "control_plane",
    label: "Didit identity verification (master switch)",
    description: "Master switch. Availability = this flag AND DIDIT_API_KEY + DIDIT_WEBHOOK_SECRET env vars present.",
  },
  {
    key: "verification.manual.enabled",
    feature_name: "Manual verification",
    category: "control_plane",
    label: "Manual document upload",
    description: "Allows users to upload ID documents for admin review.",
  },
  {
    key: "provider_verification",
    feature_name: "Provider Verification",
    category: "provider",
    label: "Required for provider setup/go-live",
    description: "When on, providers must verify before going live. Auto-approve blocked for unverified providers.",
  },
  {
    key: "verification.didit.required_for_payouts",
    feature_name: "Identity required for payouts",
    category: "control_plane",
    label: "Required for payouts",
    description: "When on, POST /api/provider/payouts is blocked until provider has approved identity verification.",
  },
  {
    key: "verification.required_for_customers",
    feature_name: "Customer first-booking verification",
    category: "control_plane",
    label: "Required for first customer booking",
    description: "When on, a customer must verify identity before their first booking.",
  },
  {
    key: "verification.didit.cross_validate",
    feature_name: "Didit cross-validation",
    category: "control_plane",
    label: "Cross-validation (name/DOB check)",
    description: "Pass confirm-legal-details form values as expected_details to Didit. Mismatch routes to pending_review.",
  },
  {
    key: "verification.dedupe",
    feature_name: "Duplicate identity detection",
    category: "control_plane",
    label: "Duplicate identity detection",
    description: "Detect when the same verified identity is already approved on another account (fraud flag).",
  },
  {
    key: "verification.didit.kyb.enabled",
    feature_name: "Didit KYB",
    category: "control_plane",
    label: "Didit business verification (KYB)",
    description: "When on with Didit KYC, registered business providers can verify their company. Requires DIDIT_KYB_WORKFLOW_ID.",
  },
  {
    key: "verification.didit.kyb.required_for_business",
    feature_name: "KYB required for businesses",
    category: "control_plane",
    label: "KYB required for registered businesses",
    description: "When on, registered business providers must complete KYB (in addition to identity) for go-live and payouts.",
  },
] as const;

function getVerificationFlagDef(key: string) {
  return VERIFICATION_FLAGS.find((f) => f.key === key);
}

export function CpIntegrationDiditPage() {
  const { allowed, denied } = useSuperadminPage("Control plane is superadmin-only.");
  const [_env, setEnv] = useState("production");
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<DiditHealthData | null>(null);
  const [flags, setFlags] = useState<FlagSnapshot[]>([]);
  const [flagSaving, setFlagSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message?: string;
    status?: number;
    webhook_url?: string;
    response_body?: string | null;
  } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!allowed) return;
    void loadAll();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed]);

  async function loadAll() {
    setLoading(true);
    try {
      const [healthData, allFlags] = await Promise.all([
        adminApi.getJson<DiditHealthData>("/api/admin/control-plane/integrations/didit"),
        adminApi.getJson<FlagSnapshot[]>("/api/admin/feature-flags"),
      ]);
      if (healthData) setHealth(healthData);
      const flagList = Array.isArray(allFlags) ? allFlags : [];
      setFlags(
        flagList.filter(
          (f) => isGlobalFlag(f) && VERIFICATION_FLAGS.some((vf) => vf.key === f.feature_key),
        ),
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed to load configuration");
    } finally {
      setLoading(false);
    }
  }

  function getFlag(key: string): boolean {
    return flags.find(f => f.feature_key === key)?.enabled ?? false;
  }

  async function toggleFlag(key: string, value: boolean) {
    setFlagSaving(true);
    try {
      const def = getVerificationFlagDef(key);
      if (!def) throw new Error(`Unknown verification flag: ${key}`);

      const flag = flags.find((f) => f.feature_key === key);
      if (flag?.id && !flag.id.startsWith("new-")) {
        await adminApi.patchJson(`/api/admin/feature-flags/${flag.id}`, { enabled: value });
        setFlags((prev) =>
          prev.map((f) => (f.feature_key === key ? { ...f, enabled: value } : f)),
        );
      } else {
        const saved = await adminApi.postJson<FlagSnapshot>("/api/admin/feature-flags", {
          feature_key: key,
          feature_name: def.feature_name,
          description: def.description,
          enabled: value,
          category: def.category,
        });
        setFlags((prev) => {
          const without = prev.filter((f) => f.feature_key !== key);
          return [...without, { ...saved, feature_key: key, enabled: value }];
        });
      }
      setMsg(`Saved: ${key} = ${value}`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed to save flag");
    } finally {
      setFlagSaving(false);
    }
  }

  async function sendTestWebhook() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await adminApi.postJson<{
        ok: boolean;
        message?: string;
        status?: number;
        webhook_url?: string;
        response_body?: string | null;
      }>(
        "/api/admin/control-plane/integrations/didit/test",
        {},
      );
      setTestResult(res ?? { ok: false, message: "No response" });
    } catch (e) {
      setTestResult({ ok: false, message: e instanceof Error ? e.message : "Error" });
    } finally {
      setTesting(false);
    }
  }

  // Compute effective mode from flags + full env readiness (matches diditEnvPresent())
  const diditEnabled = getFlag("verification.didit.enabled") && Boolean(health?.env_complete);
  const manualEnabled = getFlag("verification.manual.enabled");
  const kybFlagOn = getFlag("verification.didit.kyb.enabled");
  const kybRequired = getFlag("verification.didit.kyb.required_for_business");
  const kybEnabled = diditEnabled && kybFlagOn && Boolean(health?.kyb_env_complete);
  const effectiveMode: VerificationMode = diditEnabled && manualEnabled ? "both" : diditEnabled ? "didit" : manualEnabled ? "manual" : "off";

  const providerModePreview = !diditEnabled
    ? "Verification off (Didit unavailable or disabled)"
    : !kybEnabled
      ? "Providers: identity verification only (KYC)"
      : kybRequired
        ? "Individual providers: KYC · Registered businesses: KYC + KYB required"
        : "Individual providers: KYC · Registered businesses: KYC + optional KYB";

  if (denied) return null;

  return (
    <div className="space-y-6">
      <CpBack />
      <AdminPageHeader
        title="Didit Identity Verification"
        description="Configure Didit KYC, manage verification flags, and monitor webhook health."
      />
      <EnvSelect value={_env} onChange={setEnv} />

      {msg && (
        <div className="rounded-md bg-blue-50 border border-blue-200 px-4 py-2 text-sm text-blue-800">
          {msg}
          <button className="ml-2 text-blue-600 underline" onClick={() => setMsg(null)}>dismiss</button>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
      ) : (
        <>
          {/* Environment health */}
          <AdminPanel>
            <div className="mb-4">
              <h3 className="text-base font-semibold text-gray-900">Environment health</h3>
              <p className="text-sm text-muted-foreground">Server-side Didit configuration (env vars, never secrets).</p>
            </div>
            <div className="grid gap-3">
              <CpField label="DIDIT_API_KEY">
                <span className={health?.api_key_set ? "text-green-700" : "text-red-600"}>
                  {health?.api_key_set ? "✓ Set" : "✗ Not set — Didit unavailable"}
                </span>
              </CpField>
              <CpField label="DIDIT_WORKFLOW_ID">
                <span className={health?.workflow_id_set ? "text-green-700" : "text-amber-600"}>
                  {health?.workflow_id_set
                    ? "✓ Set (env override)"
                    : `Using default — ${health?.effective_workflow_id ?? "Free KYC"}`}
                </span>
              </CpField>
              <CpField label="DIDIT_KYB_WORKFLOW_ID">
                <span className={health?.kyb_workflow_id_set ? "text-green-700" : "text-amber-600"}>
                  {health?.kyb_workflow_id_set
                    ? "✓ Set (env)"
                    : "Not set — KYB unavailable until configured"}
                </span>
                {health?.effective_kyb_workflow_id && (
                  <p className="mt-1 text-xs font-mono break-all text-muted-foreground">
                    {health.effective_kyb_workflow_id}
                  </p>
                )}
              </CpField>
              <CpField label="Effective KYC workflow">
                <span className="text-sm font-mono break-all">{health?.effective_workflow_id ?? "—"}</span>
              </CpField>
              <CpField label="DIDIT_WEBHOOK_SECRET">
                <span className={health?.webhook_secret_set ? "text-green-700" : "text-amber-600"}>
                  {health?.webhook_secret_set ? "✓ Set" : "✗ Not set"}
                </span>
                <p className="mt-1 text-xs text-muted-foreground">
                  Must match the destination <code className="font-mono">secret_shared_key</code> from Didit Business Console → API &amp; Webhooks (not the API key). Each webhook destination has its own secret.
                </p>
              </CpField>
              <CpField label="Base URL">
                <span className="text-sm font-mono">{health?.base_url ?? "—"}</span>
              </CpField>
              <CpField label="Environment">
                <span className="text-sm">{health?.environment ?? "—"}</span>
              </CpField>
              <CpField label="Webhook URL">
                <span className="text-sm font-mono break-all">{health?.webhook_url ?? "—"}</span>
                {health?.webhook_url_may_redirect && (
                  <p className="mt-1 text-xs text-amber-700">
                    ⚠ Set NEXT_PUBLIC_APP_URL to {health?.recommended_webhook_url?.replace("/api/webhooks/didit", "") ?? "https://www.beautonomi.com"} — non-www URLs redirect and Didit webhooks do not follow redirects.
                  </p>
                )}
              </CpField>
              <CpField label="Last webhook received">
                <span className="text-sm">{health?.last_webhook_received_at ?? "Never"}</span>
                {health?.last_webhook_received_at == null && (
                  <p className="mt-1 text-xs text-amber-700">
                    If Didit deliveries show 401, the webhook secret is wrong or signature headers were stripped. Fix the secret, allowlist Didit IP <code className="font-mono">18.203.201.92</code> in Cloudflare/WAF, then use Reprocess on Verification Sessions for stuck approvals.
                  </p>
                )}
              </CpField>
            </div>
          </AdminPanel>

          {/* Effective mode */}
          <AdminPanel>
            <div className="mb-3">
              <h3 className="text-base font-semibold text-gray-900">Effective verification mode</h3>
              <p className="text-sm text-muted-foreground">Derived from flags + env var availability.</p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                effectiveMode === "both" || effectiveMode === "didit"
                  ? "bg-green-100 text-green-800"
                  : effectiveMode === "manual"
                    ? "bg-yellow-100 text-yellow-800"
                    : "bg-red-100 text-red-800"
              }`}>
                {effectiveMode.toUpperCase()}
              </span>
              <span className="text-sm text-muted-foreground">{MODE_LABEL[effectiveMode]}</span>
            </div>
            <p className="mt-3 text-sm text-gray-700">{providerModePreview}</p>
            {!health?.env_complete && (
              <p className="mt-2 text-sm text-amber-700">
                ⚠ Missing: {(health?.missing_env_vars?.length ? health.missing_env_vars.join(", ") : "DIDIT_API_KEY or DIDIT_WEBHOOK_SECRET")} — Didit will not be available even if the flag is on.
              </p>
            )}
          </AdminPanel>

          {/* Feature flags */}
          <AdminPanel>
            <div className="mb-4">
              <h3 className="text-base font-semibold text-gray-900">Verification flags</h3>
              <p className="text-sm text-muted-foreground">Changes apply immediately to all clients and gates.</p>
            </div>
            <div className="space-y-4">
              {VERIFICATION_FLAGS.map(vf => (
                <div key={vf.key} className="flex items-start justify-between gap-4 py-2 border-b last:border-0">
                  <div>
                    <p className="text-sm font-medium">{vf.label}</p>
                    <p className="text-xs text-muted-foreground">{vf.description}</p>
                    <p className="text-xs text-gray-400 mt-0.5 font-mono">{vf.key}</p>
                  </div>
                  <button
                    onClick={() => void toggleFlag(vf.key, !getFlag(vf.key))}
                    disabled={flagSaving}
                    className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
                      getFlag(vf.key)
                        ? "bg-green-100 text-green-800 hover:bg-green-200"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                    aria-label={`Toggle ${vf.label}`}
                  >
                    {getFlag(vf.key) ? "ON" : "OFF"}
                  </button>
                </div>
              ))}
            </div>
          </AdminPanel>

          {/* Test webhook */}
          <AdminPanel>
            <div className="mb-4">
              <h3 className="text-base font-semibold text-gray-900">Test webhook</h3>
              <p className="text-sm text-muted-foreground">
                Sends a signed test POST to your public webhook URL. Requires <code className="font-mono">NEXT_PUBLIC_APP_URL</code>, <code className="font-mono">DIDIT_WEBHOOK_SECRET</code>, and a reachable <code className="font-mono">https://www.beautonomi.com/api/webhooks/didit</code> endpoint (no redirects).
              </p>
            </div>
            <div className="space-y-3">
              <button
                onClick={sendTestWebhook}
                disabled={testing || !health?.webhook_secret_set}
                className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {testing ? "Sending…" : "Send test webhook"}
              </button>
              {!health?.webhook_secret_set && (
                <p className="text-sm text-amber-600">DIDIT_WEBHOOK_SECRET not set — cannot test.</p>
              )}
              {testResult && (
                <div className={`rounded-md px-3 py-2 text-sm ${testResult.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
                  {testResult.ok ? "✓ Test webhook sent and accepted" : `✗ ${testResult.message}`}
                  {"status" in testResult && testResult.status != null && testResult.status > 0 && (
                    <div className="mt-1 text-xs opacity-80">HTTP {testResult.status}</div>
                  )}
                  {"webhook_url" in testResult && testResult.webhook_url && (
                    <div className="mt-1 text-xs font-mono break-all opacity-80">{testResult.webhook_url}</div>
                  )}
                  {"response_body" in testResult && testResult.response_body && (
                    <div className="mt-1 text-xs font-mono break-all opacity-80">{testResult.response_body.slice(0, 300)}</div>
                  )}
                </div>
              )}
            </div>
          </AdminPanel>
        </>
      )}
    </div>
  );
}
