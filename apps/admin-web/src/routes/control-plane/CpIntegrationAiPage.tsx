import { useCallback, useEffect, useState } from "react";
import { adminApi } from "@/lib/adminClient";
import { useSuperadminPage } from "@/hooks/useSuperadminPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { AdminMetricCard } from "@/components/ui/AdminMetricCard";
import { CpBack, CpField, EnvSelect } from "./cpShared";

type LiveModelRow = {
  id: string;
  name: string;
  provider: string;
  capability: string;
  tier: string;
  enabled: boolean;
  db_id: string | null;
  eval_passed_at: string | null;
  input_usd_per_1k: number;
  output_usd_per_1k: number;
  description?: string;
  tags?: string[];
};

type DirectGeminiModel = {
  id: string;
  provider: string;
  tier: string;
  enabled: boolean;
  gateway: boolean;
};

type SelectableModel = {
  model_id: string;
  provider: string;
  tier: string;
  gateway: boolean;
};

type PricingRow = {
  model: string;
  input_usd_per_1k: number;
  output_usd_per_1k: number;
  notes?: string | null;
  is_active?: boolean;
};

type AiPayload = {
  runtime: Record<string, unknown> | null;
  emergency: Record<string, unknown> | null;
  live_models: LiveModelRow[];
  selectable_models: SelectableModel[];
  direct_gemini_models: DirectGeminiModel[];
  gateway_catalog_source?: string;
  gemini: Record<string, unknown> | null;
  pricing: PricingRow[];
  module: Record<string, unknown> | null;
  stats: {
    spend_today_usd: number;
    spend_month_usd?: number;
    monthly_budget_usd?: number | null;
    failed_calls_last_hour: number;
    models_enabled: number;
    catalog_stats?: Record<
      string,
      { success_rate: number; p95_latency_ms: number | null; calls_24h: number }
    >;
  };
};

const RUNTIMES = [
  { value: "direct_gemini", label: "Direct Gemini" },
  { value: "vercel_gateway", label: "Vercel AI Gateway" },
  { value: "direct_openai", label: "Direct OpenAI" },
  { value: "direct_anthropic", label: "Direct Anthropic" },
] as const;

const TIERS = ["lite", "flash", "pro"] as const;

const HARM_CATEGORIES = [
  "HARM_CATEGORY_HARASSMENT",
  "HARM_CATEGORY_HATE_SPEECH",
  "HARM_CATEGORY_SEXUALLY_EXPLICIT",
  "HARM_CATEGORY_DANGEROUS_CONTENT",
] as const;

const THRESHOLDS = [
  "BLOCK_NONE",
  "BLOCK_ONLY_HIGH",
  "BLOCK_MEDIUM_AND_ABOVE",
  "BLOCK_LOW_AND_ABOVE",
] as const;

const PRESET_HINTS: Record<string, string> = {
  gemini_only: "Enables direct Gemini lite/flash/pro. Est. ~$0.05 / 1k calls.",
  gateway_balanced: "Gateway lite + OpenAI mini fallback. Est. ~$0.15 / 1k calls.",
  gateway_premium: "Adds Claude Sonnet for high-risk. Est. ~$0.45 / 1k calls.",
};

const CAPABILITY_FILTERS = ["all", "chat", "vision", "embedding"] as const;

function groupByProvider<T extends { provider: string }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const list = map.get(row.provider) ?? [];
    list.push(row);
    map.set(row.provider, list);
  }
  return map;
}

