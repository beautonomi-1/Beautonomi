#!/usr/bin/env node
/**
 * Seed global AI Platform + agent workforce for end-to-end operation.
 *
 * - Syncs live Vercel AI Gateway model IDs (cheap stack, failover, safeguard, embeddings)
 * - Enables global runtime + catalog (preserves existing gateway key unless AI_GATEWAY_API_KEY set)
 * - Turns on agent module (master + shadow) and activates all 11 agents
 *
 * Required:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Optional:
 *   AI_GATEWAY_API_KEY — writes ai_runtime_config.gateway_api_key_secret on global rows
 *   SEED_ENVIRONMENTS  — comma-separated (default: production,staging,development)
 *
 * Usage:
 *   pnpm seed:ai-platform
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GATEWAY_KEY = process.env.AI_GATEWAY_API_KEY?.trim() || null;
const ENVIRONMENTS = (process.env.SEED_ENVIRONMENTS ?? "production,staging,development")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const CHEAP_ROUTING_POLICY = JSON.stringify({
  defaultTier: "lite",
  taskTier: { complex_reasoning: "flash", copilot: "flash" },
});

const GATEWAY_MODELS_URL = "https://ai-gateway.vercel.sh/v1/models";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("[seed-ai-platform] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(2);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function pickLatest(models, provider, predicate) {
  const matches = models
    .filter((m) => m.provider === provider && predicate(m))
    .sort((a, b) => (b.released ?? 0) - (a.released ?? 0));
  return matches[0] ?? null;
}

function inferCapability(raw) {
  const type = raw.type ?? "language";
  if (type === "embedding") return "embedding";
  if (type === "image") return "vision";
  if ((raw.tags ?? []).includes("vision")) return "vision";
  return "chat";
}

function modelHasVision(m) {
  return m.capability === "vision" || (m.tags ?? []).includes("vision");
}

async function fetchLiveGatewayModels() {
  const res = await fetch(GATEWAY_MODELS_URL, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Gateway models fetch failed: ${res.status}`);
  const json = await res.json();
  const data = Array.isArray(json?.data) ? json.data : [];
  return data.map((raw) => ({
    id: raw.id,
    provider: raw.id.includes("/") ? raw.id.split("/")[0] : raw.owned_by ?? "unknown",
    capability: inferCapability(raw),
    tags: raw.tags ?? [],
    released: raw.released ?? null,
  }));
}

function resolveCheapPresetModels(live) {
  const lite =
    pickLatest(live, "alibaba", (m) => modelHasVision(m) && /qwen.*flash/i.test(m.id)) ??
    pickLatest(live, "alibaba", (m) => modelHasVision(m)) ??
    pickLatest(live, "alibaba", (m) => /qwen.*flash/i.test(m.id));
  const flash =
    pickLatest(live, "deepseek", (m) => /v4.*flash|v3\.2.*flash|flash/i.test(m.id)) ??
    pickLatest(live, "zai", (m) => /glm.*flash/i.test(m.id)) ??
    pickLatest(live, "deepseek", (m) => m.capability === "chat");
  const pro =
    pickLatest(live, "alibaba", (m) => /qwen3-max|qwen.*max/i.test(m.id)) ??
    pickLatest(live, "zai", (m) => /glm/i.test(m.id) && !/flash/i.test(m.id));
  const safeguard = pickLatest(live, "openai", (m) => /gpt-oss-safeguard/i.test(m.id));
  const embedding =
    pickLatest(live, "openai", (m) => m.capability === "embedding" && /text-embedding-3-small/i.test(m.id)) ??
    pickLatest(live, "openai", (m) => m.capability === "embedding");

  const enableModels = [];
  if (lite) enableModels.push({ modelId: lite.id, tier: "lite", capability: "chat" });
  if (flash) enableModels.push({ modelId: flash.id, tier: "flash", capability: "chat" });
  if (pro) enableModels.push({ modelId: pro.id, tier: "pro", capability: "chat" });
  if (safeguard) enableModels.push({ modelId: safeguard.id, tier: "flash", capability: "chat" });
  if (embedding) enableModels.push({ modelId: embedding.id, tier: "lite", capability: "embedding" });

  return {
    defaultModelId: lite?.id ?? flash?.id ?? "alibaba/qwen3.7-flash",
    enableModels,
  };
}

async function upsertCatalog(environment, modelId, { tier, capability, enabled }) {
  const provider = modelId.includes("/") ? modelId.split("/")[0] : "unknown";
  const { data: existing } = await supabase
    .from("ai_model_catalog")
    .select("id")
    .eq("environment", environment)
    .is("tenant_id", null)
    .eq("model_id", modelId)
    .maybeSingle();

  const payload = {
    environment,
    tenant_id: null,
    model_id: modelId,
    provider,
    tier,
    capability,
    gateway: true,
    enabled,
    eval_passed_at: enabled ? new Date().toISOString() : undefined,
    updated_at: new Date().toISOString(),
  };

  if (existing?.id) {
    await supabase.from("ai_model_catalog").update(payload).eq("id", existing.id);
  } else {
    await supabase.from("ai_model_catalog").insert(payload);
  }
}

async function seedEnvironment(environment, plan) {
  console.log(`[seed-ai-platform] ${environment}…`);

  const runtimePayload = {
    tenant_id: null,
    environment,
    enabled: true,
    runtime: "vercel_gateway",
    default_model_id: plan.defaultModelId,
    failover_enabled: true,
    updated_at: new Date().toISOString(),
  };
  if (GATEWAY_KEY) runtimePayload.gateway_api_key_secret = GATEWAY_KEY;

  const { data: runtimeRow } = await supabase
    .from("ai_runtime_config")
    .select("id, gateway_api_key_secret")
    .eq("environment", environment)
    .is("tenant_id", null)
    .maybeSingle();

  if (runtimeRow?.id) {
    const update = { ...runtimePayload };
    if (!GATEWAY_KEY) delete update.gateway_api_key_secret;
    await supabase.from("ai_runtime_config").update(update).eq("id", runtimeRow.id);
  } else {
    await supabase.from("ai_runtime_config").insert(runtimePayload);
  }

  const enabledIds = new Set(plan.enableModels.map((m) => m.modelId));
  for (const entry of plan.enableModels) {
    await upsertCatalog(environment, entry.modelId, {
      tier: entry.tier,
      capability: entry.capability,
      enabled: true,
    });
  }

  // Disable direct Gemini + non-cheap gateway chat models
  const legacyDisable = new Set([
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "google/gemini-2.5-flash-lite",
    "google/gemini-2.5-flash",
    "openai/gpt-4.1-mini",
    "anthropic/claude-sonnet-4.5",
  ]);
  const { data: catalogRows } = await supabase
    .from("ai_model_catalog")
    .select("id, model_id, gateway")
    .eq("environment", environment)
    .is("tenant_id", null);

  for (const row of catalogRows ?? []) {
    const isDirectGemini = !row.gateway && String(row.model_id).startsWith("gemini-");
    if (isDirectGemini || legacyDisable.has(row.model_id)) {
      await supabase
        .from("ai_model_catalog")
        .update({ enabled: false, updated_at: new Date().toISOString() })
        .eq("id", row.id);
    }
  }

  const { data: aiMod } = await supabase
    .from("ai_module_config")
    .select("id")
    .eq("environment", environment)
    .is("tenant_id", null)
    .maybeSingle();
  if (aiMod?.id) {
    await supabase
      .from("ai_module_config")
      .update({ enabled: true, updated_at: new Date().toISOString() })
      .eq("id", aiMod.id);
  } else {
    await supabase.from("ai_module_config").insert({
      environment,
      tenant_id: null,
      enabled: true,
      daily_budget_credits: 0,
      max_tokens: 800,
    });
  }

  await supabase.from("agent_module_config").upsert(
    {
      environment,
      master_enabled: true,
      shadow_mode: true,
      default_routing_policy_id: CHEAP_ROUTING_POLICY,
      global_daily_spend_cap_usd: environment === "production" ? 25 : 5,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "environment" },
  );

  const taskDefaultByKey = {
    "ops-sentinel": "classification",
    "support-triage": "classification",
    "support-lead": "drafting",
    "payout-review": "classification",
    "reconciliation-investigator": "classification",
    "refund-specialist": "classification",
    "provider-success": "drafting",
    "membership-shepherd": "drafting",
    "trust-monitor": "classification",
    "content-moderator": "classification",
    "admin-copilot": "copilot",
  };

  const { data: agents } = await supabase.from("agent_definitions").select("id, key");
  for (const agent of agents ?? []) {
    const taskDefault = taskDefaultByKey[agent.key];
    if (taskDefault) {
      await supabase
        .from("agent_definitions")
        .update({
          preferred_model_id: null,
          fallback_model_id: null,
          max_cost_usd_per_run: 0.25,
          task_default: taskDefault,
          vision_enabled: agent.key === "content-moderator",
        })
        .eq("id", agent.id);
    }
    await supabase.from("agent_operational_state").upsert(
      { agent_id: agent.id, state: "active", updated_at: new Date().toISOString() },
      { onConflict: "agent_id" },
    );
  }

  await supabase.from("ai_emergency_controls").update({
    stop_all_calls: false,
    force_template_fallback: false,
    disable_streaming: false,
    disable_vision: false,
    disable_embeddings: false,
  }).eq("environment", environment);

  await supabase.from("agent_emergency_controls").update({
    stop_new_runs: false,
    stop_all_tool_calls: false,
    block_approved_execution: false,
    freeze_pending_proposals: false,
    activated_by: null,
    activated_at: null,
    reason: null,
  }).eq("environment", environment);

  console.log(
    `[seed-ai-platform] ${environment}: default=${plan.defaultModelId}, enabled=[${[...enabledIds].join(", ")}], agents=${agents?.length ?? 0} active`,
  );
}

async function main() {
  console.log("[seed-ai-platform] Fetching live Gateway catalog…");
  const live = await fetchLiveGatewayModels();
  const plan = resolveCheapPresetModels(live);
  if (!plan.enableModels.length) {
    console.warn("[seed-ai-platform] No live cheap models matched — using migration fallbacks only.");
  }

  for (const env of ENVIRONMENTS) {
    await seedEnvironment(env, plan);
  }

  if (!GATEWAY_KEY) {
    console.warn(
      "[seed-ai-platform] AI_GATEWAY_API_KEY not set — existing gateway_api_key_secret preserved. Set the env var to rotate/update the key.",
    );
  }

  console.log("[seed-ai-platform] Done. Agents run in shadow mode (proposals only). Disable shadow_mode after review.");
}

main().catch((err) => {
  console.error("[seed-ai-platform] Failed:", err);
  process.exit(1);
});
