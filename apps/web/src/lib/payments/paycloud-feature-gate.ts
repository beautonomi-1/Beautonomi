import { NextResponse } from "next/server";
import { FEATURE_FLAG_KEYS } from "@/lib/server/feature-flag-keys";
import { isFeatureEnabledServer } from "@/lib/server/feature-flags";

export const PAYCLOUD_PLATFORM_DISABLED_CODE = "PAYCLOUD_DISABLED_BY_PLATFORM";

export function paycloudPlatformDisabledResponse(
  message = "Card machines aren't available for your account right now.",
) {
  return NextResponse.json(
    {
      data: null,
      error: { message, code: PAYCLOUD_PLATFORM_DISABLED_CODE },
    },
    { status: 403 },
  );
}

export async function isPaycloudPlatformEnabledForProvider(
  supabase: any,
  providerId: string,
): Promise<boolean> {
  const { data: provider } = await supabase
    .from("providers")
    .select("tenant_id")
    .eq("id", providerId)
    .single();

  const tenantId = (provider as { tenant_id?: string | null } | null)?.tenant_id ?? null;
  return isFeatureEnabledServer(FEATURE_FLAG_KEYS.PAYMENT_PAYCLOUD, tenantId);
}

export async function requirePaycloudPlatformEnabledForProvider(
  supabase: any,
  providerId: string,
): Promise<NextResponse | null> {
  const enabled = await isPaycloudPlatformEnabledForProvider(supabase, providerId);
  return enabled ? null : paycloudPlatformDisabledResponse();
}

export async function isPaycloudSameTerminalEnabledForProvider(
  supabase: any,
  providerId: string,
): Promise<boolean> {
  const { data: provider } = await supabase
    .from("providers")
    .select("tenant_id")
    .eq("id", providerId)
    .single();

  const tenantId = (provider as { tenant_id?: string | null } | null)?.tenant_id ?? null;
  return isFeatureEnabledServer(FEATURE_FLAG_KEYS.PAYMENT_PAYCLOUD_SAME_TERMINAL, tenantId);
}
