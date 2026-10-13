import type { SupabaseClient } from "@supabase/supabase-js";
import type { ShippingProviderId, ShippingRuntimeCredentials } from "@beautonomi/shipping";
import { getShippingProvider, ShippingProviderNotConfiguredError } from "@beautonomi/shipping";
import {
  buildShippingRuntimeFromProviderRow,
  loadProviderCourierCredentialsRow,
} from "@/lib/orders/provider-shipping-credentials";
import { ecommerceShippingEnvOverride, loadEcommerceShippingRuntime } from "@/lib/orders/shipping-secrets";

export function isShippingKillSwitchActive(): boolean {
  return ecommerceShippingEnvOverride() === "off";
}

/** Superadmin live booking toggle + env override (not the emergency kill switch alone). */
export async function isLiveCourierBookingEnabled(
  admin: SupabaseClient,
): Promise<boolean> {
  if (isShippingKillSwitchActive()) return false;
  const platform = await loadEcommerceShippingRuntime(admin);
  return platform.enabled;
}

/** Booking and probe: salon credentials only (no platform fallback). */
export async function resolveProviderOwnedCredentials(
  admin: SupabaseClient,
  providerId: string,
  preference: ShippingProviderId,
): Promise<ShippingRuntimeCredentials | null> {
  if (isShippingKillSwitchActive()) return null;
  const row = await loadProviderCourierCredentialsRow(admin, providerId);
  const creds = buildShippingRuntimeFromProviderRow(row, preference);
  if (!creds) return null;
  try {
    getShippingProvider(preference, creds);
    return creds;
  } catch (err) {
    if (err instanceof ShippingProviderNotConfiguredError) return null;
    throw err;
  }
}

/** Live tracking: provider keys first, then platform keys for legacy shipments. */
export async function resolveTrackingCredentials(
  admin: SupabaseClient,
  providerId: string,
  preference: ShippingProviderId,
): Promise<ShippingRuntimeCredentials | null> {
  const owned = await resolveProviderOwnedCredentials(admin, providerId, preference);
  if (owned) return owned;
  if (isShippingKillSwitchActive()) return null;
  const platform = await loadEcommerceShippingRuntime(admin);
  if (!platform.enabled) return null;
  try {
    getShippingProvider(preference, platform.credentials);
    return platform.credentials;
  } catch {
    return null;
  }
}
