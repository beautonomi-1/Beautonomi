import { useEffect, useState } from "react";
import { adminApi } from "@/lib/adminClient";
import { useSuperadminPage } from "@/hooks/useSuperadminPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { CpBack, CpField, EnvSelect } from "./cpShared";

export function CpIntegrationSumsubPage() {
  const { allowed, denied } = useSuperadminPage("Control plane is superadmin-only.");
  const [env, setEnv] = useState("production");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState({
    enabled: false,
    level_name: "",
    app_token_secret: "",
    secret_key_secret: "",
    webhook_secret_secret: "",
  });
  const [secretsSet, setSecretsSet] = useState({ app_token: false, secret_key: false, webhook: false });

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
      {msg ? (
        <AdminPanel>
          <p className="text-sm text-gray-700">{msg}</p>
        </AdminPanel>
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
    </div>
  );
}
