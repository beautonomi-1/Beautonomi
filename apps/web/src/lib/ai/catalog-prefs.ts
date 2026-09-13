/**
 * Persist admin enable/tier preferences for live Gateway models in ai_model_catalog.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LiveGatewayModel } from "@/lib/ai/gateway-models";
import { inferGatewayTier } from "@/lib/ai/gateway-models";

export async function upsertCatalogPreference(
  supabase: SupabaseClient,
  params: {
    environment: string;
    tenantId: string | null;
    modelId: string;
    enabled: boolean;
    tier?: string;
    capability?: string;
    provider?: string;
    gateway?: boolean;
    evalPassedAt?: string | null;
    liveModel?: LiveGatewayModel | null;
  },
): Promise<void> {
  const live = params.liveModel;
  const provider = params.provider ?? live?.provider ?? params.modelId.split("/")[0] ?? "unknown";
  const capability =
    params.capability ??
    (live?.capability === "embedding" ? "embedding" : live?.capability === "vision" ? "vision" : "chat");
  const tier =
    params.tier ??
    (live ? inferGatewayTier(live.inputUsdPerToken, live.id) : "flash");
  const gateway = params.gateway ?? Boolean(params.modelId.includes("/"));

  let q = supabase.from("ai_model_catalog").select("id").eq("environment", params.environment).eq("model_id", params.modelId);
  q = params.tenantId ? q.eq("tenant_id", params.tenantId) : q.is("tenant_id", null);
  const { data: existing } = await q.maybeSingle();

  const payload = {
    environment: params.environment,
    tenant_id: params.tenantId,
    model_id: params.modelId,
    provider,
    tier,
    capability,
    gateway,
    enabled: params.enabled,
    eval_passed_at: params.evalPassedAt ?? undefined,
    updated_at: new Date().toISOString(),
  };

  if ((existing as { id?: string } | null)?.id) {
    await supabase.from("ai_model_catalog").update(payload).eq("id", (existing as { id: string }).id);
  } else {
    await supabase.from("ai_model_catalog").insert(payload);
  }
}
