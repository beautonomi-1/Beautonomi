import { loadAgentOperationalState } from "@/lib/agents/config-loader";
import { isFeatureEnabledServer } from "@/lib/server/feature-flags";
import { FEATURE_FLAG_KEYS } from "@/lib/server/feature-flag-keys";
import type { UserRole } from "@/types/beautonomi";

export const SUPPORT_ASSISTANT_AGENT_KEY = "support-assistant";

export async function isSupportAssistantEnabledForUser(params: {
  role: UserRole | string;
  userId: string;
  tenantId?: string | null;
  platform: "web" | "customer" | "provider";
}): Promise<boolean> {
  const isProvider =
    params.role === "provider_owner" || params.role === "provider_staff";
  const flagKey = isProvider
    ? FEATURE_FLAG_KEYS.SUPPORT_AI_ASSISTANT_PROVIDER
    : FEATURE_FLAG_KEYS.SUPPORT_AI_ASSISTANT_CUSTOMER;

  const flagOn = await isFeatureEnabledServer(flagKey, params.tenantId ?? null, {
    role: params.role,
    platform: params.platform,
    bucketId: params.userId,
  });
  if (!flagOn) return false;

  try {
    const op = await loadAgentOperationalState(SUPPORT_ASSISTANT_AGENT_KEY);
    return op.state === "active";
  } catch {
    return false;
  }
}
