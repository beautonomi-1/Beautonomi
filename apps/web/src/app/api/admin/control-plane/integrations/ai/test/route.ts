import { NextRequest } from "next/server";
import { requireAdminSection, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PLATFORM_CONFIG } from "@/lib/admin-sections";
import { callLlm } from "@/lib/ai/call-llm";
import { resolveAiRuntime, type AiRuntimeMode } from "@/lib/ai/resolve-runtime";
import { GEMINI_MODELS } from "@beautonomi/agent-model-router";
import {
  fetchLiveGatewayModels,
  pickLatestGatewayModel,
  type LiveGatewayModel,
} from "@/lib/ai/gateway-models";

function parseEnv(s: string | null): string {
  const ENVS = ["production", "staging", "development"];
  if (s && ENVS.includes(s)) return s;
  return "production";
}

const CREDENTIAL_RUNTIME: Record<string, AiRuntimeMode> = {
  gemini: "direct_gemini",
  gateway: "vercel_gateway",
  openai: "direct_openai",
  anthropic: "direct_anthropic",
};

async function resolveTestModelId(credential: string, environment: string): Promise<string> {
  if (credential === "gemini") return GEMINI_MODELS.flashLite;

  const live: LiveGatewayModel[] = await fetchLiveGatewayModels().catch(() => []);
  if (credential === "gateway") {
    const runtime = await resolveAiRuntime(environment, null);
    const defaultId = runtime.config.defaultModelId;
    if (defaultId.includes("/")) {
      return defaultId;
    }
    return (
      pickLatestGatewayModel(live, "google", (m) => m.capability === "chat" && /lite|flash-lite/i.test(m.id))?.id ??
      pickLatestGatewayModel(live, "google", (m) => m.capability === "chat")?.id ??
      "google/gemini-2.5-flash-lite"
    );
  }
  if (credential === "openai") {
    return (
      pickLatestGatewayModel(live, "openai", (m) => m.capability === "chat" && /mini|small/i.test(m.id))?.id ??
      pickLatestGatewayModel(live, "openai", (m) => m.capability === "chat")?.id ??
      "openai/gpt-4.1-mini"
    );
  }
  if (credential === "anthropic") {
    return (
      pickLatestGatewayModel(live, "anthropic", (m) => m.capability === "chat" && /sonnet/i.test(m.id))?.id ??
      pickLatestGatewayModel(live, "anthropic", (m) => m.capability === "chat")?.id ??
      "anthropic/claude-sonnet-4.5"
    );
  }
  return GEMINI_MODELS.flashLite;
}

/** POST /api/admin/control-plane/integrations/ai/test — one-token probe per credential or runtime */
export async function POST(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_PLATFORM_CONFIG, request);
    const body = await request.json();
    const environment = parseEnv(body.environment ?? null);
    const credential = body.credential as "gemini" | "gateway" | "openai" | "anthropic" | undefined;
    const forceRuntime = credential ? CREDENTIAL_RUNTIME[credential] : undefined;
    const modelId =
      typeof body.model_id === "string"
        ? body.model_id
        : credential
          ? await resolveTestModelId(credential, environment)
          : undefined;

    const started = Date.now();
    const result = await callLlm({
      system: "Reply with exactly: ok",
      user: "ping",
      maxTokens: 5,
      temperature: 0,
      environment,
      modelId,
      forceRuntime,
      featureKey: `admin.test.${credential ?? "runtime"}`,
      timeoutMs: 15_000,
    });
    const latencyMs = Date.now() - started;

    return successResponse({
      success: result.success,
      model: result.model,
      provider: result.modelProvider,
      runtime: result.runtime,
      gateway: result.gateway,
      latency_ms: latencyMs,
      error_code: result.errorCode ?? null,
      tokens_in: result.tokensIn,
      tokens_out: result.tokensOut,
      credential: credential ?? "runtime",
    });
  } catch (error) {
    return handleApiError(error as Error, "AI test call failed");
  }
}
