import { getPublicConfigBundle } from "@/lib/config";
import type { Environment } from "@/lib/config/types";

type RequestNowAvailabilityInput = {
  tenantId?: string | null;
  userId?: string | null;
  role?: string | null;
  surface?: "customer" | "provider";
};

type RequestNowAvailability = {
  enabled: boolean;
  providerAcceptWindowSeconds: number;
};

function resolveOnDemandEnvironment(): Environment {
  const explicit = process.env.ON_DEMAND_CONFIG_ENV?.trim().toLowerCase();
  if (explicit === "production" || explicit === "staging" || explicit === "development") {
    return explicit;
  }
  if (process.env.VERCEL_ENV === "production") return "production";
  if (process.env.VERCEL_ENV === "preview") return "staging";
  if (process.env.VERCEL_ENV === "development") return "development";
  return process.env.NODE_ENV === "production" ? "production" : "development";
}

export async function getRequestNowAvailability(
  input: RequestNowAvailabilityInput = {},
): Promise<RequestNowAvailability> {
  const surface = input.surface ?? "customer";
  const bundle = await getPublicConfigBundle({
    platform: surface,
    environment: resolveOnDemandEnvironment(),
    tenantId: input.tenantId ?? null,
    userId: input.userId ?? null,
    role: input.role ?? (surface === "provider" ? "provider_owner" : "customer"),
  });

  const providerAcceptWindowSeconds = Number(
    bundle.modules.on_demand?.provider_accept_window_seconds ?? 30,
  );

  return {
    enabled: Boolean(
      bundle.modules.on_demand?.enabled &&
        bundle.flags.on_demand_accept_enabled?.enabled &&
        (surface === "provider"
          ? bundle.flags.on_demand_accept_provider_enabled?.enabled
          : bundle.flags.on_demand_accept_customer_enabled?.enabled),
    ),
    providerAcceptWindowSeconds:
      Number.isFinite(providerAcceptWindowSeconds) && providerAcceptWindowSeconds > 0
        ? Math.floor(providerAcceptWindowSeconds)
        : 30,
  };
}
