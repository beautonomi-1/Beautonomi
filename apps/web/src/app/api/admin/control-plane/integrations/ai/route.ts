import { NextRequest } from "next/server";
import { requireAdminSection, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PLATFORM_CONFIG } from "@/lib/admin-sections";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { writeConfigChangeLog } from "@/lib/config/config-change-log";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";
import { fetchScopedSingle, resolveAdminTenantContext } from "@/lib/tenant/scoped-overrides";
import { toSafeAiRuntimeRow, toSafeEmergencyRow } from "@/lib/ai/safe-config";
import { invalidateAiRuntimeCache } from "@/lib/ai/resolve-runtime";
import { canEnableCatalogModel } from "@/lib/ai/eval-gate";
import { clearModelPricingCache } from "@/lib/ai/pricing";
import {
  buildMergedCatalog,
  selectableChatCatalogEntries,
  type DbCatalogRow,
} from "@/lib/ai/merge-catalog";
import {
  fetchLiveGatewayModels,
  pickLatestGatewayModel,
  invalidateGatewayModelsCache,
  modelHasVision,
  type LiveGatewayModel,
} from "@/lib/ai/gateway-models";
import { upsertCatalogPreference } from "@/lib/ai/catalog-prefs";
import { GEMINI_MODELS } from "@beautonomi/agent-model-router";

const ENVS = ["production", "staging", "development"];

function parseEnv(s: string | null): string {
  if (s && ENVS.includes(s)) return s;
  return "production";
}

function toSafeGemini(row: Record<string, unknown> | null) {
  if (!row) return null;
  return {
    enabled: Boolean(row.enabled),
    default_model: row.default_model,
    api_key_set: Boolean(row.api_key_secret),
    safety_settings: row.safety_settings ?? {},
  };
}

