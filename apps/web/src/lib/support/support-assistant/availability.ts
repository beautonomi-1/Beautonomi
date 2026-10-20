import { loadAgentOperationalState } from "@/lib/agents/config-loader";
import { isFeatureEnabledServer } from "@/lib/server/feature-flags";
import { FEATURE_FLAG_KEYS } from "@/lib/server/feature-flag-keys";
import type { UserRole } from "@/types/beautonomi";

export const SUPPORT_ASSISTANT_AGENT_KEY = "support-assistant";

export type SupportAssistantUnavailableCode = "FLAG_OFF" | "AGENT_INACTIVE" | "AGENT_MISSING";

export type SupportAssistantAvailability = {
  enabled: boolean;
  code?: SupportAssistantUnavailableCode;
};

export type SupportAssistantPlatform = "web" | "customer" | "provider";

/**
 * Platform used for `platforms_allowed`, matching what each client sends to the config bundle:
 * customer app → customer, provider app and provider portal → provider, customer web → web.
 */
export function supportAssistantPlatformForRequest(params: {
  request?: { headers: Headers } | null;
  requesterType?: string | null;
  role?: UserRole | string;
}): SupportAssistantPlatform {
  const isProvider =
    params.requesterType === "provider" ||
    params.role === "provider_owner" ||
    params.role === "provider_staff";
  if (isProvider) return "provider";
  return params.request?.headers.get("X-App") === "customer" ? "customer" : "web";
}

function flagKeyForRequester(params: {
  role?: UserRole | string;
  requesterType?: string | null;
}): string {
  const isProvider =
    params.requesterType === "provider" ||
    params.role === "provider_owner" ||
    params.role === "provider_staff";
  return isProvider
    ? FEATURE_FLAG_KEYS.SUPPORT_AI_ASSISTANT_PROVIDER
    : FEATURE_FLAG_KEYS.SUPPORT_AI_ASSISTANT_CUSTOMER;
}

export async function resolveSupportAssistantAvailability(params: {
  role?: UserRole | string;
  requesterType?: string | null;
  userId: string;
  tenantId?: string | null;
  platform: SupportAssistantPlatform;
}): Promise<SupportAssistantAvailability> {
  const flagKey = flagKeyForRequester(params);

  const flagOn = await isFeatureEnabledServer(flagKey, params.tenantId ?? null, {
    role: params.role,
    platform: params.platform,
    bucketId: params.userId,
  });
  if (!flagOn) {
    return { enabled: false, code: "FLAG_OFF" };
  }

  try {
    const op = await loadAgentOperationalState(SUPPORT_ASSISTANT_AGENT_KEY);
    if (op.state !== "active") {
      return { enabled: false, code: "AGENT_INACTIVE" };
    }
    return { enabled: true };
  } catch {
    return { enabled: false, code: "AGENT_MISSING" };
  }
}

export async function isSupportAssistantEnabledForUser(params: {
  role: UserRole | string;
  userId: string;
  tenantId?: string | null;
  platform: SupportAssistantPlatform;
}): Promise<boolean> {
  const result = await resolveSupportAssistantAvailability(params);
  return result.enabled;
}
