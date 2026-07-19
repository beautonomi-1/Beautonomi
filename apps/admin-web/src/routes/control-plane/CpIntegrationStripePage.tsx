/**
 * Control-plane → Integrations → Stripe
 *
 * Shows:
 *   1. Env health (secret key / webhook secret resolvable, webhook URL, Connect support)
 *   2. Live connectivity test (accounts.retrieve)
 *
 * Mirrors the Didit control-plane page pattern.
 */
import { useEffect, useState } from "react";
import { adminApi } from "@/lib/adminClient";
import { useSuperadminPage } from "@/hooks/useSuperadminPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { CpBack, CpField, EnvSelect } from "./cpShared";

type StripeHealthData = {
  secret_key_set: boolean;
  webhook_secret_set: boolean;
  missing_env_vars?: string[];
  webhook_url: string | null;
  connect_supported: boolean;
  env_complete: boolean;
};

type StripeTestResult = {
  ok: boolean;
  account_id?: string;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  message?: string;
};

export function CpIntegrationStripePage() {
  const { allowed, denied } = useSuperadminPage("Control plane is superadmin-only.");
  const [_env, setEnv] = useState("production");
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<StripeHealthData | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<StripeTestResult | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!allowed) return;
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed]);

  async function loadAll() {
    setLoading(true);
    try {
      const data = await adminApi.getJson<StripeHealthData>(
        "/api/admin/control-plane/integrations/stripe",
      );
      if (data) setHealth(data);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed to load Stripe status");
    } finally {
      setLoading(false);
    }
  }

  async function runTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await adminApi.postJson<StripeTestResult>(
        "/api/admin/control-plane/integrations/stripe/test",
        {},
      );
      setTestResult(res ?? { ok: false, message: "No response" });
    } catch (e) {
      setTestResult({ ok: false, message: e instanceof Error ? e.message : "Error" });
    } finally {
      setTesting(false);
    }
  }

  if (denied) return null;

  return (
    <div className="space-y-6">
      <CpBack />
      <AdminPageHeader
        title="Stripe Payments"
        description="Configure Stripe for non-Paystack markets: secret keys, webhook, and Connect payouts."
      />
      <EnvSelect value={_env} onChange={setEnv} />

      {msg && (
        <div className="rounded-md bg-blue-50 border border-blue-200 px-4 py-2 text-sm text-blue-800">
          {msg}
          <button className="ml-2 text-blue-600 underline" onClick={() => setMsg(null)}>
            dismiss
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
      ) : (
        <>
          <AdminPanel>
            <div className="mb-4">
              <h3 className="text-base font-semibold text-gray-900">Environment health</h3>
              <p className="text-sm text-muted-foreground">
                Server-side Stripe configuration. Secrets resolve from region_secrets → tenant_secrets
                → platform_secrets → env (never shown here).
              </p>
            </div>
            <div className="grid gap-3">
              <CpField label="Secret key">
                <span className={health?.secret_key_set ? "text-green-700" : "text-red-600"}>
                  {health?.secret_key_set ? "✓ Resolvable" : "✗ Not set — Stripe unavailable"}
                </span>
              </CpField>
              <CpField label="Webhook secret">
                <span className={health?.webhook_secret_set ? "text-green-700" : "text-amber-600"}>
                  {health?.webhook_secret_set ? "✓ Resolvable" : "✗ Not set — webhooks will 401"}
                </span>
              </CpField>
              <CpField label="Webhook URL">
                <span className="text-sm font-mono break-all">{health?.webhook_url ?? "—"}</span>
                <p className="mt-1 text-xs text-muted-foreground">
                  Register this endpoint in Stripe Dashboard → Developers → Webhooks. Subscribe to{" "}
                  <code className="font-mono">payment_intent.succeeded</code>,{" "}
                  <code className="font-mono">charge.refunded</code>, and dispute events.
                </p>
              </CpField>
              <CpField label="Connect payouts">
                <span className={health?.connect_supported ? "text-green-700" : "text-amber-600"}>
                  {health?.connect_supported ? "✓ Supported (Express destination charges)" : "Unavailable"}
                </span>
              </CpField>
              <CpField label="Overall">
                <span
                  className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                    health?.env_complete ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                  }`}
                >
                  {health?.env_complete ? "READY" : "NOT READY"}
                </span>
                {health?.missing_env_vars?.length ? (
                  <p className="mt-2 text-sm text-amber-700">
                    Missing: {health.missing_env_vars.join(", ")}
                  </p>
                ) : null}
              </CpField>
            </div>
          </AdminPanel>

          <AdminPanel>
            <div className="mb-4">
              <h3 className="text-base font-semibold text-gray-900">Connectivity test</h3>
              <p className="text-sm text-muted-foreground">
                Calls <code className="font-mono">accounts.retrieve</code> with the resolved secret key to
                confirm credentials and account capabilities.
              </p>
            </div>
            <div className="space-y-3">
              <button
                onClick={runTest}
                disabled={testing || !health?.secret_key_set}
                className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {testing ? "Testing…" : "Run connectivity test"}
              </button>
              {!health?.secret_key_set && (
                <p className="text-sm text-amber-600">Secret key not resolvable — cannot test.</p>
              )}
              {testResult && (
                <div
                  className={`rounded-md px-3 py-2 text-sm ${
                    testResult.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
                  }`}
                >
                  {testResult.ok ? (
                    <>
                      <div>✓ Connected to Stripe</div>
                      <div className="mt-1 text-xs font-mono break-all opacity-80">
                        {testResult.account_id}
                      </div>
                      <div className="mt-1 text-xs opacity-80">
                        charges_enabled={String(testResult.charges_enabled)} · payouts_enabled=
                        {String(testResult.payouts_enabled)}
                      </div>
                    </>
                  ) : (
                    <>✗ {testResult.message}</>
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
