import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  errorResponse,
  handleApiError,
  successResponse,
} from "@/lib/supabase/api-helpers";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { enforceAiBudget, logAiUsage } from "@/lib/ai/enforce-budget";
import { checkProviderAiEntitlement } from "@/lib/ai/entitlements";
import { FEATURE_TEMPLATES, isKnownAiFeature } from "@/lib/ai/feature-templates";
import { buildFeatureFallback } from "@/lib/ai/feature-fallbacks";
import { getProviderContext, formatCapsuleForPrompt } from "@/lib/ai/provider-context";
import { loadPromptTemplate } from "@/lib/ai/prompt-templates";
import { streamLlm } from "@/lib/ai/call-llm";
import { estimateCostUsd } from "@/lib/ai/pricing";
import { resolveAiRuntime } from "@/lib/ai/resolve-runtime";
import { trackServer } from "@/lib/analytics/amplitude/server";

const ENV = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "production";
const ENVIRONMENT = ENV === "production" ? "production" : ENV === "staging" ? "staging" : "development";

function emitAiFeatureCalled(
  userId: string,
  payload: Record<string, unknown>,
): void {
  void trackServer("ai_feature_called", payload, userId);
}

/** POST /api/provider/ai/[feature_key]/stream */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ feature_key: string }> },
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return errorResponse("Provider context required", "FORBIDDEN", 403);

    const { feature_key } = await params;
    if (feature_key !== "ai.provider.content_studio" || !isKnownAiFeature(feature_key)) {
      return errorResponse("Streaming not available for this feature", "NOT_FOUND", 404);
    }

    const entitlementCheck = await checkProviderAiEntitlement(providerId, feature_key);
    if (!entitlementCheck.allowed) {
      return errorResponse(entitlementCheck.reason ?? "Not entitled", "ENTITLEMENT", 403);
    }

    const admin = getSupabaseAdmin();
    const { data: providerMeta } = await admin
      .from("providers")
      .select("tenant_id")
      .eq("id", providerId)
      .maybeSingle();
    const tenantId = (providerMeta as { tenant_id?: string | null } | null)?.tenant_id ?? null;

    const body = await request.json().catch(() => ({}));
    const userInput = typeof (body as { input?: unknown }).input === "string" ? (body as { input: string }).input : "";

    const budget = await enforceAiBudget({
      feature_key,
      actor_user_id: user.id,
      provider_id: providerId,
      role: user.role ?? "provider_staff",
      environment: ENVIRONMENT,
      tenant_id: tenantId,
    });
    if (!budget.allowed) {
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
            streamed: false,
          });
          return successResponse(fallback);
        }
      }
      return errorResponse(budget.reason ?? "AI budget exceeded", "AI_BUDGET", 403);
    }

    const runtime = await resolveAiRuntime(ENVIRONMENT, tenantId);
    if (!runtime.config.enabled) {
      return errorResponse("AI not configured", "CONFIG", 503);
    }

    const capsule = await getProviderContext(providerId);
    const contextBlock = capsule ? formatCapsuleForPrompt(capsule) : "";
    const codeTemplate = FEATURE_TEMPLATES[feature_key];
    const dbTemplate = await loadPromptTemplate(feature_key);
    const templateSource: "db" | "code" = dbTemplate ? "db" : "code";
    const system = `${dbTemplate?.system || codeTemplate.system}\n\n${contextBlock}`;
    const baseUserPrompt = dbTemplate?.userPrompt || codeTemplate.userPrompt;
    const userPrompt = userInput ? `${baseUserPrompt}\n\nAdditional context: ${userInput}` : baseUserPrompt;
    const modelId =
      dbTemplate?.modelId ?? codeTemplate.model ?? runtime.config.defaultModelId;

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
          streamed: false,
        });
        return successResponse(fallback);
      }
    }

    const startedAt = Date.now();
    const result = await streamLlm({
      system,
      user: userPrompt,
      maxTokens: entitlementCheck.entitlement?.max_tokens ?? 600,
      temperature: 0.3,
      environment: ENVIRONMENT,
      featureKey: feature_key,
      providerId,
      tenantId,
      modelId,
      task: "drafting",
      onFinish: async (finish) => {
        const costEstimate = await estimateCostUsd(finish.model, finish.tokensIn, finish.tokensOut);
        await logAiUsage({
          actor_user_id: user.id,
          provider_id: providerId,
          feature_key,
          model: finish.model,
          tokens_in: finish.tokensIn,
          tokens_out: finish.tokensOut,
          cost_estimate: costEstimate,
          success: true,
          tenant_id: tenantId,
          model_provider: finish.modelProvider,
          runtime: finish.runtime,
          gateway: finish.gateway,
          latency_ms: Date.now() - startedAt,
        });
        emitAiFeatureCalled(user.id, {
          feature_key,
          provider_id: providerId,
          cache_hit: false,
          fallback: false,
          success: true,
          model: finish.model,
          template_source: templateSource,
          tokens_in: finish.tokensIn,
          tokens_out: finish.tokensOut,
          cost_usd: costEstimate,
          streamed: true,
        });
      },
    });

    return result.toTextStreamResponse();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg === "LLM_STREAMING_DISABLED" || msg === "LLM_BLOCKED_BY_KILL_SWITCH") {
      return errorResponse("AI streaming disabled", "AI_STREAMING_DISABLED", 503);
    }
    if (msg === "LLM_RATE_LIMITED") {
      return errorResponse("Too many AI requests", "RATE_LIMITED", 429);
    }
    return handleApiError(error as Error, "AI stream failed");
  }
}
