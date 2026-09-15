import { NextRequest } from "next/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, errorResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { callLlm } from "@/lib/ai/call-llm";
import { entitlementTierToRouterTier } from "@/lib/ai/tier";
import { resolveAiRuntime } from "@/lib/ai/resolve-runtime";
import { getProviderContext, formatCapsuleForPrompt } from "@/lib/ai/provider-context";
import { enforceAiBudget, logAiUsage } from "@/lib/ai/enforce-budget";
import { checkProviderAiEntitlement } from "@/lib/ai/entitlements";
import { buildAiCacheKeyHash, readAiCache, writeAiCache } from "@/lib/ai/ai-cache";
import { FEATURE_TEMPLATES, isKnownAiFeature } from "@/lib/ai/feature-templates";
import { buildFeatureFallback } from "@/lib/ai/feature-fallbacks";
import { loadPromptTemplate } from "@/lib/ai/prompt-templates";
import { estimateCostUsd } from "@/lib/ai/pricing";
import { getImageSafetyScanner } from "@/lib/safety/image-safety-scanner";
import { AI_FEATURE_CONTENT_STUDIO, AI_FEATURE_LOOK_DESCRIBE } from "@/lib/ai/feature-templates";
import { trackServer } from "@/lib/analytics/amplitude/server";

const ENV = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "production";
const ENVIRONMENT = ENV === "production" ? "production" : ENV === "staging" ? "staging" : "development";

// Event name constants live in the analytics taxonomy package (packages/analytics/src/events.ts);
// string literal used here to avoid a cross-package edit from this route.
const AMPLITUDE_AI_FEATURE_CALLED = "ai_feature_called";

function emitAiFeatureCalled(
  userId: string,
  props: {
    feature_key: string;
    provider_id: string;
    cache_hit: boolean;
    fallback: boolean;
    fallback_reason?: string | null;
    success: boolean;
    model?: string | null;
    template_source?: "db" | "code" | null;
    tokens_in: number;
    tokens_out: number;
    cost_usd: number;
    error_code?: string | null;
  },
): void {
  void trackServer(AMPLITUDE_AI_FEATURE_CALLED, props, userId).catch(() => undefined);
}

/** Parse the model reply: strict JSON first (responseSchema replies are pure JSON), then tolerant fallback. */
function parseModelJson(text: string): Record<string, unknown> | null {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const direct = JSON.parse(trimmed);
    if (direct && typeof direct === "object" && !Array.isArray(direct)) return direct as Record<string, unknown>;
  } catch {
    // fall through
  }
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      // fall through
    }
  }
  return null;
}

