import { useEffect, useState } from "react";
import { adminApi } from "@/lib/adminClient";
import { useSuperadminPage } from "@/hooks/useSuperadminPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { CpBack, CpField, EnvSelect } from "./cpShared";
import { Info } from "lucide-react";

interface WasenderForm {
  enabled: boolean;
  personal_access_token_secret: string;
  webhook_secret: string;
  base_url: string;
  bulk_pacing_ms: number;
  bulk_batch_size_limit: number;
  daily_send_limit_per_session: number;
  hourly_send_limit_per_session: number;
  max_concurrent_per_session: number;
  auto_pause_on_failure_count: number;
  cooldown_minutes_after_pause: number;
}

const DEFAULTS: WasenderForm = {
  enabled: false,
  personal_access_token_secret: "",
  webhook_secret: "",
  base_url: "https://app.wasenderapi.com",
  bulk_pacing_ms: 5000,
  bulk_batch_size_limit: 50,
  daily_send_limit_per_session: 200,
  hourly_send_limit_per_session: 30,
  max_concurrent_per_session: 1,
  auto_pause_on_failure_count: 3,
  cooldown_minutes_after_pause: 30,
};

export function CpIntegrationWasenderPage() {
  const { allowed, denied } = useSuperadminPage("Control plane is superadmin-only.");
  const [env, setEnv] = useState("production");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [form, setForm] = useState<WasenderForm>(DEFAULTS);
  const [secretsSet, setSecretsSet] = useState({ pat: false, webhook: false });

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setMsg(null);
      try {
        const d = await adminApi.getJson<Record<string, unknown> | null>(
          `/api/admin/integrations/wasender?environment=${encodeURIComponent(env)}`,
        );
        if (cancelled || !d) {
          if (!cancelled) setLoading(false);
          return;
        }
        setForm({
          enabled: Boolean(d.enabled),
          personal_access_token_secret: "",
          webhook_secret: "",
          base_url: String(d.base_url ?? DEFAULTS.base_url),
          bulk_pacing_ms: Number(d.bulk_pacing_ms) || DEFAULTS.bulk_pacing_ms,
          bulk_batch_size_limit: Number(d.bulk_batch_size_limit) || DEFAULTS.bulk_batch_size_limit,
          daily_send_limit_per_session: Number(d.daily_send_limit_per_session) || DEFAULTS.daily_send_limit_per_session,
          hourly_send_limit_per_session: Number(d.hourly_send_limit_per_session) || DEFAULTS.hourly_send_limit_per_session,
          max_concurrent_per_session: Number(d.max_concurrent_per_session) || DEFAULTS.max_concurrent_per_session,
          auto_pause_on_failure_count: Number(d.auto_pause_on_failure_count) || DEFAULTS.auto_pause_on_failure_count,
          cooldown_minutes_after_pause: Number(d.cooldown_minutes_after_pause) || DEFAULTS.cooldown_minutes_after_pause,
        });
        setSecretsSet({
          pat: Boolean(d.pat_set),
          webhook: Boolean(d.webhook_secret_set),
        });
      } catch (e) {
        if (!cancelled) setMsg({ text: e instanceof Error ? e.message : "Load failed", type: "error" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [allowed, env]);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await adminApi.putJson("/api/admin/integrations/wasender", {
        environment: env,
        enabled: form.enabled,
        base_url: form.base_url,
        bulk_pacing_ms: form.bulk_pacing_ms,
        bulk_batch_size_limit: form.bulk_batch_size_limit,
        daily_send_limit_per_session: form.daily_send_limit_per_session,
        hourly_send_limit_per_session: form.hourly_send_limit_per_session,
        max_concurrent_per_session: form.max_concurrent_per_session,
        auto_pause_on_failure_count: form.auto_pause_on_failure_count,
        cooldown_minutes_after_pause: form.cooldown_minutes_after_pause,
        ...(form.personal_access_token_secret ? { personal_access_token_secret: form.personal_access_token_secret } : {}),
        ...(form.webhook_secret ? { webhook_secret: form.webhook_secret } : {}),
      });
      setForm((p) => ({ ...p, personal_access_token_secret: "", webhook_secret: "" }));
      if (form.personal_access_token_secret) setSecretsSet((s) => ({ ...s, pat: true }));
      if (form.webhook_secret) setSecretsSet((s) => ({ ...s, webhook: true }));
      setMsg({ text: "Saved.", type: "success" });
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Save failed", type: "error" });
    } finally {
      setSaving(false);
    }
  };

  if (denied) return denied;

  const f = (field: keyof WasenderForm) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.type === "number" ? Number(e.target.value) : e.target.value;
    setForm((p) => ({ ...p, [field]: val }));
  };

  return (
    <div className="space-y-6">
      <CpBack to=".." label="Integrations" />
      <AdminPageHeader
        title="WhatsApp (Wasender)"
        description="WhatsApp messaging for lead outreach via WasenderAPI. Secrets are not shown after save."
      />
      <EnvSelect value={env} onChange={setEnv} />

      {msg && (
        <AdminPanel className={msg.type === "error" ? "!border-red-200 !bg-red-50" : "!border-green-200 !bg-green-50"}>
          <p className={`text-sm ${msg.type === "error" ? "text-red-700" : "text-green-700"}`}>{msg.text}</p>
        </AdminPanel>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <>
          {/* Connection */}
          <AdminPanel className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">Connection</h3>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => setForm((p) => ({ ...p, enabled: e.target.checked }))}
              />
              Enabled
            </label>
            <CpField label={`Personal Access Token${secretsSet.pat ? " (set)" : ""}`}>
              <input
                type="password"
                className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                placeholder={secretsSet.pat ? "••••••" : "Enter PAT from WasenderAPI"}
                value={form.personal_access_token_secret}
                onChange={f("personal_access_token_secret")}
              />
            </CpField>
            <CpField label={`Webhook Secret${secretsSet.webhook ? " (set)" : ""}`}>
              <input
                type="password"
                className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                placeholder={secretsSet.webhook ? "••••••" : "Enter webhook secret"}
                value={form.webhook_secret}
                onChange={f("webhook_secret")}
              />
            </CpField>
            <CpField label="Base URL">
              <input
                className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                value={form.base_url}
                onChange={f("base_url")}
              />
            </CpField>
          </AdminPanel>

          {/* Rate Limits & Safety */}
          <AdminPanel className="space-y-4 !border-amber-200 !bg-amber-50/30">
            <h3 className="text-sm font-semibold text-gray-900">Rate Limits & Safety</h3>
            <p className="text-xs text-gray-500">
              Conservative defaults protect against WhatsApp blocks. Increase cautiously.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <CpField label="Bulk pacing (ms between messages)">
                <input type="number" min={3000} className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm" value={form.bulk_pacing_ms} onChange={f("bulk_pacing_ms")} />
                <p className="text-xs text-gray-400">Min 3000ms. 5000ms recommended.</p>
              </CpField>
              <CpField label="Max batch size">
                <input type="number" min={1} max={100} className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm" value={form.bulk_batch_size_limit} onChange={f("bulk_batch_size_limit")} />
                <p className="text-xs text-gray-400">Max leads per single bulk send. Hard max: 100.</p>
              </CpField>
              <CpField label="Daily send limit per session">
                <input type="number" min={50} max={500} className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm" value={form.daily_send_limit_per_session} onChange={f("daily_send_limit_per_session")} />
                <p className="text-xs text-gray-400">Max messages per day per WhatsApp session. 50–500.</p>
              </CpField>
              <CpField label="Hourly send limit per session">
                <input type="number" min={10} max={60} className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm" value={form.hourly_send_limit_per_session} onChange={f("hourly_send_limit_per_session")} />
                <p className="text-xs text-gray-400">Max messages per hour per session. 10–60.</p>
              </CpField>
              <CpField label="Auto-pause failure threshold">
                <input type="number" min={1} max={20} className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm" value={form.auto_pause_on_failure_count} onChange={f("auto_pause_on_failure_count")} />
                <p className="text-xs text-gray-400">Pause session after this many consecutive failures.</p>
              </CpField>
              <CpField label="Cooldown after pause (min)">
                <input type="number" min={5} max={1440} className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm" value={form.cooldown_minutes_after_pause} onChange={f("cooldown_minutes_after_pause")} />
                <p className="text-xs text-gray-400">Minutes before a paused session can resume.</p>
              </CpField>
            </div>
          </AdminPanel>

          {/* Info callout */}
          <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
            <p className="text-sm text-blue-800">
              These conservative defaults are designed to keep your WhatsApp number safe.
              WhatsApp aggressively bans accounts that exhibit bot-like sending patterns.
              Only increase limits if you have a well-established number with a track record.
            </p>
          </div>

          <button
            type="button"
            className="rounded-lg bg-gray-900 px-6 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? "Saving…" : "Save Configuration"}
          </button>
        </>
      )}
    </div>
  );
}
