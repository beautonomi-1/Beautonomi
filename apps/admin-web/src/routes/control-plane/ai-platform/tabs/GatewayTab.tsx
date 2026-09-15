import { useEffect, useMemo, useState } from "react";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { CpField } from "../../cpShared";
import { ConfirmModal } from "../ConfirmModal";
import { ModelCatalogPicker } from "../ModelCatalogPicker";
import { buildDefaultModelPickerOptions, countEnabledLiveModels } from "../catalogModels";
import { CAPABILITY_FILTERS, PRESETS, PRESET_HINTS, RUNTIMES, TIERS } from "../constants";
import type { AiPlatformPayload, DirectGeminiModel, LiveModelRow } from "../types";

function groupByProvider<T extends { provider: string }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const list = map.get(row.provider) ?? [];
    list.push(row);
    map.set(row.provider, list);
  }
  return map;
}

export function GatewayTab(props: {
  env: string;
  data: AiPlatformPayload;
  runtime: string;
  setRuntime: (v: string) => void;
  defaultModelId: string;
  setDefaultModelId: (v: string) => void;
  failoverEnabled: boolean;
  setFailoverEnabled: (v: boolean) => void;
  runtimeEnabled: boolean;
  setRuntimeEnabled: (v: boolean) => void;
  gatewayKey: string;
  setGatewayKey: (v: string) => void;
  openaiKey: string;
  setOpenaiKey: (v: string) => void;
  anthropicKey: string;
  setAnthropicKey: (v: string) => void;
  geminiKey: string;
  setGeminiKey: (v: string) => void;
  onApplyPreset: (preset: string) => void;
  onTest: (credential?: "gemini" | "gateway" | "openai" | "anthropic") => void;
  onToggleCatalog: (row: LiveModelRow, enabled: boolean, tier?: string) => void;
  onMarkEval: (row: LiveModelRow) => void;
  onToggleDirectGemini: (model: DirectGeminiModel, enabled: boolean) => void;
  onRefreshCatalog: () => void;
  saving: boolean;
}) {
  const [catalogSearch, setCatalogSearch] = useState("");
  const [capabilityFilter, setCapabilityFilter] = useState<(typeof CAPABILITY_FILTERS)[number]>("all");
  const [showAllProviders, setShowAllProviders] = useState(false);
  const [enabledOnly, setEnabledOnly] = useState(true);
  const [presetConfirm, setPresetConfirm] = useState<string | null>(null);
  const [collapsedProviders, setCollapsedProviders] = useState<Set<string>>(new Set());

  const runtimeRow = props.data.runtime ?? {};
  const catalogStats = props.data.stats?.catalog_stats ?? {};
  const liveModels = props.data.live_models ?? [];
  const enabledCatalogCount = countEnabledLiveModels(liveModels);

  useEffect(() => {
    if (enabledCatalogCount === 0) setEnabledOnly(false);
  }, [enabledCatalogCount]);

  const defaultModelOptions = useMemo(
    () =>
      buildDefaultModelPickerOptions({
        runtime: props.runtime,
        liveModels,
        directGeminiModels: props.data.direct_gemini_models ?? [],
        selectableModels: props.data.selectable_models ?? [],
      }),
    [props.runtime, liveModels, props.data.direct_gemini_models, props.data.selectable_models],
  );

  const filteredLiveModels = useMemo(() => {
    return liveModels.filter((m) => {
      if (enabledOnly && !m.enabled) return false;
      if (capabilityFilter !== "all" && m.capability !== capabilityFilter) return false;
      const q = catalogSearch.trim().toLowerCase();
      if (!q) return true;
      return m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q) || m.provider.toLowerCase().includes(q);
    });
  }, [liveModels, enabledOnly, capabilityFilter, catalogSearch]);

  const grouped = useMemo(() => groupByProvider(filteredLiveModels), [filteredLiveModels]);
  const displayGroups = showAllProviders ? grouped : new Map([...grouped.entries()].slice(0, 8));

  return (
    <div className="space-y-4">
      <AdminPanel className="space-y-2">
        <h3 className="text-sm font-semibold">Vercel AI Gateway</h3>
        <p className="text-xs text-gray-600">
          Runtime calls use the OpenAI-compatible endpoint at{" "}
          <code className="rounded bg-gray-100 px-1">https://ai-gateway.vercel.sh/v1</code> with your Gateway API key.
          Model IDs use <code className="rounded bg-gray-100 px-1">provider/model</code> format.
        </p>
      </AdminPanel>

      <AdminPanel className="space-y-3">
        <h3 className="text-sm font-semibold">Presets</h3>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              title={PRESET_HINTS[p.id]}
              className="rounded-lg border px-3 py-1.5 text-sm"
              onClick={() => setPresetConfirm(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </AdminPanel>

      <AdminPanel className="space-y-4">
        <h3 className="text-sm font-semibold">Runtime & credentials</h3>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={props.runtimeEnabled} onChange={(e) => props.setRuntimeEnabled(e.target.checked)} />
          AI runtime enabled
        </label>
        <div className="grid gap-4 md:grid-cols-2">
          <CpField label="Runtime">
            <select className="w-full rounded-lg border px-2 py-1.5 text-sm" value={props.runtime} onChange={(e) => props.setRuntime(e.target.value)}>
              {RUNTIMES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </CpField>
          <CpField label="Default model">
            <ModelCatalogPicker
              models={defaultModelOptions}
              value={props.defaultModelId}
              onChange={props.setDefaultModelId}
              className="w-full rounded-lg border px-2 py-1.5 font-mono text-sm"
            />
            {props.runtime === "vercel_gateway" ? (
              <p className="mt-1 text-xs text-gray-500">
                Lists all chat/vision models from the live Vercel catalog ({defaultModelOptions.length}). Enable a model
                in the catalog below before using it in production.
              </p>
            ) : null}
          </CpField>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={props.failoverEnabled} onChange={(e) => props.setFailoverEnabled(e.target.checked)} />
          Failover enabled (cheaper same-tier model on timeout/breaker)
        </label>
        <CpField label={`Gateway key${runtimeRow.gateway_key_set ? " — stored" : ""}${runtimeRow.gateway_key_preview ? ` (${String(runtimeRow.gateway_key_preview)})` : ""}`}>
          <input type="password" className="w-full rounded-lg border px-2 py-1.5 text-sm" value={props.gatewayKey} onChange={(e) => props.setGatewayKey(e.target.value)} placeholder="Paste Vercel AI Gateway key" />
        </CpField>
        <CpField label={`OpenAI key${runtimeRow.openai_key_set ? " — stored" : ""}`}>
          <input type="password" className="w-full rounded-lg border px-2 py-1.5 text-sm" value={props.openaiKey} onChange={(e) => props.setOpenaiKey(e.target.value)} placeholder="Optional direct OpenAI" />
        </CpField>
        <CpField label={`Anthropic key${runtimeRow.anthropic_key_set ? " — stored" : ""}`}>
          <input type="password" className="w-full rounded-lg border px-2 py-1.5 text-sm" value={props.anthropicKey} onChange={(e) => props.setAnthropicKey(e.target.value)} placeholder="Optional direct Anthropic" />
        </CpField>
        <CpField label={`Gemini key${runtimeRow.gemini_key_set ? " — stored" : ""}`}>
          <input type="password" className="w-full rounded-lg border px-2 py-1.5 text-sm" value={props.geminiKey} onChange={(e) => props.setGeminiKey(e.target.value)} placeholder="Fallback / direct_gemini" />
        </CpField>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="rounded-lg border px-3 py-1.5 text-sm" onClick={() => props.onTest()}>Test runtime</button>
          {(["gateway", "gemini", "openai", "anthropic"] as const).map((c) => (
            <button key={c} type="button" className="rounded-lg border px-3 py-1.5 text-sm" onClick={() => props.onTest(c)}>Test {c}</button>
          ))}
        </div>
      </AdminPanel>

      {props.runtime === "direct_gemini" && (props.data.direct_gemini_models?.length ?? 0) > 0 ? (
        <AdminPanel>
          <h3 className="mb-2 text-sm font-semibold">Direct Gemini models</h3>
          <table className="min-w-full text-left text-sm">
            <thead><tr className="border-b text-gray-500"><th className="py-2">Model</th><th className="py-2">Tier</th><th className="py-2">Enabled</th></tr></thead>
            <tbody>
              {(props.data.direct_gemini_models ?? []).map((row) => (
                <tr key={row.id} className="border-b border-gray-100">
                  <td className="py-2 font-mono text-xs">{row.id}</td>
                  <td className="py-2">{row.tier}</td>
                  <td className="py-2"><input type="checkbox" checked={row.enabled} onChange={(e) => props.onToggleDirectGemini(row, e.target.checked)} /></td>
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
            <p className="text-xs text-gray-500">Live from Vercel ({liveModels.length} models). Cached 15 minutes.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="rounded-lg border px-3 py-1.5 text-sm" onClick={props.onRefreshCatalog}>Refresh catalog</button>
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={enabledOnly} onChange={(e) => setEnabledOnly(e.target.checked)} /> Enabled only</label>
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={showAllProviders} onChange={(e) => setShowAllProviders(e.target.checked)} /> Expand all providers</label>
            <input className="rounded-lg border px-2 py-1.5 text-sm" placeholder="Search…" value={catalogSearch} onChange={(e) => setCatalogSearch(e.target.value)} />
            <select className="rounded-lg border px-2 py-1.5 text-sm" value={capabilityFilter} onChange={(e) => setCapabilityFilter(e.target.value as typeof capabilityFilter)}>
              {CAPABILITY_FILTERS.map((f) => <option key={f} value={f}>{f === "all" ? "All types" : f}</option>)}
            </select>
          </div>
        </div>
        {[...displayGroups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([provider, rows]) => {
          const collapsed = collapsedProviders.has(provider);
          return (
            <div key={provider} className="border rounded-lg">
              <button type="button" className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium" onClick={() => {
                const next = new Set(collapsedProviders);
                if (next.has(provider)) next.delete(provider); else next.add(provider);
                setCollapsedProviders(next);
              }}>
                <span>{provider} ({rows.length})</span>
                <span>{collapsed ? "▸" : "▾"}</span>
              </button>
              {!collapsed ? (
                <div className="overflow-x-auto border-t">
                  <table className="min-w-full text-left text-sm">
                    <thead><tr className="border-b text-gray-500 text-xs"><th className="p-2">Model</th><th className="p-2">Tier</th><th className="p-2">$/1k</th><th className="p-2">24h</th><th className="p-2">On</th></tr></thead>
                    <tbody>
                      {rows.map((row) => {
                        const st = catalogStats[row.id];
                        return (
                          <tr key={row.id} className="border-b border-gray-50">
                            <td className="p-2 font-mono text-xs">{row.id}</td>
                            <td className="p-2">
                              <select className="rounded border text-xs" value={row.tier} onChange={(e) => props.onToggleCatalog(row, row.enabled, e.target.value)}>
                                {TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
                              </select>
                            </td>
                            <td className="p-2 text-xs">${row.input_usd_per_1k.toFixed(5)}</td>
                            <td className="p-2 text-xs">{st ? `${st.success_rate}%` : "—"}</td>
                            <td className="p-2">
                              <input type="checkbox" checked={row.enabled} onChange={(e) => props.onToggleCatalog(row, e.target.checked)} />
                              {!row.eval_passed_at && props.env === "production" ? (
                                <button type="button" className="ml-1 text-xs text-blue-700 underline" onClick={() => props.onMarkEval(row)}>eval</button>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          );
        })}
        <p className="text-xs text-gray-500">
          Showing {filteredLiveModels.length} of {liveModels.length} models
          {enabledCatalogCount === 0 && enabledOnly ? " — none enabled yet; uncheck Enabled only to browse" : ""}
        </p>
      </AdminPanel>

      <ConfirmModal
        open={presetConfirm != null}
        title="Apply preset?"
        body={
          presetConfirm ? (
            <div className="space-y-2">
              <p>{PRESET_HINTS[presetConfirm]}</p>
              <p className="text-xs text-gray-500">This updates runtime and catalog enable flags immediately. In production, models without eval may be skipped.</p>
            </div>
          ) : null
        }
        confirmLabel="Apply preset"
        busy={props.saving}
        onCancel={() => setPresetConfirm(null)}
        onConfirm={() => {
          if (presetConfirm) props.onApplyPreset(presetConfirm);
          setPresetConfirm(null);
        }}
      />
    </div>
  );
}
