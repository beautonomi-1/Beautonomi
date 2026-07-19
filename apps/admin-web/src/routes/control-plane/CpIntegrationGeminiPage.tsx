import { useEffect, useState } from "react";
import { adminApi } from "@/lib/adminClient";
import { useSuperadminPage } from "@/hooks/useSuperadminPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { CpBack, CpField, EnvSelect } from "./cpShared";

export function CpIntegrationGeminiPage() {
  const { allowed, denied } = useSuperadminPage("Control plane is superadmin-only.");
  const [env, setEnv] = useState("production");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState({
    enabled: false,
    api_key_secret: "",
    default_model: "gemini-2.5-flash-lite",
    allowed_models: '["gemini-2.5-flash-lite","gemini-2.5-flash","gemini-2.5-pro"]',
    safety_settings: "{}",
  });
  const [apiKeySet, setApiKeySet] = useState(false);

  useEffect(() => {
    if (!allowed) return;
    let c = false;
    (async () => {
      setLoading(true);
      setMsg(null);
      try {
        const d = await adminApi.getJson<Record<string, unknown> | null>(
          `/api/admin/control-plane/integrations/gemini?environment=${encodeURIComponent(env)}`
        );
        if (c || !d) return;
        setForm((p) => ({
          ...p,
          enabled: Boolean(d.enabled),
          default_model: String(d.default_model ?? "gemini-2.5-flash-lite"),
          allowed_models:
            typeof d.allowed_models === "string"
              ? d.allowed_models
              : JSON.stringify(d.allowed_models ?? [], null, 2),
          safety_settings:
            typeof d.safety_settings === "string"
              ? d.safety_settings
              : JSON.stringify(d.safety_settings ?? {}, null, 2),
        }));
        setApiKeySet(Boolean((d as { api_key_set?: boolean }).api_key_set));
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
      let allowed_models: string[] = [];
      let safety_settings: Record<string, unknown> = {};
      try {
        allowed_models = JSON.parse(form.allowed_models) as string[];
        safety_settings = JSON.parse(form.safety_settings || "{}") as Record<string, unknown>;
      } catch {
        setMsg("Invalid JSON in allowed models or safety settings");
        setSaving(false);
        return;
      }
      await adminApi.putJson("/api/admin/control-plane/integrations/gemini", {
        environment: env,
        enabled: form.enabled,
        default_model: form.default_model,
        allowed_models,
        safety_settings,
        ...(form.api_key_secret ? { api_key_secret: form.api_key_secret } : {}),
      });
      setForm((p) => ({ ...p, api_key_secret: "" }));
      if (form.api_key_secret) setApiKeySet(true);
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
      <AdminPageHeader title="Gemini" description="API key, models, and safety settings." />
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
          <CpField label={`API key (leave blank to keep existing)${apiKeySet ? " — stored" : ""}`}>
            <input
              type="password"
              className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
              value={form.api_key_secret}
              onChange={(e) => setForm((p) => ({ ...p, api_key_secret: e.target.value }))}
              autoComplete="off"
            />
          </CpField>
          <CpField label="Default model">
            <input
              className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
              value={form.default_model}
              onChange={(e) => setForm((p) => ({ ...p, default_model: e.target.value }))}
            />
          </CpField>
          <CpField label="Allowed models (JSON array)">
            <textarea
              className="min-h-[80px] w-full rounded-lg border border-gray-200 px-2 py-1.5 font-mono text-xs"
              value={form.allowed_models}
              onChange={(e) => setForm((p) => ({ ...p, allowed_models: e.target.value }))}
            />
          </CpField>
          <CpField label="Safety settings (JSON object)">
            <textarea
              className="min-h-[80px] w-full rounded-lg border border-gray-200 px-2 py-1.5 font-mono text-xs"
              value={form.safety_settings}
              onChange={(e) => setForm((p) => ({ ...p, safety_settings: e.target.value }))}
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