/**
 * POST /api/provider/ai/[feature_key]
 * Body: { input?: string } (optional extra context)
 * Returns: { data: <feature-specific JSON>, error: null } or error.
 *
 * When the AI budget is exhausted (`fallback_mode: "templates_only"`) the route
 * returns 200 with a deterministic template payload and `fallback: true`.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ feature_key: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return errorResponse("Provider context required", "FORBIDDEN", 403);
    }

    const { feature_key } = await params;
    if (!isKnownAiFeature(feature_key)) {
      return errorResponse("Unknown AI feature", "NOT_FOUND", 404);
    }

    const entitlementCheck = await checkProviderAiEntitlement(providerId, feature_key);
    if (!entitlementCheck.allowed) {
      return errorResponse(
        entitlementCheck.reason ?? "Feature not available for your plan",
        "ENTITLEMENT",
        403
      );
    }

    const body = await request.json().catch(() => ({}));
    const userInput = typeof (body as { input?: unknown }).input === "string" ? (body as { input: string }).input : "";

    const admin = getSupabaseAdmin();
    const { data: providerMetaEarly } = await admin
      .from("providers")
      .select("tenant_id")
      .eq("id", providerId)
      .maybeSingle();
    const tenantId = (providerMetaEarly as { tenant_id?: string | null } | null)?.tenant_id ?? null;

    const budget = await enforceAiBudget({
      feature_key,
      actor_user_id: user.id,
      provider_id: providerId,
      role: user.role ?? "provider_staff",
      environment: ENVIRONMENT,
      tenant_id: tenantId,
    });
    if (budget.allowed === false) {
      if (budget.fallback_mode === "templates_only") {
        const capsule = await getProviderContext(providerId).catch(() => null);
        const reason = budget.reason ?? "ai_budget_exhausted";
        const fallback = buildFeatureFallback({ featureKey: feature_key, capsule, input: userInput, reason });
        if (fallback) {
          emitAiFeatureCalled(user.id, {
            feature_key,
            provider_id: providerId,
            cache_hit: false,
            fallback: true,
            fallback_reason: reason,
            success: true,
            model: null,
            template_source: null,
            tokens_in: 0,
            tokens_out: 0,
            cost_usd: 0,
          });
          return successResponse(fallback);
        }
      }
      return errorResponse(
        budget.reason ?? "AI is temporarily unavailable",
        "AI_BUDGET",
        403,
      );
    }

    const { data: aiConfigRow } = await admin
      .from("ai_module_config")
      .select("cache_ttl_seconds")
      .eq("environment", ENVIRONMENT)
      .maybeSingle();
    const cacheTtlSeconds = Number(
      (aiConfigRow as { cache_ttl_seconds?: number } | null)?.cache_ttl_seconds ?? 86_400,
    );

    const runtime = await resolveAiRuntime(ENVIRONMENT, null);
    if (!runtime.config.enabled) {
      return errorResponse("AI not configured", "CONFIG", 503);
    }

    const capsule = await getProviderContext(providerId);
    const contextBlock = capsule ? formatCapsuleForPrompt(capsule) : "No provider context.";

    // Admin-managed template (5-min cache) wins over the built-in one.
    const codeTemplate = FEATURE_TEMPLATES[feature_key];
    const dbTemplate = await loadPromptTemplate(feature_key);
    const templateSource: "db" | "code" = dbTemplate ? "db" : "code";
    const systemText = dbTemplate?.system || codeTemplate.system;
    const baseUserPrompt = dbTemplate?.userPrompt || codeTemplate.userPrompt;
    const outputSchema = dbTemplate?.outputSchema ?? codeTemplate.outputSchema;
    const promptVersion = dbTemplate ? `db:v${dbTemplate.version}` : "code";

    const system = `${systemText}\n\n${contextBlock}`;
    const userPrompt = userInput ? `${baseUserPrompt}\n\nAdditional context: ${userInput}` : baseUserPrompt;

    const model =
      dbTemplate?.modelId ??
      codeTemplate.model ??
      runtime.config.defaultModelId;
    const cacheKeyHash = buildAiCacheKeyHash(feature_key, providerId, `${promptVersion}:${userPrompt}:${model}`);
    const cached = await readAiCache<Record<string, unknown>>(cacheKeyHash);
    if (cached) {
      emitAiFeatureCalled(user.id, {
        feature_key,
        provider_id: providerId,
        cache_hit: true,
        fallback: false,
        success: true,
        model,
        template_source: templateSource,
        tokens_in: 0,
        tokens_out: 0,
        cost_usd: 0,
      });
      return successResponse(cached);
    }

    if (runtime.emergency.stopAllCalls || runtime.emergency.forceTemplateFallback) {
      const fallback = buildFeatureFallback({
        featureKey: feature_key,
        capsule,
        input: userInput,
        reason: "ai_kill_switch",
      });
      if (fallback) {
        emitAiFeatureCalled(user.id, {
          feature_key,
          provider_id: providerId,
          cache_hit: false,
          fallback: true,
          fallback_reason: "ai_kill_switch",
          success: true,
          model: null,
          template_source: templateSource,
          tokens_in: 0,
          tokens_out: 0,
          cost_usd: 0,
        });
        return successResponse(fallback);
      }
    }

    const bodyImages = (body as { image_url?: string }).image_url;
    const images =
      (feature_key === AI_FEATURE_LOOK_DESCRIBE || feature_key === AI_FEATURE_CONTENT_STUDIO) &&
      typeof bodyImages === "string"
        ? [{ url: bodyImages }]
        : undefined;

    if (images?.length) {
      const scan = await getImageSafetyScanner().scanImageUrls({
        urls: images.map((i) => i.url).filter(Boolean) as string[],
        environment: ENVIRONMENT,
        tenantId,
        sensitiveMedicalContext: feature_key === AI_FEATURE_LOOK_DESCRIBE,
      });
      if (scan.verdict === "likely_violation") {
        return errorResponse(
          "Image did not pass safety review. Please choose a different photo or contact support.",
          "IMAGE_SAFETY_BLOCKED",
          422,
        );
      }
      if (scan.verdict === "needs_human") {
        const fallback = buildFeatureFallback({
          featureKey: feature_key,
          capsule,
          input: userInput,
          reason: "image_safety_needs_human",
        });
        return successResponse({
          advisory_only: true,
          safety_review_required: true,
          safety_rationale: scan.rationale,
          ...(fallback ?? {}),
        });
      }
    }

    const startedAt = Date.now();
    const result = await callLlm({
      system,
      user: userPrompt,
      temperature: 0.3,
      maxTokens: entitlementCheck.entitlement?.max_tokens ?? 600,
      schema: outputSchema,
      providerId,
      tenantId,
      environment: ENVIRONMENT,
      featureKey: feature_key,
      modelId: model,
      task: (() => {
        const t = entitlementTierToRouterTier(entitlementCheck.entitlement?.model_tier);
        return t === "pro" ? "complex_reasoning" : t === "flash" ? "drafting" : "classification";
      })(),
      riskTier: (() => {
        const t = entitlementTierToRouterTier(entitlementCheck.entitlement?.model_tier);
        if (t === "pro") return 2;
        if (t === "flash") return 1;
        return 0;
      })(),
      images,
    });
    const latencyMs = Date.now() - startedAt;

    const costEstimate = await estimateCostUsd(result.model || model, result.tokensIn, result.tokensOut);

    await logAiUsage({
      actor_user_id: user.id,
      provider_id: providerId,
      feature_key,
      model: result.model || model,
      tokens_in: result.tokensIn,
      tokens_out: result.tokensOut,
      cost_estimate: costEstimate,
      success: result.success,
      error_code: result.errorCode ?? null,
      tenant_id: tenantId,
      model_provider: result.modelProvider,
      runtime: result.runtime,
      gateway: result.gateway,
      latency_ms: latencyMs,
      fallback_used: Boolean(result.failoverModel),
      breaker_tripped: Boolean(result.breakerTripped),
    });

    emitAiFeatureCalled(user.id, {
      feature_key,
      provider_id: providerId,
      cache_hit: false,
      fallback: false,
      success: result.success,
      model: result.model || model,
      template_source: templateSource,
      tokens_in: result.tokensIn,
      tokens_out: result.tokensOut,
      cost_usd: costEstimate,
      error_code: result.errorCode ?? null,
    });

    if (!result.success) {
      const rateLimited =
        result.errorCode === "GEMINI_RATE_LIMITED" || result.errorCode === "LLM_RATE_LIMITED";
      if (rateLimited) {
        return errorResponse("Too many AI requests, please retry shortly", "RATE_LIMITED", 429);
      }
      if (result.errorCode === "LLM_BLOCKED_BY_KILL_SWITCH") {
        const fallback = buildFeatureFallback({
          featureKey: feature_key,
          capsule,
          input: userInput,
          reason: "ai_kill_switch",
        });
        if (fallback) return successResponse(fallback);
      }
      const fallback = buildFeatureFallback({
        featureKey: feature_key,
        capsule,
        input: userInput,
        reason: result.errorCode ?? "ai_error",
      });
      if (fallback) return successResponse(fallback);
      return errorResponse(result.errorCode ?? "AI request failed", "AI_ERROR", 502);
    }

    const parsed = parseModelJson(result.text) ?? { raw: result.text };

    if (!("raw" in parsed)) {
      await writeAiCache({
        keyHash: cacheKeyHash,
        featureKey: feature_key,
        providerId,
        response: parsed,
        ttlSeconds: cacheTtlSeconds,
      });
    }

    return successResponse(parsed);
  } catch (error) {
    return handleApiError(error as Error, "AI request failed");
  }
}