export function CpIntegrationAiPage() {
  const { allowed, denied } = useSuperadminPage("Control plane is superadmin-only.");
  const [env, setEnv] = useState("production");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [data, setData] = useState<AiPayload | null>(null);
  const [gatewayKey, setGatewayKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [emergencyReason, setEmergencyReason] = useState("");
  const [runtime, setRuntime] = useState("direct_gemini");
  const [defaultModelId, setDefaultModelId] = useState("");
  const [safety, setSafety] = useState<Record<string, string>>({});
  const [advancedSafetyJson, setAdvancedSafetyJson] = useState("");
  const [showAdvancedSafety, setShowAdvancedSafety] = useState(false);
  const [dailyBudgetCredits, setDailyBudgetCredits] = useState(0);
  const [monthlyBudgetUsd, setMonthlyBudgetUsd] = useState<number | "">("");
  const [alertThresholdPct, setAlertThresholdPct] = useState(80);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [capabilityFilter, setCapabilityFilter] = useState<(typeof CAPABILITY_FILTERS)[number]>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    try {
      const d = await adminApi.getJson<AiPayload>(
        `/api/admin/control-plane/integrations/ai?environment=${encodeURIComponent(env)}`,
      );
      setData(d);
      setRuntime(String(d.runtime?.runtime ?? "direct_gemini"));
      setDefaultModelId(String(d.runtime?.default_model_id ?? "gemini-2.5-flash-lite"));
      setDailyBudgetCredits(Number(d.module?.daily_budget_credits ?? 0));
      setMonthlyBudgetUsd(
        d.module?.monthly_budget_usd != null ? Number(d.module.monthly_budget_usd) : "",
      );
      setAlertThresholdPct(Number(d.module?.alert_threshold_pct ?? 80));

      const rawSafety = d.gemini?.safety_settings;
      if (rawSafety && typeof rawSafety === "object" && !Array.isArray(rawSafety)) {
        const map: Record<string, string> = {};
        for (const cat of HARM_CATEGORIES) {
          const entry = (rawSafety as Record<string, { threshold?: string }>)[cat];
          map[cat] = entry?.threshold ?? "BLOCK_MEDIUM_AND_ABOVE";
        }
        setSafety(map);
        setAdvancedSafetyJson(JSON.stringify(rawSafety, null, 2));
      } else {
        const defaults: Record<string, string> = {};
        for (const cat of HARM_CATEGORIES) defaults[cat] = "BLOCK_MEDIUM_AND_ABOVE";
        setSafety(defaults);
        setAdvancedSafetyJson("{}");
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [env]);

  useEffect(() => {
    if (!allowed) return;
    void load();
  }, [allowed, load]);

  const saveRuntime = async (patch: Record<string, unknown>) => {
    setSaving(true);
    setMsg(null);
    try {
      let safety_settings: Record<string, unknown> = {};
      if (showAdvancedSafety) {
        safety_settings = JSON.parse(advancedSafetyJson || "{}") as Record<string, unknown>;
      } else {
        for (const cat of HARM_CATEGORIES) {
          safety_settings[cat] = { threshold: safety[cat] ?? "BLOCK_MEDIUM_AND_ABOVE" };
        }
      }

      await adminApi.putJson("/api/admin/control-plane/integrations/ai", {
        environment: env,
        runtime,
        default_model_id: defaultModelId,
        ...patch,
        ...(gatewayKey ? { gateway_api_key_secret: gatewayKey } : {}),
        ...(openaiKey ? { openai_api_key_secret: openaiKey } : {}),
        ...(anthropicKey ? { anthropic_api_key_secret: anthropicKey } : {}),
        gemini: {
          api_key_secret: geminiKey || undefined,
          enabled: data?.gemini?.enabled ?? true,
          default_model: defaultModelId.replace(/^google\//, "") || defaultModelId,
          safety_settings,
          ...(patch.gemini as Record<string, unknown> | undefined),
        },
        module: {
          daily_budget_credits: dailyBudgetCredits,
          monthly_budget_usd: monthlyBudgetUsd === "" ? null : Number(monthlyBudgetUsd),
          alert_threshold_pct: alertThresholdPct,
        },
      });
      setGatewayKey("");
      setOpenaiKey("");
      setAnthropicKey("");
      setGeminiKey("");
      setMsg("Saved.");
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const applyPreset = (preset: string) => {
    setMsg(PRESET_HINTS[preset] ?? null);
    void saveRuntime({ preset });
  };

  const toggleCatalog = async (row: LiveModelRow, enabled: boolean, tier?: string) => {
    const res = await adminApi.putJson<{ catalog_errors?: string[]; catalog_error_reason?: string }>(
      "/api/admin/control-plane/integrations/ai",
      {
        environment: env,
        catalog: [
          {
            id: row.db_id ?? undefined,
            enabled,
            model_id: row.id,
            eval_passed_at: row.eval_passed_at,
            tier: tier ?? row.tier,
          },
        ],
      },
    );
    if (res?.catalog_errors?.length) {
      setMsg(`Enable blocked in production until evals pass (${res.catalog_error_reason})`);
    }
    await load();
  };

  const markEvalPassed = async (row: LiveModelRow) => {
    await adminApi.putJson("/api/admin/control-plane/integrations/ai", {
      environment: env,
      catalog: [
        {
          id: row.db_id ?? undefined,
          model_id: row.id,
          enabled: row.enabled,
          tier: row.tier,
          eval_passed_at: new Date().toISOString(),
        },
      ],
    });
    setMsg(`Eval marked passed for ${row.id}`);
    await load();
  };

  const toggleDirectGemini = async (model: DirectGeminiModel, enabled: boolean) => {
    await adminApi.putJson("/api/admin/control-plane/integrations/ai", {
      environment: env,
      catalog: [{ model_id: model.id, enabled, tier: model.tier }],
    });
    await load();
  };

  const refreshCatalog = async () => {
    await adminApi.putJson("/api/admin/control-plane/integrations/ai", {
      environment: env,
      refresh_catalog: true,
    });
    setMsg("Gateway catalog refreshed from Vercel.");
    await load();
  };

  const testCall = async (credential?: "gemini" | "gateway" | "openai" | "anthropic") => {
    setMsg(null);
    try {
      const r = await adminApi.postJson<Record<string, unknown>>(
        "/api/admin/control-plane/integrations/ai/test",
        { environment: env, credential },
      );
      setMsg(
        r.success
          ? `Test OK (${String(r.credential)}) — ${String(r.model)} in ${String(r.latency_ms)}ms`
          : `Test failed (${String(r.credential)}): ${String(r.error_code ?? "unknown")}`,
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Test failed");
    }
  };

  const setEmergency = async (stopAll: boolean, forceFallback: boolean) => {
    if ((stopAll || forceFallback) && !emergencyReason.trim()) {
      setMsg("Reason required for emergency activation");
      return;
    }
    await adminApi.postJson("/api/admin/control-plane/integrations/ai/emergency", {
      environment: env,
      stop_all_calls: stopAll,
      force_template_fallback: forceFallback,
      reason: emergencyReason.trim() || null,
    });
    setEmergencyReason("");
    setMsg("Emergency controls updated.");
    await load();
  };

  const catalogStats = data?.stats?.catalog_stats ?? {};
  const liveModels = data?.live_models ?? [];
  const filteredLiveModels = liveModels.filter((m) => {
    if (capabilityFilter !== "all" && m.capability !== capabilityFilter) return false;
    const q = catalogSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      m.id.toLowerCase().includes(q) ||
      m.name.toLowerCase().includes(q) ||
      m.provider.toLowerCase().includes(q)
    );
  });
  const selectableForDefault: SelectableModel[] = [
    ...(data?.direct_gemini_models ?? [])
      .filter((m) => m.enabled)
      .map((m) => ({ model_id: m.id, provider: m.provider, tier: m.tier, gateway: m.gateway })),
    ...(data?.selectable_models ?? []),
  ];
  const defaultOptionsByProvider = groupByProvider(selectableForDefault);

  if (denied) return denied;

  const runtimeRow = data?.runtime ?? {};
  const emergency = data?.emergency ?? {};
  const stats = data?.stats;

  return (
    <div className="space-y-6">
      <CpBack to=".." label="Integrations" />
      <AdminPageHeader
        title="AI providers"
        description="Runtime, models, credentials, budgets, and kill switches."
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
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <AdminMetricCard label="Runtime" value={String(runtimeRow.runtime ?? runtime)} variant="slate" />
            <AdminMetricCard label="Models enabled" value={stats?.models_enabled ?? 0} variant="emerald" />
            <AdminMetricCard
              label="Spend today"
              value={`$${(stats?.spend_today_usd ?? 0).toFixed(4)}`}
              variant="amber"
            />
            <AdminMetricCard
              label="Failed (1h)"
              value={stats?.failed_calls_last_hour ?? 0}
              variant="rose"
            />
          </div>

          <AdminPanel className="space-y-3 border-red-200 bg-red-50/40">
            <h3 className="text-sm font-semibold text-red-900">Emergency controls</h3>
            <CpField label="Reason (required to activate)">
              <input
                className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                value={emergencyReason}
                onChange={(e) => setEmergencyReason(e.target.value)}
              />
            </CpField>
            <div className="flex flex-wrap gap-3 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(emergency.stop_all_calls)}
                  onChange={(e) =>
                    void setEmergency(e.target.checked, Boolean(emergency.force_template_fallback))
                  }
                />
                Stop all calls
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(emergency.force_template_fallback)}
                  onChange={(e) => void setEmergency(Boolean(emergency.stop_all_calls), e.target.checked)}
                />
                Force template fallback
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(emergency.disable_streaming)}
                  onChange={(e) =>
                    void adminApi
                      .postJson("/api/admin/control-plane/integrations/ai/emergency", {
                        environment: env,
                        disable_streaming: e.target.checked,
                        reason: emergencyReason.trim() || "admin toggle",
                      })
                      .then(() => load())
                  }
                />
                Disable streaming
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(emergency.disable_vision)}
                  onChange={(e) =>
                    void adminApi
                      .postJson("/api/admin/control-plane/integrations/ai/emergency", {
                        environment: env,
                        disable_vision: e.target.checked,
                        reason: emergencyReason.trim() || "admin toggle",
                      })
                      .then(() => load())
                  }
                />
                Disable vision
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(emergency.disable_embeddings)}
                  onChange={(e) =>
                    void adminApi
                      .postJson("/api/admin/control-plane/integrations/ai/emergency", {
                        environment: env,
                        disable_embeddings: e.target.checked,
                        reason: emergencyReason.trim() || "admin toggle",
                      })
                      .then(() => load())
                  }
                />
                Disable embeddings
              </label>
              <button
                type="button"
                className="rounded-lg border px-3 py-1.5 text-sm"
                onClick={() => void setEmergency(false, false)}
              >
                Clear kill switches
              </button>
            </div>
          </AdminPanel>

          <AdminPanel className="space-y-3">
            <h3 className="text-sm font-semibold">Presets</h3>
            <p className="text-xs text-gray-500">One-click runtime + catalog setup. Review cost hint before applying.</p>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["gemini_only", "Gemini only (current)"],
                  ["gateway_balanced", "Gateway balanced"],
                  ["gateway_premium", "Gateway premium"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  title={PRESET_HINTS[id]}
                  className="rounded-lg border px-3 py-1.5 text-sm"
                  onClick={() => applyPreset(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          </AdminPanel>

          <AdminPanel className="space-y-4">
            <h3 className="text-sm font-semibold">Runtime & credentials</h3>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={Boolean(runtimeRow.enabled)}
                onChange={(e) => void saveRuntime({ enabled: e.target.checked })}
              />
              AI runtime enabled
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <CpField label="Runtime">
                <select
                  className="w-full rounded-lg border px-2 py-1.5 text-sm"
                  value={runtime}
                  onChange={(e) => setRuntime(e.target.value)}
                >
                  {RUNTIMES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </CpField>
              <CpField label="Default model">
                <select
                  className="w-full rounded-lg border px-2 py-1.5 font-mono text-sm"
                  value={defaultModelId}
                  onChange={(e) => setDefaultModelId(e.target.value)}
                >
                  <option value="">Select a model…</option>
                  {[...defaultOptionsByProvider.entries()]
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([provider, models]) => (
                      <optgroup key={provider} label={provider}>
                        {models.map((m) => (
                          <option key={m.model_id} value={m.model_id}>
                            {m.model_id}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  {defaultModelId &&
                  !selectableForDefault.some((m) => m.model_id === defaultModelId) ? (
                    <option value={defaultModelId}>{defaultModelId} (custom)</option>
                  ) : null}
                </select>
              </CpField>
            </div>
            <CpField label={`Gateway key${runtimeRow.gateway_key_set ? " — stored" : ""}`}>
              <input
                type="password"
                className="w-full rounded-lg border px-2 py-1.5 text-sm"
                value={gatewayKey}
                onChange={(e) => setGatewayKey(e.target.value)}
                placeholder="Leave blank to keep existing"
              />
            </CpField>
            <CpField label={`OpenAI key${runtimeRow.openai_key_set ? " — stored" : ""}`}>
              <input
                type="password"
                className="w-full rounded-lg border px-2 py-1.5 text-sm"
                value={openaiKey}
                onChange={(e) => setOpenaiKey(e.target.value)}
                placeholder="Leave blank to keep existing"
              />
            </CpField>
            <CpField label={`Anthropic key${runtimeRow.anthropic_key_set ? " — stored" : ""}`}>
              <input
                type="password"
                className="w-full rounded-lg border px-2 py-1.5 text-sm"
                value={anthropicKey}
                onChange={(e) => setAnthropicKey(e.target.value)}
                placeholder="Leave blank to keep existing"
              />
            </CpField>
            <CpField label={`Gemini key${runtimeRow.gemini_key_set ? " — stored" : ""}`}>
              <input
                type="password"
                className="w-full rounded-lg border px-2 py-1.5 text-sm"
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                placeholder="Leave blank to keep existing"
              />
            </CpField>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="rounded-lg border px-3 py-1.5 text-sm" onClick={() => void testCall()}>
                Test runtime
              </button>
              {(["gemini", "gateway", "openai", "anthropic"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  className="rounded-lg border px-3 py-1.5 text-sm"
                  onClick={() => void testCall(c)}
                >
                  Test {c}
                </button>
              ))}
            </div>
          </AdminPanel>

          <AdminPanel className="space-y-3">
            <h3 className="text-sm font-semibold">Gemini safety settings</h3>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={showAdvancedSafety}
                onChange={(e) => setShowAdvancedSafety(e.target.checked)}
              />
              Advanced JSON
            </label>
            {showAdvancedSafety ? (
              <textarea
                className="min-h-[120px] w-full rounded-lg border font-mono text-xs"
                value={advancedSafetyJson}
                onChange={(e) => setAdvancedSafetyJson(e.target.value)}
              />
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {HARM_CATEGORIES.map((cat) => (
                  <CpField key={cat} label={cat.replace("HARM_CATEGORY_", "").replace(/_/g, " ")}>
                    <select
                      className="w-full rounded-lg border px-2 py-1.5 text-sm"
                      value={safety[cat] ?? "BLOCK_MEDIUM_AND_ABOVE"}
                      onChange={(e) => setSafety((p) => ({ ...p, [cat]: e.target.value }))}
                    >
                      {THRESHOLDS.map((t) => (
                        <option key={t} value={t}>
                          {t.replace(/_/g, " ").toLowerCase()}
                        </option>
                      ))}
                    </select>
                  </CpField>
                ))}
              </div>
            )}
          </AdminPanel>

          <AdminPanel className="space-y-3">
            <h3 className="text-sm font-semibold">Budgets</h3>
            <p className="text-xs text-gray-500">
              Month-to-date: ${(stats?.spend_month_usd ?? 0).toFixed(4)}
              {stats?.monthly_budget_usd ? ` / cap $${stats.monthly_budget_usd}` : ""}
            </p>
            <div className="grid gap-4 md:grid-cols-3">
              <CpField label="Daily budget (credits)">
                <input
                  type="number"
                  className="w-full rounded-lg border px-2 py-1.5 text-sm"
                  value={dailyBudgetCredits}
                  onChange={(e) => setDailyBudgetCredits(parseInt(e.target.value, 10) || 0)}
                />
              </CpField>
              <CpField label="Monthly budget (USD)">
                <input
                  type="number"
                  step="0.01"
                  className="w-full rounded-lg border px-2 py-1.5 text-sm"
                  value={monthlyBudgetUsd}
                  onChange={(e) =>
                    setMonthlyBudgetUsd(e.target.value === "" ? "" : parseFloat(e.target.value) || 0)
                  }
                />
              </CpField>
              <CpField label="Alert threshold (%)">
                <input
                  type="number"
                  min={1}
                  max={100}
                  className="w-full rounded-lg border px-2 py-1.5 text-sm"
                  value={alertThresholdPct}
                  onChange={(e) => setAlertThresholdPct(parseInt(e.target.value, 10) || 80)}
                />
              </CpField>
            </div>
          </AdminPanel>

          {(data?.direct_gemini_models?.length ?? 0) > 0 ? (
            <AdminPanel className="space-y-3">
              <h3 className="text-sm font-semibold">Direct Gemini models</h3>
              <p className="text-xs text-gray-500">
                Used when runtime is Direct Gemini. Enable lite/flash/pro independently of Gateway.
              </p>
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-gray-500">
                    <th className="py-2 pr-4">Model</th>
                    <th className="py-2 pr-4">Tier</th>
                    <th className="py-2">Enabled</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.direct_gemini_models ?? []).map((row) => (
                    <tr key={row.id} className="border-b border-gray-100">
                      <td className="py-2 pr-4 font-mono text-xs">{row.id}</td>
                      <td className="py-2 pr-4">{row.tier}</td>
                      <td className="py-2">
                        <input
                          type="checkbox"
                          checked={row.enabled}
                          onChange={(e) => void toggleDirectGemini(row, e.target.checked)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </AdminPanel>
          ) : null}

          <AdminPanel className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">Gateway model catalog</h3>
                <p className="text-xs text-gray-500">
                  Live from Vercel AI Gateway ({liveModels.length} models). Enable models for production use.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-lg border px-3 py-1.5 text-sm"
                  onClick={() => void refreshCatalog()}
                >
                  Refresh catalog
                </button>
                <input
                  className="rounded-lg border px-2 py-1.5 text-sm"
                  placeholder="Search models…"
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                />
                <select
                  className="rounded-lg border px-2 py-1.5 text-sm"
                  value={capabilityFilter}
                  onChange={(e) => setCapabilityFilter(e.target.value as (typeof CAPABILITY_FILTERS)[number])}
                >
                  {CAPABILITY_FILTERS.map((f) => (
                    <option key={f} value={f}>
                      {f === "all" ? "All types" : f}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="max-h-[480px] overflow-x-auto overflow-y-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b text-gray-500">
                    <th className="py-2 pr-4">Model</th>
                    <th className="py-2 pr-4">Name</th>
                    <th className="py-2 pr-4">Tier</th>
                    <th className="py-2 pr-4">Cost / 1k</th>
                    <th className="py-2 pr-4">24h OK</th>
                    <th className="py-2 pr-4">p95</th>
                    <th className="py-2 pr-4">Type</th>
                    <th className="py-2">Enabled</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLiveModels.map((row) => {
                    const st = catalogStats[row.id];
                    return (
                      <tr key={row.id} className="border-b border-gray-100">
                        <td className="py-2 pr-4 font-mono text-xs">{row.id}</td>
                        <td className="py-2 pr-4 text-xs text-gray-700">{row.name}</td>
                        <td className="py-2 pr-4">
                          <select
                            className="rounded border px-1 py-0.5 text-xs"
                            value={row.tier}
                            onChange={(e) => void toggleCatalog(row, row.enabled, e.target.value)}
                          >
                            {TIERS.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 pr-4 text-xs">
                          ${row.input_usd_per_1k.toFixed(5)} / ${row.output_usd_per_1k.toFixed(5)}
                        </td>
                        <td className="py-2 pr-4 text-xs">
                          {st ? `${st.success_rate}% (${st.calls_24h})` : "—"}
                        </td>
                        <td className="py-2 pr-4 text-xs">
                          {st?.p95_latency_ms != null ? `${st.p95_latency_ms}ms` : "—"}
                        </td>
                        <td className="py-2 pr-4">{row.capability}</td>
                        <td className="py-2">
                          <input
                            type="checkbox"
                            checked={row.enabled}
                            onChange={(e) => void toggleCatalog(row, e.target.checked)}
                          />
                          {!row.eval_passed_at && env === "production" ? (
                            <>
                              <span className="ml-1 text-xs text-amber-700" title="Eval required in production">
                                eval
                              </span>
                              <button
                                type="button"
                                className="ml-2 text-xs text-blue-700 underline"
                                onClick={() => void markEvalPassed(row)}
                              >
                                Mark passed
                              </button>
                            </>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-500">
              Showing {filteredLiveModels.length} of {liveModels.length} Gateway models
              {data?.gateway_catalog_source ? ` · source: ${data.gateway_catalog_source}` : ""}
            </p>
          </AdminPanel>

          <button
            type="button"
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50"
            disabled={saving}
            onClick={() => void saveRuntime({})}
          >
            {saving ? "Saving…" : "Save all settings"}
          </button>
        </>
      )}
    </div>
  );
}

/** Legacy Gemini page — redirect users to the unified AI control page. */
export function CpIntegrationGeminiRedirectPage() {
  if (typeof window !== "undefined") {
    window.location.replace("/admin/control-plane/integrations/ai");
  }
  return <p className="text-sm text-gray-500">Redirecting to AI providers…</p>;
}
