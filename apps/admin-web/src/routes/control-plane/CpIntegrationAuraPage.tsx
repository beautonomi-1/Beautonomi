import { useEffect, useState } from "react";
import { adminApi } from "@/lib/adminClient";
import { useSuperadminPage } from "@/hooks/useSuperadminPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { CpBack, CpField, EnvSelect } from "./cpShared";

export function CpIntegrationAuraPage() {
  const { allowed, denied } = useSuperadminPage("Control plane is superadmin-only.");
  const [env, setEnv] = useState("production");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState({ enabled: false, org_id: "", api_key_secret: "" });
  const [apiKeySet, setApiKeySet] = useState(false);

  useEffect(() => {
    if (!allowed) return;
    let c = false;
    (async () => {
      setLoading(true);
      setMsg(null);
      try {
        const d = await adminApi.getJson<Record<string, unknown> | null>(
          `/api/admin/control-plane/integrations/aura?environment=${encodeURIComponent(env)}`
        );
        if (c || !d) return;
        setForm((p) => ({
          ...p,
          enabled: Boolean(d.enabled),
          org_id: String(d.org_id ?? ""),
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
      await adminApi.putJson("/api/admin/control-plane/integrations/aura", {
        environment: env,
        enabled: form.enabled,
        org_id: form.org_id || null,
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
      <AdminPageHeader title="Aura" description="Trust and safety integration." />
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
          <CpField label="Org ID">
            <input
              className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
              value={form.org_id}
              onChange={(e) => setForm((p) => ({ ...p, org_id: e.target.value }))}
            />
          </CpField>
          <CpField label={`API key${apiKeySet ? " (set)" : ""}`}>
            <input
              type="password"
              className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
              value={form.api_key_secret}
              onChange={(e) => setForm((p) => ({ ...p, api_key_secret: e.target.value }))}
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