async function loadStats(environment: string, moduleConfig: Record<string, unknown> | null) {
  const supabase = getSupabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 7)}-01`;
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [{ data: spendRows }, { data: monthRows }, { count: failCount }, { data: catalog }, { data: usage24h }] =
    await Promise.all([
      supabase.from("ai_usage_log").select("cost_estimate").gte("created_at", `${today}T00:00:00Z`),
      supabase.from("ai_usage_log").select("cost_estimate").gte("created_at", `${monthStart}T00:00:00Z`),
      supabase
        .from("ai_usage_log")
        .select("id", { count: "exact", head: true })
        .eq("success", false)
        .gte("created_at", hourAgo),
      supabase
        .from("ai_model_catalog")
        .select("id, enabled, model_id")
        .eq("environment", environment)
        .is("tenant_id", null),
      supabase
        .from("ai_usage_log")
        .select("model, success, latency_ms")
        .gte("created_at", dayAgo),
    ]);

  const spendToday = (spendRows ?? []).reduce(
    (sum, r) => sum + Number((r as { cost_estimate?: number }).cost_estimate ?? 0),
    0,
  );
  const spendMonth = (monthRows ?? []).reduce(
    (sum, r) => sum + Number((r as { cost_estimate?: number }).cost_estimate ?? 0),
    0,
  );
  const modelsEnabled = (catalog ?? []).filter((c) => (c as { enabled?: boolean }).enabled).length;
  const monthlyCap = Number(moduleConfig?.monthly_budget_usd ?? 0);

  const byModel = new Map<string, { total: number; ok: number; latencies: number[] }>();
  for (const row of usage24h ?? []) {
    const r = row as { model?: string; success?: boolean; latency_ms?: number | null };
    const model = r.model ?? "unknown";
    const bucket = byModel.get(model) ?? { total: 0, ok: 0, latencies: [] };
    bucket.total += 1;
    if (r.success) bucket.ok += 1;
    if (r.latency_ms != null) bucket.latencies.push(r.latency_ms);
    byModel.set(model, bucket);
  }

  const catalog_stats: Record<string, { success_rate: number; p95_latency_ms: number | null; calls_24h: number }> =
    {};
  for (const [model, bucket] of byModel) {
    bucket.latencies.sort((a, b) => a - b);
    const p95Idx = bucket.latencies.length
      ? Math.min(bucket.latencies.length - 1, Math.floor(bucket.latencies.length * 0.95))
      : -1;
    catalog_stats[model] = {
      calls_24h: bucket.total,
      success_rate: bucket.total ? Math.round((bucket.ok / bucket.total) * 1000) / 10 : 0,
      p95_latency_ms: p95Idx >= 0 ? bucket.latencies[p95Idx] : null,
    };
  }

  return {
    spend_today_usd: Math.round(spendToday * 1_000_000) / 1_000_000,
    spend_month_usd: Math.round(spendMonth * 1_000_000) / 1_000_000,
    monthly_budget_usd: monthlyCap || null,
    failed_calls_last_hour: failCount ?? 0,
    models_enabled: modelsEnabled,
    catalog_stats,
  };
}

/** GET /api/admin/control-plane/integrations/ai */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_PLATFORM_CONFIG, request);
    const { searchParams } = new URL(request.url);
    const environment = parseEnv(searchParams.get("environment"));
    const supabase = getSupabaseAdmin();
    const { currentTenantId, requestedScope } = await resolveAdminTenantContext(
      request,
      undefined,
      user.role ?? null,
    );
    const readTenantId =
      requestedScope.scope === "global" ? "" : requestedScope.tenantId ?? currentTenantId;

    const runtimeScoped = await fetchScopedSingle<Record<string, unknown>>({
      supabase,
      table: "ai_runtime_config",
      tenantId: readTenantId,
      select: "*",
      apply: (q) => q.eq("environment", environment),
    });

    const geminiScoped = await fetchScopedSingle<Record<string, unknown>>({
      supabase,
      table: "gemini_integration_config",
      tenantId: readTenantId,
      select: "*",
      apply: (q) => q.eq("environment", environment),
    });

    const [{ data: emergency }, { data: catalog }, { data: pricing }, { data: moduleConfig }] =
      await Promise.all([
        supabase.from("ai_emergency_controls").select("*").eq("environment", environment).maybeSingle(),
        supabase
          .from("ai_model_catalog")
          .select("*")
          .eq("environment", environment)
          .is("tenant_id", readTenantId ? readTenantId : null),
        supabase.from("ai_model_pricing").select("*").eq("is_active", true).order("model"),
        supabase.from("ai_module_config").select("*").eq("environment", environment).maybeSingle(),
      ]);

    const runtimeRow = runtimeScoped.data as Record<string, unknown> | null;
    const geminiRow = geminiScoped.data as Record<string, unknown> | null;
    const safeRuntime = toSafeAiRuntimeRow(
      runtimeRow
        ? { ...runtimeRow, gemini_api_key_set: Boolean(geminiRow?.api_key_secret) }
        : {
            enabled: Boolean(geminiRow?.enabled),
            runtime: "direct_gemini",
            default_model_id: geminiRow?.default_model ?? "gemini-2.5-flash-lite",
            failover_enabled: true,
            gemini_api_key_set: Boolean(geminiRow?.api_key_secret),
          },
    );

    const stats = await loadStats(environment, moduleConfig as Record<string, unknown> | null);

    const dbCatalogRows: DbCatalogRow[] = (catalog ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      return {
        id: r.id as string | undefined,
        model_id: String(r.model_id),
        provider: r.provider as string | undefined,
        tier: r.tier as string | undefined,
        capability: r.capability as string | undefined,
        gateway: r.gateway as boolean | undefined,
        enabled: r.enabled as boolean | undefined,
        eval_passed_at: (r.eval_passed_at as string | null | undefined) ?? null,
      };
    });
    const merged = await buildMergedCatalog({
      dbRows: dbCatalogRows,
      runtime: (safeRuntime.runtime as "direct_gemini" | "vercel_gateway" | "direct_openai" | "direct_anthropic") ??
        "vercel_gateway",
    });
    const selectable = selectableChatCatalogEntries(merged);

    return successResponse({
      runtime: safeRuntime,
      emergency: toSafeEmergencyRow(emergency as Record<string, unknown> | null),
      /** @deprecated use live_models — kept for older admin builds */
      catalog: merged.liveModels.map((m) => ({
        id: m.db_id,
        model_id: m.id,
        provider: m.provider,
        tier: m.tier,
        capability: m.capability,
        gateway: true,
        enabled: m.enabled,
        eval_passed_at: m.eval_passed_at,
      })),
      live_models: merged.liveModels,
      selectable_models: selectable.map((m) => ({ model_id: m.id, provider: m.provider, tier: m.tier, gateway: m.gateway })),
      direct_gemini_models: merged.directGeminiModels,
      gemini: toSafeGemini(geminiRow),
      pricing: pricing ?? [],
      module: moduleConfig,
      stats,
      gateway_catalog_source: "vercel_ai_gateway",
    });
  } catch (error) {
    return handleApiError(error as Error, "Failed to fetch AI config");
  }
}

type AiPreset = "gemini_only" | "gateway_balanced" | "gateway_premium" | "gateway_cheap_global";

type PresetPlan = {
  runtime: "direct_gemini" | "vercel_gateway";
  default_model_id: string;
  enableModels: Array<{ modelId: string; tier: "lite" | "flash" | "pro" }>;
  disableAllGateway: boolean;
};

async function resolvePreset(preset: AiPreset): Promise<PresetPlan> {
  const live = await fetchLiveGatewayModels();
  const googleLite =
    pickLatestGatewayModel(live, "google", (m) => m.capability === "chat" && /lite|flash-lite/i.test(m.id)) ??
    pickLatestGatewayModel(live, "google", (m) => m.capability === "chat");
  const googleFlash =
    pickLatestGatewayModel(live, "google", (m) => m.capability === "chat" && /flash/i.test(m.id)) ?? googleLite;
  const openaiMini =
    pickLatestGatewayModel(live, "openai", (m) => m.capability === "chat" && /mini|small/i.test(m.id)) ??
    pickLatestGatewayModel(live, "openai", (m) => m.capability === "chat");
  const anthropicSonnet =
    pickLatestGatewayModel(live, "anthropic", (m) => m.capability === "chat" && /sonnet/i.test(m.id)) ??
    pickLatestGatewayModel(live, "anthropic", (m) => m.capability === "chat");

  if (preset === "gemini_only") {
    return {
      runtime: "direct_gemini",
      default_model_id: GEMINI_MODELS.flashLite,
      enableModels: [
        { modelId: GEMINI_MODELS.flashLite, tier: "lite" },
        { modelId: GEMINI_MODELS.flash, tier: "flash" },
        { modelId: GEMINI_MODELS.pro, tier: "pro" },
      ],
      disableAllGateway: true,
    };
  }

  if (preset === "gateway_cheap_global") {
    const lite =
      pickLatestGatewayModel(live, "alibaba", (m) => modelHasVision(m) && /qwen.*flash/i.test(m.id)) ??
      pickLatestGatewayModel(live, "alibaba", (m) => modelHasVision(m));
    const flash =
      pickLatestGatewayModel(live, "deepseek", (m) => /v4.*flash/i.test(m.id)) ??
      pickLatestGatewayModel(live, "zai", (m) => /glm-5\.3-flash/i.test(m.id)) ??
      pickLatestGatewayModel(live, "deepseek", (m) => m.capability === "chat");
    const pro =
      pickLatestGatewayModel(live, "alibaba", (m) => /qwen3-max|qwen.*max/i.test(m.id)) ??
      pickLatestGatewayModel(live, "zai", (m) => /glm-5\.3(?!.*flash)/i.test(m.id));
    const safeguard = pickLatestGatewayModel(live, "openai", (m) => /gpt-oss-safeguard/i.test(m.id));
    const enableModels: PresetPlan["enableModels"] = [];
    if (lite) enableModels.push({ modelId: lite.id, tier: "lite" });
    if (flash) enableModels.push({ modelId: flash.id, tier: "flash" });
    if (pro) enableModels.push({ modelId: pro.id, tier: "pro" });
    if (safeguard) enableModels.push({ modelId: safeguard.id, tier: "flash" });
    return {
      runtime: "vercel_gateway",
      default_model_id: lite?.id ?? flash?.id ?? "alibaba/qwen3.7-flash",
      enableModels,
      disableAllGateway: false,
    };
  }

  if (preset === "gateway_balanced") {
    const enableModels = [googleLite, googleFlash, openaiMini]
      .filter(Boolean)
      .map((m, i) => ({ modelId: m!.id, tier: (i === 0 ? "lite" : "flash") as "lite" | "flash" }));
    return {
      runtime: "vercel_gateway",
      default_model_id: googleLite?.id ?? "google/gemini-2.5-flash-lite",
      enableModels,
      disableAllGateway: false,
    };
  }
  const enableModels: PresetPlan["enableModels"] = [];
  if (googleLite) enableModels.push({ modelId: googleLite.id, tier: "lite" });
  if (openaiMini) enableModels.push({ modelId: openaiMini.id, tier: "flash" });
  if (anthropicSonnet) enableModels.push({ modelId: anthropicSonnet.id, tier: "pro" });
  return {
    runtime: "vercel_gateway",
    default_model_id: anthropicSonnet?.id ?? openaiMini?.id ?? googleLite?.id ?? "anthropic/claude-sonnet-4.5",
    enableModels,
    disableAllGateway: false,
  };
}

/** PUT /api/admin/control-plane/integrations/ai */
export async function PUT(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_PLATFORM_CONFIG, request);
    const body = await request.json();
    const environment = parseEnv(body.environment);
    const supabase = getSupabaseAdmin();
    const { currentTenantId, requestedScope } = await resolveAdminTenantContext(
      request,
      body as Record<string, unknown>,
      user.role ?? null,
    );
    const scopeTenantId = requestedScope.scope === "global" ? null : requestedScope.tenantId ?? currentTenantId;

    if (body.refresh_catalog) {
      invalidateGatewayModelsCache();
    }

    let beforeQuery = supabase.from("ai_runtime_config").select("*").eq("environment", environment);
    beforeQuery =
      scopeTenantId == null ? beforeQuery.is("tenant_id", null) : beforeQuery.eq("tenant_id", scopeTenantId);
    const { data: before } = await beforeQuery.maybeSingle();

    const payload: Record<string, unknown> = {
      tenant_id: scopeTenantId,
      environment,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    };

    let presetPlan: Awaited<ReturnType<typeof resolvePreset>> | null = null;
    if (body.preset) {
      presetPlan = await resolvePreset(body.preset as AiPreset);
      payload.enabled = true;
      payload.runtime = presetPlan.runtime;
      payload.default_model_id = presetPlan.default_model_id;
      payload.failover_enabled = true;
    } else {
      if (body.enabled !== undefined) payload.enabled = Boolean(body.enabled);
      if (body.runtime) payload.runtime = body.runtime;
      if (body.default_model_id) payload.default_model_id = body.default_model_id;
      if (body.failover_enabled !== undefined) payload.failover_enabled = Boolean(body.failover_enabled);
    }

    if (body.gateway_api_key_secret !== undefined && body.gateway_api_key_secret !== "") {
      payload.gateway_api_key_secret = body.gateway_api_key_secret;
    }
    if (body.openai_api_key_secret !== undefined && body.openai_api_key_secret !== "") {
      payload.openai_api_key_secret = body.openai_api_key_secret;
    }
    if (body.anthropic_api_key_secret !== undefined && body.anthropic_api_key_secret !== "") {
      payload.anthropic_api_key_secret = body.anthropic_api_key_secret;
    }

    if (body.gemini) {
      const gemPayload: Record<string, unknown> = {
        tenant_id: scopeTenantId,
        environment,
        enabled: body.gemini.enabled ?? false,
        default_model: body.gemini.default_model ?? "gemini-2.5-flash-lite",
        safety_settings: body.gemini.safety_settings ?? {},
        updated_at: new Date().toISOString(),
      };
      if (body.gemini.api_key_secret) gemPayload.api_key_secret = body.gemini.api_key_secret;
      let gq = supabase.from("gemini_integration_config").select("id").eq("environment", environment);
      gq = scopeTenantId == null ? gq.is("tenant_id", null) : gq.eq("tenant_id", scopeTenantId);
      const { data: gemExisting } = await gq.maybeSingle();
      if ((gemExisting as { id?: string } | null)?.id) {
        await supabase
          .from("gemini_integration_config")
          .update(gemPayload)
          .eq("id", (gemExisting as { id: string }).id);
      } else {
        await supabase.from("gemini_integration_config").insert(gemPayload);
      }
    }

    let after: Record<string, unknown> | null = null;
    if ((before as { id?: string } | null)?.id) {
      const res = await supabase
        .from("ai_runtime_config")
        .update(payload)
        .eq("id", (before as { id: string }).id)
        .select()
        .single();
      after = res.data as Record<string, unknown> | null;
    } else {
      const insertPayload = {
        enabled: false,
        runtime: "direct_gemini",
        default_model_id: "gemini-2.5-flash-lite",
        failover_enabled: true,
        ...payload,
      };
      const res = await supabase.from("ai_runtime_config").insert(insertPayload).select().single();
      after = res.data as Record<string, unknown> | null;
    }

    const liveModels: LiveGatewayModel[] = await fetchLiveGatewayModels().catch(
      () => [] as LiveGatewayModel[],
    );
    const liveById = new Map<string, LiveGatewayModel>(liveModels.map((m) => [m.id, m]));

    if (presetPlan) {
      for (const entry of presetPlan.enableModels) {
        const modelId = entry.modelId;
        if (presetPlan.disableAllGateway) {
          await upsertCatalogPreference(supabase, {
            environment,
            tenantId: scopeTenantId,
            modelId,
            enabled: true,
            gateway: false,
            provider: "gemini",
            capability: "chat",
            tier: entry.tier,
          });
          continue;
        }
        const gate = canEnableCatalogModel({ environment, enabled: true, evalPassedAt: null });
        if (!gate.allowed && environment === "production") continue;
        await upsertCatalogPreference(supabase, {
          environment,
          tenantId: scopeTenantId,
          modelId,
          enabled: true,
          tier: entry.tier,
          liveModel: liveById.get(modelId) ?? null,
        });
      }
      if (presetPlan.disableAllGateway) {
        let gwQuery = supabase
          .from("ai_model_catalog")
          .select("model_id")
          .eq("environment", environment)
          .eq("gateway", true)
          .eq("enabled", true);
        gwQuery =
          scopeTenantId == null ? gwQuery.is("tenant_id", null) : gwQuery.eq("tenant_id", scopeTenantId);
        const { data: gwEnabled } = await gwQuery;
        for (const row of gwEnabled ?? []) {
          const modelId = String((row as { model_id: string }).model_id);
          await upsertCatalogPreference(supabase, {
            environment,
            tenantId: scopeTenantId,
            modelId,
            enabled: false,
            liveModel: liveById.get(modelId) ?? null,
          });
        }
      }
    }

    const catalogErrors: string[] = [];
    if (Array.isArray(body.catalog)) {
      for (const item of body.catalog as Array<Record<string, unknown>>) {
        const modelId = String(item.model_id ?? "");
        if (!modelId) continue;
        const enable = Boolean(item.enabled);
        let evalPassedAt = item.eval_passed_at as string | null | undefined;
        if (item.id) {
          const { data: existingRow } = await supabase
            .from("ai_model_catalog")
            .select("eval_passed_at")
            .eq("id", item.id)
            .maybeSingle();
          evalPassedAt =
            evalPassedAt ??
            (existingRow as { eval_passed_at?: string | null } | null)?.eval_passed_at ??
            null;
        }
        const gate = canEnableCatalogModel({ environment, enabled: enable, evalPassedAt });
        if (!gate.allowed) {
          catalogErrors.push(modelId);
          continue;
        }
        await upsertCatalogPreference(supabase, {
          environment,
          tenantId: scopeTenantId,
          modelId,
          enabled: enable,
          tier: item.tier as string | undefined,
          evalPassedAt: evalPassedAt ?? undefined,
          liveModel: liveById.get(modelId) ?? null,
        });
      }
    }

    if (Array.isArray(body.pricing)) {
      for (const row of body.pricing as Array<Record<string, unknown>>) {
        if (!row.model) continue;
        await supabase.from("ai_model_pricing").upsert(
          {
            model: row.model,
            input_usd_per_1k: row.input_usd_per_1k,
            output_usd_per_1k: row.output_usd_per_1k,
            notes: row.notes ?? null,
            is_active: row.is_active !== false,
            effective_from: row.effective_from ?? new Date().toISOString(),
          },
          { onConflict: "model" },
        );
      }
      clearModelPricingCache();
    }

    if (body.module) {
      let modQuery = supabase.from("ai_module_config").select("id").eq("environment", environment);
      modQuery =
        scopeTenantId == null ? modQuery.is("tenant_id", null) : modQuery.eq("tenant_id", scopeTenantId);
      const { data: modExisting } = await modQuery.maybeSingle();
      const modPayload = {
        environment,
        tenant_id: scopeTenantId,
        daily_budget_credits: body.module.daily_budget_credits,
        monthly_budget_usd: body.module.monthly_budget_usd,
        alert_threshold_pct: body.module.alert_threshold_pct ?? 80,
        updated_at: new Date().toISOString(),
      };
      if ((modExisting as { id?: string } | null)?.id) {
        await supabase
          .from("ai_module_config")
          .update(modPayload)
          .eq("id", (modExisting as { id: string }).id);
      } else {
        await supabase.from("ai_module_config").insert(modPayload);
      }
    }

    invalidateAiRuntimeCache();
    invalidateGatewayModelsCache();

    await writeConfigChangeLog({
      changedBy: user.id,
      area: "integration",
      recordKey: `ai.${environment}.${scopeTenantId ?? "global"}`,
      before: toSafeAiRuntimeRow(before as Record<string, unknown> | null) as Record<string, unknown> | null,
      after: toSafeAiRuntimeRow(after) as Record<string, unknown>,
    });

    const reqMeta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "admin.control_plane.ai.update",
      entity_type: "ai_runtime_config",
      module: "platform_config",
      risk_level: "high",
      retention_tier: "access",
      status: "succeeded",
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
      after_json: toSafeAiRuntimeRow(after) as Record<string, unknown>,
    });

    return successResponse({
      ok: true,
      catalog_errors: catalogErrors.length ? catalogErrors : undefined,
      catalog_error_reason: catalogErrors.length ? "eval_required_before_production_enable" : undefined,
    });
  } catch (error) {
    return handleApiError(error as Error, "Failed to update AI config");
  }
}
