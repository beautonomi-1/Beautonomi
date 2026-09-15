import { useCallback, useEffect, useMemo, useState } from "react";
import { adminApi } from "@/lib/adminClient";
import { HARM_CATEGORIES } from "./constants";
import type { AiPlatformPayload, DirectGeminiModel, LiveModelRow } from "./types";

export function useAiPlatformState(allowed: boolean) {
  const [env, setEnv] = useState("production");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [data, setData] = useState<AiPlatformPayload | null>(null);

  const [runtime, setRuntime] = useState("vercel_gateway");
  const [defaultModelId, setDefaultModelId] = useState("");
  const [failoverEnabled, setFailoverEnabled] = useState(true);
  const [runtimeEnabled, setRuntimeEnabled] = useState(true);
  const [gatewayKey, setGatewayKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [dailyBudgetCredits, setDailyBudgetCredits] = useState(0);
  const [monthlyBudgetUsd, setMonthlyBudgetUsd] = useState<number | "">("");
  const [alertThresholdPct, setAlertThresholdPct] = useState(80);
  const [agentDailyCapUsd, setAgentDailyCapUsd] = useState<number | "">("");
  const [routingPolicyJson, setRoutingPolicyJson] = useState("");
  const [safety, setSafety] = useState<Record<string, string>>({});
  const [advancedSafetyJson, setAdvancedSafetyJson] = useState("{}");
  const [showAdvancedSafety, setShowAdvancedSafety] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState("");

  const applyPayloadToForm = useCallback((d: AiPlatformPayload) => {
    setRuntime(String(d.runtime?.runtime ?? "vercel_gateway"));
    setDefaultModelId(String(d.runtime?.default_model_id ?? ""));
    setFailoverEnabled(d.runtime?.failover_enabled !== false);
    setRuntimeEnabled(Boolean(d.runtime?.enabled));
    setDailyBudgetCredits(Number(d.module?.daily_budget_credits ?? 0));
    setMonthlyBudgetUsd(d.module?.monthly_budget_usd != null ? Number(d.module.monthly_budget_usd) : "");
    setAlertThresholdPct(Number(d.module?.alert_threshold_pct ?? 80));
    setAgentDailyCapUsd(
      d.workforce?.module?.global_daily_spend_cap_usd != null
        ? Number(d.workforce.module.global_daily_spend_cap_usd)
        : "",
    );
    setRoutingPolicyJson(d.workforce?.module?.default_routing_policy_id ?? "");
    const rawSafety = d.gemini?.safety_settings;
    if (rawSafety && typeof rawSafety === "object" && !Array.isArray(rawSafety)) {
      const map: Record<string, string> = {};
      for (const cat of HARM_CATEGORIES) {
        const entry = (rawSafety as Record<string, { threshold?: string }>)[cat];
        map[cat] = entry?.threshold ?? "BLOCK_MEDIUM_AND_ABOVE";
      }
      setSafety(map);
      setAdvancedSafetyJson(JSON.stringify(rawSafety, null, 2));
    }
    setSavedSnapshot(
      JSON.stringify({
        runtime: String(d.runtime?.runtime ?? "vercel_gateway"),
        defaultModelId: String(d.runtime?.default_model_id ?? ""),
        failoverEnabled: d.runtime?.failover_enabled !== false,
        runtimeEnabled: Boolean(d.runtime?.enabled),
        dailyBudgetCredits: Number(d.module?.daily_budget_credits ?? 0),
        monthlyBudgetUsd: d.module?.monthly_budget_usd != null ? Number(d.module.monthly_budget_usd) : "",
        alertThresholdPct: Number(d.module?.alert_threshold_pct ?? 80),
        agentDailyCapUsd: d.workforce?.module?.global_daily_spend_cap_usd ?? "",
        routingPolicyJson: d.workforce?.module?.default_routing_policy_id ?? "",
      }),
    );
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    try {
      const d = await adminApi.getJson<AiPlatformPayload>(
        `/api/admin/control-plane/integrations/ai?environment=${encodeURIComponent(env)}`,
      );
      setData(d);
      applyPayloadToForm(d);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [env, applyPayloadToForm]);

  useEffect(() => {
    if (!allowed) return;
    void load();
  }, [allowed, load]);

  const dirty = useMemo(() => {
    const current = JSON.stringify({
      runtime,
      defaultModelId,
      failoverEnabled,
      runtimeEnabled,
      dailyBudgetCredits,
      monthlyBudgetUsd,
      alertThresholdPct,
      agentDailyCapUsd,
      routingPolicyJson,
    });
    return current !== savedSnapshot || Boolean(gatewayKey || openaiKey || anthropicKey || geminiKey);
  }, [
    runtime,
    defaultModelId,
    failoverEnabled,
    runtimeEnabled,
    dailyBudgetCredits,
    monthlyBudgetUsd,
    alertThresholdPct,
    agentDailyCapUsd,
    routingPolicyJson,
    savedSnapshot,
    gatewayKey,
    openaiKey,
    anthropicKey,
    geminiKey,
  ]);

  const saveSettings = async (patch: Record<string, unknown> = {}) => {
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
        enabled: runtimeEnabled,
        runtime,
        default_model_id: defaultModelId,
        failover_enabled: failoverEnabled,
        ...patch,
        ...(gatewayKey ? { gateway_api_key_secret: gatewayKey } : {}),
        ...(openaiKey ? { openai_api_key_secret: openaiKey } : {}),
        ...(anthropicKey ? { anthropic_api_key_secret: anthropicKey } : {}),
        gemini: {
          api_key_secret: geminiKey || undefined,
          enabled: data?.gemini?.enabled ?? true,
          default_model: defaultModelId.replace(/^google\//, "") || defaultModelId,
          safety_settings,
        },
        module: {
          daily_budget_credits: dailyBudgetCredits,
          monthly_budget_usd: monthlyBudgetUsd === "" ? null : Number(monthlyBudgetUsd),
          alert_threshold_pct: alertThresholdPct,
        },
      });
      if (agentDailyCapUsd !== "" || routingPolicyJson !== (data?.workforce?.module?.default_routing_policy_id ?? "")) {
        await adminApi.putJson("/api/admin/control-plane/modules/agents", {
          environment: env,
          global_daily_spend_cap_usd: agentDailyCapUsd === "" ? null : Number(agentDailyCapUsd),
          default_routing_policy_id: routingPolicyJson.trim() || null,
        });
      }
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

  const applyPreset = async (preset: string) => {
    setSaving(true);
    setMsg(null);
    try {
      const res = await adminApi.putJson<{ catalog_skipped_eval?: string[] }>(
        "/api/admin/control-plane/integrations/ai",
        { environment: env, preset },
      );
      if (res.catalog_skipped_eval?.length) {
        setMsg(`Preset applied. Skipped in production (eval required): ${res.catalog_skipped_eval.join(", ")}`);
      } else {
        setMsg("Preset applied.");
      }
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Preset failed");
    } finally {
      setSaving(false);
    }
  };

  const toggleCatalog = async (row: LiveModelRow, enabled: boolean, tier?: string) => {
    const res = await adminApi.putJson<{ catalog_errors?: string[]; catalog_error_reason?: string }>(
      "/api/admin/control-plane/integrations/ai",
      {
        environment: env,
        catalog: [{ id: row.db_id ?? undefined, enabled, model_id: row.id, eval_passed_at: row.eval_passed_at, tier: tier ?? row.tier }],
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
      catalog: [{ id: row.db_id ?? undefined, model_id: row.id, enabled: row.enabled, tier: row.tier, eval_passed_at: new Date().toISOString() }],
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
    await adminApi.putJson("/api/admin/control-plane/integrations/ai", { environment: env, refresh_catalog: true });
    setMsg("Gateway catalog refreshed from Vercel.");
    await load();
  };

  const saveGatewayKeyOnly = async () => {
    if (!gatewayKey.trim()) return;
    setSaving(true);
    setMsg(null);
    try {
      await adminApi.putJson("/api/admin/control-plane/integrations/ai", {
        environment: env,
        gateway_api_key_secret: gatewayKey,
      });
      setGatewayKey("");
      setMsg("Gateway key saved.");
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Save failed");
      throw e;
    } finally {
      setSaving(false);
    }
  };

  const saveMonthlyBudgetOnly = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await adminApi.putJson("/api/admin/control-plane/integrations/ai", {
        environment: env,
        module: {
          monthly_budget_usd: monthlyBudgetUsd === "" ? null : Number(monthlyBudgetUsd),
        },
      });
      setMsg("Monthly budget saved.");
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Save failed");
      throw e;
    } finally {
      setSaving(false);
    }
  };

  const enableStarterWorkforce = async () => {
    const agents = data?.workforce?.agents ?? [];
    const ops = agents.find((a) => a.key === "ops-sentinel");
    const triage = agents.find((a) => a.key === "support-triage");
    if (!ops?.id || !triage?.id) {
      setMsg("Missing ops-sentinel or support-triage agent definitions.");
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      await adminApi.putJson("/api/admin/control-plane/modules/agents", {
        environment: env,
        master_enabled: true,
        shadow_mode: true,
      });
      await adminApi.putJson("/api/admin/control-plane/modules/agents", {
        environment: env,
        agent_state: { agent_id: ops.id, state: "active" },
      });
      await adminApi.putJson("/api/admin/control-plane/modules/agents", {
        environment: env,
        agent_state: { agent_id: triage.id, state: "active" },
      });
      setMsg("Workforce enabled in shadow mode.");
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Enable failed");
      throw e;
    } finally {
      setSaving(false);
    }
  };

  const testCall = async (credential?: "gemini" | "gateway" | "openai" | "anthropic"): Promise<boolean> => {
    setMsg(null);
    try {
      const r = await adminApi.postJson<Record<string, unknown>>("/api/admin/control-plane/integrations/ai/test", {
        environment: env,
        credential,
      });
      const ok = Boolean(r.success);
      setMsg(
        ok
          ? `Test OK (${String(r.credential)}) — ${String(r.model)} in ${String(r.latency_ms)}ms`
          : `Test failed (${String(r.credential)}): ${String(r.error_code ?? "unknown")}`,
      );
      return ok;
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Test failed");
      return false;
    }
  };

  const saveAgentModule = async (patch: Record<string, unknown>) => {
    setSaving(true);
    try {
      await adminApi.putJson("/api/admin/control-plane/modules/agents", { environment: env, ...patch });
      setMsg("Workforce settings updated.");
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const saveAgentBrain = async (agentId: string, patch: Record<string, unknown>) => {
    setSaving(true);
    try {
      await adminApi.putJson("/api/admin/control-plane/modules/agents", {
        environment: env,
        agent_brain: { agent_id: agentId, ...patch },
      });
      setMsg("Agent brain updated.");
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const saveAgentState = async (agentId: string, state: string) => {
    setSaving(true);
    try {
      await adminApi.putJson("/api/admin/control-plane/modules/agents", {
        environment: env,
        agent_state: { agent_id: agentId, state },
      });
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return {
    env,
    setEnv,
    loading,
    saving,
    msg,
    setMsg,
    data,
    load,
    dirty,
    saveSettings,
    applyPreset,
    toggleCatalog,
    markEvalPassed,
    toggleDirectGemini,
    refreshCatalog,
    saveGatewayKeyOnly,
    saveMonthlyBudgetOnly,
    enableStarterWorkforce,
    testCall,
    saveAgentModule,
    saveAgentBrain,
    saveAgentState,
    runtime,
    setRuntime,
    defaultModelId,
    setDefaultModelId,
    failoverEnabled,
    setFailoverEnabled,
    runtimeEnabled,
    setRuntimeEnabled,
    gatewayKey,
    setGatewayKey,
    openaiKey,
    setOpenaiKey,
    anthropicKey,
    setAnthropicKey,
    geminiKey,
    setGeminiKey,
    dailyBudgetCredits,
    setDailyBudgetCredits,
    monthlyBudgetUsd,
    setMonthlyBudgetUsd,
    alertThresholdPct,
    setAlertThresholdPct,
    agentDailyCapUsd,
    setAgentDailyCapUsd,
    routingPolicyJson,
    setRoutingPolicyJson,
    safety,
    setSafety,
    advancedSafetyJson,
    setAdvancedSafetyJson,
    showAdvancedSafety,
    setShowAdvancedSafety,
  };
}
