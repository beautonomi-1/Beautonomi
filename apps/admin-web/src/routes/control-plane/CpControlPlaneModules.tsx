import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart3, Clock, Package } from "lucide-react";
import { adminApi } from "@/lib/adminClient";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { useSuperadminPage } from "@/hooks/useSuperadminPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { CpBack, CpField, EnvSelect } from "./cpShared";

export function CpModuleDistancePage() {
  const { allowed, denied } = useSuperadminPage("Control plane is superadmin-only.");
  const [env, setEnv] = useState("production");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState({
    enabled: false,
    default_radius_km: "",
    max_radius_km: "",
    step_km: "",
  });

  useEffect(() => {
    if (!allowed) return;
    let c = false;
    (async () => {
      setLoading(true);
      setMsg(null);
      try {
        const d = await adminApi.getJson<Record<string, unknown> | null>(
          `/api/admin/control-plane/modules/distance?environment=${encodeURIComponent(env)}`
        );
        if (c || !d) return;
        setForm({
          enabled: Boolean(d.enabled),
          default_radius_km: d.default_radius_km != null ? String(d.default_radius_km) : "",
          max_radius_km: d.max_radius_km != null ? String(d.max_radius_km) : "",
          step_km: d.step_km != null ? String(d.step_km) : "",
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
      await adminApi.putJson("/api/admin/control-plane/modules/distance", {
        environment: env,
        enabled: form.enabled,
        default_radius_km: form.default_radius_km ? parseFloat(form.default_radius_km) : null,
        max_radius_km: form.max_radius_km ? parseFloat(form.max_radius_km) : null,
        step_km: form.step_km ? parseFloat(form.step_km) : null,
      });
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
      <AdminPageHeader title="Distance module" description="Radius filter and service-area defaults." />
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
          <CpField label="Default radius km">
            <input
              className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
              value={form.default_radius_km}
              onChange={(e) => setForm((p) => ({ ...p, default_radius_km: e.target.value }))}
            />
          </CpField>
          <CpField label="Max radius km">
            <input
              className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
              value={form.max_radius_km}
              onChange={(e) => setForm((p) => ({ ...p, max_radius_km: e.target.value }))}
            />
          </CpField>
          <CpField label="Step km">
            <input
              className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
              value={form.step_km}
              onChange={(e) => setForm((p) => ({ ...p, step_km: e.target.value }))}
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

export function CpModuleOnDemandPage() {
  const { allowed, denied } = useSuperadminPage("Control plane is superadmin-only.");
  const [env, setEnv] = useState("production");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState({
    enabled: false,
    ringtone_asset_path: "",
    ring_duration_seconds: 20,
    ring_repeat: true,
    normal_booking_ringtone_asset_path: "",
    normal_booking_ring_duration_seconds: 20,
    normal_booking_ring_repeat: true,
    waiting_screen_timeout_seconds: 45,
    provider_accept_window_seconds: 30,
    ui_copy: "{}",
  });

  useEffect(() => {
    if (!allowed) return;
    let c = false;
    (async () => {
      setLoading(true);
      setMsg(null);
      try {
        const d = await adminApi.getJson<Record<string, unknown> | null>(
          `/api/admin/control-plane/modules/on-demand?environment=${encodeURIComponent(env)}`
        );
        if (c || !d) return;
        setForm({
          enabled: Boolean(d.enabled),
          ringtone_asset_path: String(d.ringtone_asset_path ?? ""),
          ring_duration_seconds: Number(d.ring_duration_seconds ?? 20),
          ring_repeat: Boolean(d.ring_repeat ?? true),
          normal_booking_ringtone_asset_path: String(d.normal_booking_ringtone_asset_path ?? ""),
          normal_booking_ring_duration_seconds: Number(d.normal_booking_ring_duration_seconds ?? 20),
          normal_booking_ring_repeat: Boolean(d.normal_booking_ring_repeat ?? true),
          waiting_screen_timeout_seconds: Number(d.waiting_screen_timeout_seconds ?? 45),
          provider_accept_window_seconds: Number(d.provider_accept_window_seconds ?? 30),
          ui_copy: typeof d.ui_copy === "string" ? d.ui_copy : JSON.stringify(d.ui_copy ?? {}, null, 2),
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
      const ui_copy = JSON.parse(form.ui_copy || "{}") as Record<string, unknown>;
      await adminApi.putJson("/api/admin/control-plane/modules/on-demand", {
        environment: env,
        enabled: form.enabled,
        ringtone_asset_path: form.ringtone_asset_path || null,
        ring_duration_seconds: form.ring_duration_seconds,
        ring_repeat: form.ring_repeat,
        normal_booking_ringtone_asset_path: form.normal_booking_ringtone_asset_path || null,
        normal_booking_ring_duration_seconds: form.normal_booking_ring_duration_seconds,
        normal_booking_ring_repeat: form.normal_booking_ring_repeat,
        waiting_screen_timeout_seconds: form.waiting_screen_timeout_seconds,
        provider_accept_window_seconds: form.provider_accept_window_seconds,
        ui_copy,
      });
      setMsg("Saved.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Invalid JSON or save failed");
    } finally {
      setSaving(false);
    }
  };

  if (denied) return denied;

  return (
    <div className="space-y-6">
      <CpBack />
      <AdminPageHeader
        title="On-demand module"
        description="On-demand ringtone, standard booking alert ringtone (provider app/web), timeouts, UI copy."
      />
      <EnvSelect value={env} onChange={setEnv} />
      {msg ? (
        <AdminPanel>
          <p className="text-sm text-gray-700">{msg}</p>
        </AdminPanel>
      ) : null}
      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <AdminPanel className="grid gap-4 md:grid-cols-2">
          <label className="flex items-center gap-2 text-sm md:col-span-2">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm((p) => ({ ...p, enabled: e.target.checked }))}
            />
            Enabled
          </label>
          <CpField label="Ringtone asset path">
            <input
              className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
              value={form.ringtone_asset_path}
              onChange={(e) => setForm((p) => ({ ...p, ringtone_asset_path: e.target.value }))}
            />
          </CpField>
          <CpField label="Ring duration (s)">
            <input
              type="number"
              className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
              value={form.ring_duration_seconds}
              onChange={(e) => setForm((p) => ({ ...p, ring_duration_seconds: parseInt(e.target.value, 10) || 0 }))}
            />
          </CpField>
          <label className="flex items-center gap-2 text-sm md:col-span-2">
            <input
              type="checkbox"
              checked={form.ring_repeat}
              onChange={(e) => setForm((p) => ({ ...p, ring_repeat: e.target.checked }))}
            />
            Ring repeat (on-demand)
          </label>
          <p className="text-xs text-gray-600 md:col-span-2">
            Standard bookings (provider mobile + provider web): optional separate asset in app-assets. When set,
            realtime new-booking alerts play this file when the provider has &quot;Booking alert sound&quot; enabled.
            Leave empty to keep vibration-only on mobile.
          </p>
          <CpField label="Normal booking ringtone path">
            <input
              className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
              value={form.normal_booking_ringtone_asset_path}
              onChange={(e) => setForm((p) => ({ ...p, normal_booking_ringtone_asset_path: e.target.value }))}
              placeholder="ux/ringtones/booking-alert.mp3"
            />
          </CpField>
          <CpField label="Normal booking ring duration (s)">
            <input
              type="number"
              className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
              value={form.normal_booking_ring_duration_seconds}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  normal_booking_ring_duration_seconds: parseInt(e.target.value, 10) || 0,
                }))
              }
            />
          </CpField>
          <label className="flex items-center gap-2 text-sm md:col-span-2">
            <input
              type="checkbox"
              checked={form.normal_booking_ring_repeat}
              onChange={(e) => setForm((p) => ({ ...p, normal_booking_ring_repeat: e.target.checked }))}
            />
            Normal booking ring repeat
          </label>
          <CpField label="Waiting screen timeout (s)">
            <input
              type="number"
              className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
              value={form.waiting_screen_timeout_seconds}
              onChange={(e) =>
                setForm((p) => ({ ...p, waiting_screen_timeout_seconds: parseInt(e.target.value, 10) || 0 }))
              }
            />
          </CpField>
          <CpField label="Provider accept window (s)">
            <input
              type="number"
              className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
              value={form.provider_accept_window_seconds}
              onChange={(e) =>
                setForm((p) => ({ ...p, provider_accept_window_seconds: parseInt(e.target.value, 10) || 0 }))
              }
            />
          </CpField>
          <CpField label="UI copy (JSON)">
            <textarea
              className="min-h-[100px] w-full rounded-lg border border-gray-200 px-2 py-1.5 font-mono text-xs md:col-span-2"
              value={form.ui_copy}
              onChange={(e) => setForm((p) => ({ ...p, ui_copy: e.target.value }))}
            />
          </CpField>
          <button
            type="button"
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50 md:col-span-2"
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

export function CpModuleSafetyPage() {
  const { allowed, denied } = useSuperadminPage("Control plane is superadmin-only.");
  const [env, setEnv] = useState("production");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState({
    enabled: false,
    check_in_enabled: true,
    escalation_enabled: true,
    cooldown_seconds: 300,
    ui_copy: "{}",
  });

  useEffect(() => {
    if (!allowed) return;
    let c = false;
    (async () => {
      setLoading(true);
      setMsg(null);
      try {
        const d = await adminApi.getJson<Record<string, unknown> | null>(
          `/api/admin/control-plane/modules/safety?environment=${encodeURIComponent(env)}`
        );
        if (c || !d) return;
        setForm({
          enabled: Boolean(d.enabled),
          check_in_enabled: Boolean(d.check_in_enabled ?? true),
          escalation_enabled: Boolean(d.escalation_enabled ?? true),
          cooldown_seconds: Number(d.cooldown_seconds ?? 300),
          ui_copy: typeof d.ui_copy === "string" ? d.ui_copy : JSON.stringify(d.ui_copy ?? {}, null, 2),
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
      const ui_copy = JSON.parse(form.ui_copy || "{}") as Record<string, unknown>;
      await adminApi.putJson("/api/admin/control-plane/modules/safety", {
        environment: env,
        enabled: form.enabled,
        check_in_enabled: form.check_in_enabled,
        escalation_enabled: form.escalation_enabled,
        cooldown_seconds: form.cooldown_seconds,
        ui_copy,
      });
      setMsg("Saved.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Invalid JSON or save failed");
    } finally {
      setSaving(false);
    }
  };

  if (denied) return denied;

  return (
    <div className="space-y-6">
      <CpBack />
      <AdminPageHeader title="Safety module" description="Check-in, escalation, cooldown, UI copy." />
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
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.check_in_enabled}
              onChange={(e) => setForm((p) => ({ ...p, check_in_enabled: e.target.checked }))}
            />
            Check-in enabled
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.escalation_enabled}
              onChange={(e) => setForm((p) => ({ ...p, escalation_enabled: e.target.checked }))}
            />
            Escalation enabled
          </label>
          <CpField label="Cooldown (seconds)">
            <input
              type="number"
              className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
              value={form.cooldown_seconds}
              onChange={(e) => setForm((p) => ({ ...p, cooldown_seconds: parseInt(e.target.value, 10) || 0 }))}
            />
          </CpField>
          <CpField label="UI copy (JSON)">
            <textarea
              className="min-h-[100px] w-full rounded-lg border border-gray-200 px-2 py-1.5 font-mono text-xs"
              value={form.ui_copy}
              onChange={(e) => setForm((p) => ({ ...p, ui_copy: e.target.value }))}
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

export function CpModuleRankingPage() {
  const { allowed, denied } = useSuperadminPage("Control plane is superadmin-only.");
  const [env, setEnv] = useState("production");
  const [saving, setSaving] = useState(false);
  const [recomputing, setRecomputing] = useState(false);
  const [form, setForm] = useState({ enabled: false, weights: "{}" });
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!allowed) return;
    let c = false;
    (async () => {
      setLoading(true);
      try {
        const d = await adminApi.getJson<Record<string, unknown> | null>(
          `/api/admin/control-plane/modules/ranking?environment=${encodeURIComponent(env)}`
        );
        if (c || !d) return;
        setForm({
          enabled: Boolean(d.enabled),
          weights: typeof d.weights === "string" ? d.weights : JSON.stringify(d.weights ?? {}, null, 2),
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
      const weights = JSON.parse(form.weights || "{}") as Record<string, unknown>;
      await adminApi.putJson("/api/admin/control-plane/modules/ranking", {
        environment: env,
        enabled: form.enabled,
        weights,
      });
      setMsg("Saved.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Invalid JSON or save failed");
    } finally {
      setSaving(false);
    }
  };

  const recompute = async () => {
    setRecomputing(true);
    setMsg(null);
    try {
      const res = await adminApi.postJson<{ recomputed?: number; message?: string }>("/api/admin/ranking/recompute", {
        full: true,
        environment: env,
      });
      setMsg(res?.message ?? `Recomputed ${res?.recomputed ?? 0} providers.`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Recompute failed");
    } finally {
      setRecomputing(false);
    }
  };

  if (denied) return denied;

  return (
    <div className="space-y-6">
      <CpBack />
      <AdminPageHeader title="Ranking module" description="Quality scoring weights." />
      <div className="flex flex-wrap gap-3 text-sm">
        <Link to="scores" className="font-medium text-primary underline">
          Provider scores
        </Link>
      </div>
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
          <CpField label="Weights (JSON)">
            <textarea
              className="min-h-[160px] w-full rounded-lg border border-gray-200 px-2 py-1.5 font-mono text-xs"
              value={form.weights}
              onChange={(e) => setForm((p) => ({ ...p, weights: e.target.value }))}
            />
          </CpField>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50"
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm disabled:opacity-50"
              disabled={recomputing}
              onClick={() => void recompute()}
            >
              {recomputing ? "Recomputing…" : "Recompute all scores"}
            </button>
          </div>
        </AdminPanel>
      )}
    </div>
  );
}

export function CpModuleAiPage() {
  const { allowed, denied } = useSuperadminPage("Control plane is superadmin-only.");
  const [env, setEnv] = useState("production");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    enabled: false,
    sampling_rate: 0,
    cache_ttl_seconds: 86400,
    default_model_tier: "cheap",
    max_tokens: 600,
    temperature: 0.3,
    daily_budget_credits: 0,
    per_provider_calls_per_day: 0,
    per_user_calls_per_day: 0,
  });
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!allowed) return;
    let c = false;
    (async () => {
      setLoading(true);
      try {
        const d = await adminApi.getJson<Record<string, unknown> | null>(
          `/api/admin/control-plane/modules/ai?environment=${encodeURIComponent(env)}`
        );
        if (c || !d) return;
        setForm({
          enabled: Boolean(d.enabled),
          sampling_rate: Number(d.sampling_rate ?? 0),
          cache_ttl_seconds: Number(d.cache_ttl_seconds ?? 86400),
          default_model_tier: String(d.default_model_tier ?? "cheap"),
          max_tokens: Number(d.max_tokens ?? 600),
          temperature: Number(d.temperature ?? 0.3),
          daily_budget_credits: Number(d.daily_budget_credits ?? 0),
          per_provider_calls_per_day: Number(d.per_provider_calls_per_day ?? 0),
          per_user_calls_per_day: Number(d.per_user_calls_per_day ?? 0),
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
      await adminApi.putJson("/api/admin/control-plane/modules/ai", { environment: env, ...form });
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
      <AdminPageHeader title="AI module" description="Budgets, limits, cache TTL." />
      <div className="flex flex-wrap gap-3 text-sm">
        <Link to="templates" className="font-medium text-primary underline">
          Templates
        </Link>
        <Link to="usage" className="font-medium text-primary underline">
          Usage
        </Link>
        <Link to="entitlements" className="font-medium text-primary underline">
          Entitlements
        </Link>
      </div>
      <EnvSelect value={env} onChange={setEnv} />
      {msg ? (
        <AdminPanel>
          <p className="text-sm text-gray-700">{msg}</p>
        </AdminPanel>
      ) : null}
      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <AdminPanel className="grid gap-4 md:grid-cols-2">
          <label className="flex items-center gap-2 text-sm md:col-span-2">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm((p) => ({ ...p, enabled: e.target.checked }))}
            />
            Enabled
          </label>
          {(
            [
              ["sampling_rate", "Sampling rate (0–100)", "number"],
              ["cache_ttl_seconds", "Cache TTL (s)", "number"],
              ["default_model_tier", "Default model tier", "text"],
              ["max_tokens", "Max tokens", "number"],
              ["temperature", "Temperature", "number"],
              ["daily_budget_credits", "Daily budget credits", "number"],
              ["per_provider_calls_per_day", "Per-provider calls/day", "number"],
              ["per_user_calls_per_day", "Per-user calls/day", "number"],
            ] as const
          ).map(([key, label, type]) => (
            <CpField key={key} label={label}>
              <input
                type={type === "number" ? "number" : "text"}
                step={key === "temperature" ? "0.1" : undefined}
                className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                value={form[key as keyof typeof form] as string | number}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    [key]:
                      type === "number"
                        ? (key === "temperature" ? parseFloat(e.target.value) : parseInt(e.target.value, 10)) || 0
                        : e.target.value,
                  }))
                }
              />
            </CpField>
          ))}
          <button
            type="button"
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50 md:col-span-2"
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

type Pack = { id: string; impressions: number; price_zar: number; display_order: number; is_active: boolean };

type TimePack = {
  id: string;
  duration_days: number;
  label: string;
  price_zar: number;
  display_order: number;
  is_active: boolean;
};

const AD_MODEL_IDS = ["cpc_budget", "impression_pack", "time_based"] as const;
type AdModelId = (typeof AD_MODEL_IDS)[number];

const AD_MODEL_LABELS: Record<AdModelId, string> = {
  cpc_budget: "CPC budget",
  impression_pack: "Impression pack",
  time_based: "Time-based boost",
};

const AD_MODEL_HELP: Record<AdModelId, string> = {
  cpc_budget: "Pay per impression from a bid budget.",
  impression_pack: "Prepaid fixed impression bundles.",
  time_based: "Flat rate for guaranteed placement over N days.",
};

const DISCLOSURE_PRESETS = ["Sponsored", "Ad", "Promoted"] as const;

const CPI_PRESETS = [
  { value: "0.01", label: "1%" },
  { value: "0.02", label: "2%" },
  { value: "0.05", label: "5%" },
  { value: "0.1", label: "10%" },
] as const;

const SLOT_OPTIONS = Array.from({ length: 21 }, (_, i) => i);

type AdsOverview = {
  campaigns_by_status: Record<string, number>;
  events_7d: { impressions: number; clicks: number; books: number };
  events_30d: { impressions: number; clicks: number; books: number };
  prepaid_revenue_30d_zar: number;
  total_spent_in_campaigns_zar: number;
  total_budget_in_campaigns_zar: number;
  generated_at: string;
};

type AdsCampaignRow = {
  id: string;
  provider_id: string;
  provider_name: string;
  status: string;
  budget: number;
  spent: number;
  bid_cpc: number;
  daily_budget: number | null;
  pack_impressions: number | null;
  start_at: string | null;
  end_at: string | null;
  created_at: string;
  updated_at: string;
};

const zar = (n: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(n);

export function CpModuleAdsPage() {
  const { allowed, denied } = useSuperadminPage("Control plane is superadmin-only.");
  const [env, setEnv] = useState("production");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [packsSaving, setPacksSaving] = useState(false);
  const [timePacksSaving, setTimePacksSaving] = useState(false);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [timePacks, setTimePacks] = useState<TimePack[]>([]);
  const [form, setForm] = useState({
    enabled: false,
    disclosure_mode: "Sponsored" as (typeof DISCLOSURE_PRESETS)[number] | "custom",
    disclosure_custom: "",
    max_sponsored_slots: "",
    cost_per_impression_ratio: "",
    cost_ratio_mode: "preset" as "preset" | "custom",
    cost_ratio_preset: "",
    available_models: [...AD_MODEL_IDS] as AdModelId[],
    default_model: "time_based" as AdModelId,
  });
  const [msg, setMsg] = useState<string | null>(null);

  const defaultModelOptions = useMemo(() => {
    return form.available_models.filter((m) => AD_MODEL_IDS.includes(m));
  }, [form.available_models]);

  const [overview, setOverview] = useState<AdsOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [campaigns, setCampaigns] = useState<AdsCampaignRow[]>([]);
  const [campaignTotal, setCampaignTotal] = useState(0);
  const [campaignLoading, setCampaignLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [campOffset, setCampOffset] = useState(0);
  const campPageSize = 20;
  const [moderatingId, setModeratingId] = useState<string | null>(null);
  const [opsTick, setOpsTick] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(searchInput.trim()), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setCampOffset(0);
  }, [searchDebounced, statusFilter]);

  useEffect(() => {
    if (!allowed) return;
    let c = false;
    (async () => {
      setOverviewLoading(true);
      try {
        const d = await adminApi.getJson<AdsOverview>("/api/admin/ads/overview");
        if (!c) setOverview(d);
      } catch {
        if (!c) setOverview(null);
      } finally {
        if (!c) setOverviewLoading(false);
      }
    })();
    return () => {
      c = true;
    };
  }, [allowed, opsTick]);

  useEffect(() => {
    if (!allowed) return;
    let c = false;
    (async () => {
      setCampaignLoading(true);
      try {
        const qs = new URLSearchParams();
        qs.set("limit", String(campPageSize));
        qs.set("offset", String(campOffset));
        if (statusFilter) qs.set("status", statusFilter);
        if (searchDebounced) qs.set("search", searchDebounced);
        const d = await adminApi.getJson<{ campaigns: AdsCampaignRow[]; total: number }>(
          `/api/admin/ads/campaigns?${qs.toString()}`
        );
        if (!c) {
          setCampaigns(Array.isArray(d.campaigns) ? d.campaigns : []);
          setCampaignTotal(typeof d.total === "number" ? d.total : 0);
        }
      } catch {
        if (!c) {
          setCampaigns([]);
          setCampaignTotal(0);
        }
      } finally {
        if (!c) setCampaignLoading(false);
      }
    })();
    return () => {
      c = true;
    };
  }, [allowed, campOffset, searchDebounced, statusFilter, opsTick]);

  useEffect(() => {
    if (!allowed) return;
    let c = false;
    (async () => {
      setLoading(true);
      try {
        const [d, packsRes, timePacksRes] = await Promise.all([
          adminApi.getJson<Record<string, unknown> | null>(
            `/api/admin/control-plane/modules/ads?environment=${encodeURIComponent(env)}`
          ),
          adminApi.getJson<Pack[]>("/api/admin/control-plane/modules/ads/packs"),
          adminApi.getJson<TimePack[]>("/api/admin/control-plane/modules/ads/time-packs"),
        ]);
        if (c) return;
        if (d) {
          const rawLabel = String(d.disclosure_label ?? "").trim();
          const presetHit = DISCLOSURE_PRESETS.find((p) => p === rawLabel);
          let disclosure_mode: (typeof DISCLOSURE_PRESETS)[number] | "custom";
          let disclosure_custom: string;
          if (!rawLabel) {
            disclosure_mode = "Sponsored";
            disclosure_custom = "";
          } else if (presetHit) {
            disclosure_mode = presetHit;
            disclosure_custom = "";
          } else {
            disclosure_mode = "custom";
            disclosure_custom = rawLabel;
          }
          const am = Array.isArray(d.available_models)
            ? (d.available_models as string[]).filter((x): x is AdModelId =>
                AD_MODEL_IDS.includes(x as AdModelId)
              )
            : [];
          const available_models = am.length > 0 ? am : [...AD_MODEL_IDS];
          let default_model = (String(d.default_model ?? "time_based") as AdModelId) || "time_based";
          if (!AD_MODEL_IDS.includes(default_model) || !available_models.includes(default_model)) {
            default_model = available_models.includes("time_based") ? "time_based" : available_models[0];
          }
          const cpi =
            d.cost_per_impression_ratio != null && d.cost_per_impression_ratio !== ""
              ? String(Number(d.cost_per_impression_ratio))
              : "";
          const presetMatch = cpi ? CPI_PRESETS.find((p) => p.value === cpi) : undefined;
          setForm({
            enabled: Boolean(d.enabled),
            disclosure_mode,
            disclosure_custom,
            max_sponsored_slots: d.max_sponsored_slots != null ? String(d.max_sponsored_slots) : "",
            cost_per_impression_ratio: cpi,
            cost_ratio_mode: presetMatch ? "preset" : cpi ? "custom" : "preset",
            cost_ratio_preset: presetMatch?.value ?? "",
            available_models,
            default_model,
          });
        }
        setPacks(Array.isArray(packsRes) ? packsRes : []);
        setTimePacks(Array.isArray(timePacksRes) ? timePacksRes : []);
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
      const disclosure_label =
        form.disclosure_mode === "custom" ? form.disclosure_custom.trim() || null : form.disclosure_mode;
      let cost_per_impression_ratio: number | null = null;
      if (form.cost_ratio_mode === "preset") {
        const pr = form.cost_ratio_preset.trim();
        if (pr) cost_per_impression_ratio = parseFloat(pr);
      } else {
        const cr = form.cost_per_impression_ratio.trim();
        if (cr) cost_per_impression_ratio = parseFloat(cr);
      }
      let default_model = form.default_model;
      if (!form.available_models.includes(default_model)) {
        default_model = form.available_models.includes("time_based")
          ? "time_based"
          : form.available_models[0];
      }
      await adminApi.putJson("/api/admin/control-plane/modules/ads", {
        environment: env,
        enabled: form.enabled,
        disclosure_label,
        max_sponsored_slots: form.max_sponsored_slots !== "" ? parseInt(form.max_sponsored_slots, 10) : null,
        cost_per_impression_ratio,
        available_models: form.available_models,
        default_model,
      });
      setMsg("Saved.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const savePacks = async () => {
    setPacksSaving(true);
    setMsg(null);
    try {
      const updated = await adminApi.patchJson<Pack[]>("/api/admin/control-plane/modules/ads/packs", {
        packs: packs.map((p) => ({ id: p.id, price_zar: p.price_zar, is_active: p.is_active })),
      });
      setPacks(Array.isArray(updated) ? updated : packs);
      setMsg("Packs updated.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Packs save failed");
    } finally {
      setPacksSaving(false);
    }
  };

  const saveTimePacks = async () => {
    setTimePacksSaving(true);
    setMsg(null);
    try {
      const updated = await adminApi.patchJson<TimePack[]>("/api/admin/control-plane/modules/ads/time-packs", {
        packs: timePacks.map((p) => ({
          id: p.id,
          price_zar: p.price_zar,
          is_active: p.is_active,
          label: p.label,
        })),
      });
      setTimePacks(Array.isArray(updated) ? updated : timePacks);
      setMsg("Time packs updated.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Time packs save failed");
    } finally {
      setTimePacksSaving(false);
    }
  };

  const toggleModel = (m: AdModelId, on: boolean) => {
    setForm((prev) => {
      let next = on ? [...new Set([...prev.available_models, m])] : prev.available_models.filter((x) => x !== m);
      if (next.length === 0) next = [...AD_MODEL_IDS];
      let default_model = prev.default_model;
      if (!next.includes(default_model)) {
        default_model = next.includes("time_based") ? "time_based" : next[0];
      }
      return { ...prev, available_models: next as AdModelId[], default_model };
    });
  };

  const moderateCampaign = async (id: string, next: "paused" | "ended") => {
    if (next === "ended") {
      const ok = window.confirm("End this campaign? It cannot be resumed.");
      if (!ok) return;
    }
    setModeratingId(id);
    setMsg(null);
    try {
      await adminApi.patchJson(`/api/admin/ads/campaigns/${id}`, { status: next });
      setMsg(next === "paused" ? "Campaign paused." : "Campaign ended.");
      setOpsTick((t) => t + 1);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Moderation failed");
    } finally {
      setModeratingId(null);
    }
  };

  if (denied) return denied;

  return (
    <div className="space-y-6">
      <CpBack />
      <AdminPageHeader title="Ads module" description="Sponsored listings and impression packs." />
      <EnvSelect value={env} onChange={setEnv} />
      {msg ? (
        <AdminPanel>
          <p className="text-sm text-gray-700">{msg}</p>
        </AdminPanel>
      ) : null}

      <AdminPanel className="space-y-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
          <BarChart3 className="h-5 w-5" />
          Platform overview
        </h2>
        {overviewLoading ? (
          <p className="text-sm text-gray-500">Loading metrics…</p>
        ) : overview ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Campaigns</p>
              <p className="mt-1 text-2xl font-semibold text-gray-900">
                {(overview.campaigns_by_status.active ?? 0) +
                  (overview.campaigns_by_status.paused ?? 0) +
                  (overview.campaigns_by_status.draft ?? 0) +
                  (overview.campaigns_by_status.ended ?? 0)}
              </p>
              <p className="mt-1 text-xs text-gray-600">
                Active {overview.campaigns_by_status.active ?? 0} · Paused{" "}
                {overview.campaigns_by_status.paused ?? 0} · Draft {overview.campaigns_by_status.draft ?? 0} · Ended{" "}
                {overview.campaigns_by_status.ended ?? 0}
              </p>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Events (30d)</p>
              <p className="mt-1 text-sm text-gray-800">
                Impr. {overview.events_30d.impressions.toLocaleString()} · Clicks{" "}
                {overview.events_30d.clicks.toLocaleString()} · Books {overview.events_30d.books.toLocaleString()}
              </p>
              <p className="mt-2 text-xs text-gray-500">
                7d: impr. {overview.events_7d.impressions.toLocaleString()} · clk {overview.events_7d.clicks} · book{" "}
                {overview.events_7d.books}
              </p>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Prepaid revenue (30d)</p>
              <p className="mt-1 text-2xl font-semibold text-gray-900">{zar(overview.prepaid_revenue_30d_zar)}</p>
              <p className="mt-1 text-xs text-gray-600">Paid budget orders</p>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Spend vs budget (all)</p>
              <p className="mt-1 text-sm font-medium text-gray-900">
                Spent {zar(overview.total_spent_in_campaigns_zar)} / {zar(overview.total_budget_in_campaigns_zar)}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Updated {new Date(overview.generated_at).toLocaleString(undefined, { hour12: false })}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500">Could not load overview.</p>
        )}
      </AdminPanel>

      <AdminPanel className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Campaigns</h2>
        <div className="flex flex-wrap items-end gap-3">
          <CpField label="Search (provider or campaign id)">
            <input
              className="w-full min-w-[12rem] rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Name or UUID fragment…"
            />
          </CpField>
          <CpField label="Status">
            <select
              className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All</option>
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="ended">Ended</option>
            </select>
          </CpField>
        </div>
        {campaignLoading ? (
          <p className="text-sm text-gray-500">Loading campaigns…</p>
        ) : campaigns.length === 0 ? (
          <p className="text-sm text-gray-500">No campaigns match.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs uppercase text-gray-500">
                  <th className="py-2 pr-3 font-medium">Provider</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium">Budget</th>
                  <th className="py-2 pr-3 font-medium">Spent</th>
                  <th className="py-2 pr-3 font-medium">Bid (CPC)</th>
                  <th className="py-2 pr-3 font-medium">Updated</th>
                  <th className="py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => {
                  const busy = moderatingId === c.id;
                  const canPause = c.status === "active" || c.status === "draft";
                  const canEnd = c.status !== "ended";
                  return (
                    <tr key={c.id} className="border-b border-gray-100">
                      <td className="py-2 pr-3">
                        <Link
                          className="font-medium text-primary underline"
                          to={adminSpaTo(`/admin/providers/${c.provider_id}`)}
                        >
                          {c.provider_name}
                        </Link>
                        <p className="text-xs text-gray-500">{c.id.slice(0, 8)}…</p>
                      </td>
                      <td className="py-2 pr-3 capitalize">{c.status}</td>
                      <td className="py-2 pr-3">{zar(c.budget)}</td>
                      <td className="py-2 pr-3">{zar(c.spent)}</td>
                      <td className="py-2 pr-3">{zar(c.bid_cpc)}</td>
                      <td className="py-2 pr-3 text-gray-600">
                        {new Date(c.updated_at).toLocaleDateString(undefined, { hour12: false })}
                      </td>
                      <td className="py-2">
                        <div className="flex flex-wrap gap-2">
                          {canPause ? (
                            <button
                              type="button"
                              disabled={busy}
                              className="rounded border border-gray-300 bg-white px-2 py-1 text-xs disabled:opacity-50"
                              onClick={() => void moderateCampaign(c.id, "paused")}
                            >
                              {busy ? "…" : "Pause"}
                            </button>
                          ) : null}
                          {canEnd ? (
                            <button
                              type="button"
                              disabled={busy}
                              className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-900 disabled:opacity-50"
                              onClick={() => void moderateCampaign(c.id, "ended")}
                            >
                              {busy ? "…" : "End"}
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {campaignTotal > campPageSize ? (
          <div className="flex items-center justify-between gap-3 border-t border-gray-100 pt-3 text-sm text-gray-600">
            <span>
              {campaignTotal.toLocaleString()} total · showing {campOffset + 1}–
              {Math.min(campOffset + campaigns.length, campaignTotal)}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded border border-gray-300 bg-white px-3 py-1 text-sm disabled:opacity-50"
                disabled={campOffset <= 0 || campaignLoading}
                onClick={() => setCampOffset((o) => Math.max(0, o - campPageSize))}
              >
                Previous
              </button>
              <button
                type="button"
                className="rounded border border-gray-300 bg-white px-3 py-1 text-sm disabled:opacity-50"
                disabled={campOffset + campPageSize >= campaignTotal || campaignLoading}
                onClick={() => setCampOffset((o) => o + campPageSize)}
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </AdminPanel>

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <>
          <AdminPanel className="space-y-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
              <Package className="h-5 w-5" />
              Config
            </h2>
            <p className="text-sm text-gray-600">
              Use the selects and toggles below to avoid typos. At least one billing model must stay enabled; the API
              enforces a valid default.
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => setForm((p) => ({ ...p, enabled: e.target.checked }))}
              />
              Ads module enabled
            </label>
            <CpField label="Disclosure label (public)">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <select
                  className="w-full max-w-xs rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                  value={form.disclosure_mode}
                  onChange={(e) => {
                    const v = e.target.value as (typeof DISCLOSURE_PRESETS)[number] | "custom";
                    setForm((p) => ({ ...p, disclosure_mode: v }));
                  }}
                >
                  {DISCLOSURE_PRESETS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                  <option value="custom">Custom…</option>
                </select>
                {form.disclosure_mode === "custom" ? (
                  <input
                    className="w-full min-w-[8rem] flex-1 rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                    placeholder="e.g. Partner content"
                    value={form.disclosure_custom}
                    onChange={(e) => setForm((p) => ({ ...p, disclosure_custom: e.target.value }))}
                  />
                ) : null}
              </div>
              <p className="mt-1 text-xs text-gray-500">Shown on sponsored listings in search and Explore.</p>
            </CpField>
            <CpField label="Max sponsored slots (per search page)">
              <select
                className="w-full max-w-xs rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                value={form.max_sponsored_slots}
                onChange={(e) => setForm((p) => ({ ...p, max_sponsored_slots: e.target.value }))}
              >
                <option value="">Not set</option>
                {SLOT_OPTIONS.map((n) => (
                  <option key={n} value={String(n)}>
                    {n}
                  </option>
                ))}
              </select>
            </CpField>
            <CpField label="Cost per impression ratio (CPC model)">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <select
                  className="w-full max-w-xs rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                  value={form.cost_ratio_mode}
                  onChange={(e) => setForm((p) => ({ ...p, cost_ratio_mode: e.target.value as "preset" | "custom" }))}
                >
                  <option value="preset">Preset</option>
                  <option value="custom">Custom value (0–1)</option>
                </select>
                {form.cost_ratio_mode === "preset" ? (
                  <select
                    className="w-full max-w-xs rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                    value={form.cost_ratio_preset}
                    onChange={(e) => setForm((p) => ({ ...p, cost_ratio_preset: e.target.value }))}
                  >
                    <option value="">Not set (use platform default)</option>
                    {CPI_PRESETS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label} ({p.value})
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.01}
                    className="w-full max-w-[10rem] rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                    value={form.cost_per_impression_ratio}
                    onChange={(e) => setForm((p) => ({ ...p, cost_per_impression_ratio: e.target.value }))}
                    placeholder="0.05"
                  />
                )}
              </div>
              <p className="mt-1 text-xs text-gray-500">Charge per impression = bid CPC × this ratio. Used only for CPC campaigns.</p>
            </CpField>

            <div className="border-t border-gray-100 pt-4">
              <h3 className="text-sm font-semibold text-gray-900">Billing models providers can use</h3>
              <p className="mt-0.5 text-xs text-gray-500">Turn off models you do not want to offer. At least one must stay on.</p>
              <ul className="mt-3 space-y-2">
                {AD_MODEL_IDS.map((m) => (
                  <li
                    key={m}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">{AD_MODEL_LABELS[m]}</p>
                      <p className="text-xs text-gray-500">{AD_MODEL_HELP[m]}</p>
                    </div>
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={form.available_models.includes(m)}
                        onChange={(e) => toggleModel(m, e.target.checked)}
                      />
                      Available
                    </label>
                  </li>
                ))}
              </ul>
            </div>

            <CpField label="Default billing model (new campaigns)">
              <select
                className="w-full max-w-md rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                value={defaultModelOptions.includes(form.default_model) ? form.default_model : defaultModelOptions[0]}
                onChange={(e) => setForm((p) => ({ ...p, default_model: e.target.value as AdModelId }))}
              >
                {defaultModelOptions.map((m) => (
                  <option key={m} value={m}>
                    {AD_MODEL_LABELS[m]}
                  </option>
                ))}
              </select>
              {defaultModelOptions.length === 0 ? (
                <p className="mt-1 text-xs text-amber-800">Enable at least one model above.</p>
              ) : null}
            </CpField>

            <button
              type="button"
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50"
              disabled={saving || form.available_models.length === 0}
              onClick={() => void save()}
            >
              {saving ? "Saving…" : "Save config"}
            </button>
          </AdminPanel>

          <AdminPanel className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Impression packs (ZAR)</h2>
            {packs.length === 0 ? (
              <p className="text-sm text-gray-500">No packs.</p>
            ) : (
              <>
                <ul className="space-y-3">
                  {packs.map((pack) => (
                    <li key={pack.id} className="flex flex-wrap items-center gap-4 rounded-lg border border-gray-100 p-3">
                      <span className="font-medium">{pack.impressions} impressions</span>
                      <label className="flex items-center gap-2 text-sm">
                        Price
                        <input
                          type="number"
                          className="w-24 rounded border border-gray-200 px-2 py-1 text-sm"
                          value={pack.price_zar}
                          onChange={(e) =>
                            setPacks((prev) =>
                              prev.map((p) =>
                                p.id === pack.id ? { ...p, price_zar: parseFloat(e.target.value) || 0 } : p
                              )
                            )
                          }
                        />
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={pack.is_active}
                          onChange={(e) =>
                            setPacks((prev) =>
                              prev.map((p) => (p.id === pack.id ? { ...p, is_active: e.target.checked } : p))
                            )
                          }
                        />
                        Active
                      </label>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm disabled:opacity-50"
                  disabled={packsSaving}
                  onClick={() => void savePacks()}
                >
                  {packsSaving ? "Saving…" : "Save packs"}
                </button>
              </>
            )}
          </AdminPanel>

          <AdminPanel className="space-y-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
              <Clock className="h-5 w-5" />
              Time-based boost packs (ZAR)
            </h2>
            <p className="text-sm text-gray-600">
              Durations are fixed; adjust public labels and prices. Inactive packs are hidden from providers.
            </p>
            {timePacks.length === 0 ? (
              <p className="text-sm text-gray-500">No time packs (run migration 459 / seed if missing).</p>
            ) : (
              <>
                <ul className="space-y-3">
                  {timePacks.map((tp) => (
                    <li key={tp.id} className="flex flex-wrap items-center gap-4 rounded-lg border border-gray-100 p-3">
                      <span className="font-medium tabular-nums">
                        {tp.duration_days} day{tp.duration_days !== 1 ? "s" : ""}
                      </span>
                      <label className="flex min-w-[10rem] flex-1 flex-col text-xs font-medium text-gray-600">
                        Label
                        <input
                          className="mt-0.5 rounded border border-gray-200 px-2 py-1 text-sm font-normal text-gray-900"
                          value={tp.label}
                          onChange={(e) =>
                            setTimePacks((prev) =>
                              prev.map((p) => (p.id === tp.id ? { ...p, label: e.target.value } : p))
                            )
                          }
                        />
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        Price
                        <input
                          type="number"
                          min={0}
                          step={1}
                          className="w-28 rounded border border-gray-200 px-2 py-1 text-sm"
                          value={tp.price_zar}
                          onChange={(e) =>
                            setTimePacks((prev) =>
                              prev.map((p) =>
                                p.id === tp.id ? { ...p, price_zar: parseFloat(e.target.value) || 0 } : p
                              )
                            )
                          }
                        />
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={tp.is_active}
                          onChange={(e) =>
                            setTimePacks((prev) =>
                              prev.map((p) => (p.id === tp.id ? { ...p, is_active: e.target.checked } : p))
                            )
                          }
                        />
                        Active
                      </label>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm disabled:opacity-50"
                  disabled={timePacksSaving}
                  onClick={() => void saveTimePacks()}
                >
                  {timePacksSaving ? "Saving…" : "Save time packs"}
                </button>
              </>
            )}
          </AdminPanel>
        </>
      )}
    </div>
  );
}
