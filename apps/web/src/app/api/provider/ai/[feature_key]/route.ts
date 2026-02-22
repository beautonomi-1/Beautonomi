import { NextRequest } from "next/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, errorResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { callGemini } from "@/lib/ai/gemini";
import { getProviderContext, formatCapsuleForPrompt } from "@/lib/ai/provider-context";
import { enforceAiBudget, logAiUsage } from "@/lib/ai/enforce-budget";
import { checkProviderAiEntitlement } from "@/lib/ai/entitlements";

const ENV = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "production";
const ENVIRONMENT = ENV === "production" ? "production" : ENV === "staging" ? "staging" : "development";

const FEATURE_TEMPLATES: Record<
  string,
  { system: string; userPrompt: string; model: string }
> = {
  "ai.provider.profile_completion": {
    system: `You are a helpful assistant for beauty and wellness providers. Given the provider context, suggest improvements for their profile: headline, short bio, specialties, FAQ, and policies. Respond with a JSON object: { "suggested_profile_patch": { "headline": string, "bio": string, "specialties": string[], "faq": string[], "policies": string[] } }. Only include fields you suggest; omit null.`,
    userPrompt: "Suggest profile improvements based on the provider context.",
    model: "gemini-1.5-flash",
  },
  "ai.provider.content_studio": {
    system: `You are a social media assistant for beauty and wellness providers. Given the provider context, suggest post captions and hashtags. Respond with a JSON object: { "post_captions": string[], "hashtags": string[], "short_description": string }. Keep captions concise and on-brand.`,
    userPrompt: "Suggest post captions, hashtags, and a short description for the provider.",
    model: "gemini-1.5-flash",
  },
};

/**
 * POST /api/provider/ai/[feature_key]
 * Body: { input?: string } (optional extra context)
 * Returns: { data: <feature-specific JSON>, error: null } or error.
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
    if (!FEATURE_TEMPLATES[feature_key]) {
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

    const budget = await enforceAiBudget({
      feature_key,
      actor_user_id: user.id,
      provider_id: providerId,
      role: user.role ?? "provider_staff",
      environment: ENVIRONMENT,
    });
    if (!budget.allowed) {
      return successResponse({
        disabled: true,
        reason: budget.reason,
        fallback_mode: budget.fallback_mode ?? "off",
      });
    }

    const admin = getSupabaseAdmin();
    const { data: geminiRow } = await admin
      .from("gemini_integration_config")
      .select("api_key_secret, default_model")
      .eq("environment", ENVIRONMENT)
      .eq("enabled", true)
      .maybeSingle();

    const apiKey = (geminiRow as { api_key_secret?: string } | null)?.api_key_secret;
    if (!apiKey) {
      return errorResponse("AI not configured", "CONFIG", 503);
    }

    const capsule = await getProviderContext(providerId);
    const contextBlock = capsule ? formatCapsuleForPrompt(capsule) : "No provider context.";
    const template = FEATURE_TEMPLATES[feature_key];
    const system = `${template.system}\n\n${contextBlock}`;
    const body = await request.json().catch(() => ({}));
    const userInput = (body as { input?: string }).input ?? "";
    const userPrompt = userInput ? `${template.userPrompt}\n\nAdditional context: ${userInput}` : template.userPrompt;

    const model = (geminiRow as { default_model?: string })?.default_model ?? template.model;
    const result = await callGemini({
      apiKey,
      model,
      system,
      user: userPrompt,
      temperature: 0.3,
      maxTokens: entitlementCheck.entitlement?.max_tokens ?? 600,
    });

    await logAiUsage({
      actor_user_id: user.id,
      provider_id: providerId,
      feature_key,
      model,
      tokens_in: result.tokensIn,
      tokens_out: result.tokensOut,
      cost_estimate: 0,
      success: result.success,
      error_code: result.errorCode ?? null,
    });

    if (!result.success) {
      return errorResponse(result.errorCode ?? "AI request failed", "AI_ERROR", 502);
    }

    let parsed: unknown = null;
    try {
      const trimmed = result.text.trim();
      const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
    } catch {
      parsed = { raw: result.text };
    }

    return successResponse(parsed);
  } catch (error) {
    return handleApiError(error as Error, "AI request failed");
  }
}
