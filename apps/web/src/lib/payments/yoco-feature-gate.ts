import { NextResponse } from "next/server";
import { FEATURE_FLAG_KEYS } from "@/lib/server/feature-flag-keys";
import { isFeatureEnabledServer } from "@/lib/server/feature-flags";

export const YOCO_PLATFORM_DISABLED_CODE = "YOCO_DISABLED_BY_PLATFORM";

export function yocoPlatformDisabledResponse(message = "Yoco payments are disabled for this market.") {
  return NextResponse.json(
    {
      data: null,
      error: {
        message,
        code: YOCO_PLATFORM_DISABLED_CODE,
      },
    },
    { status: 403 },
  );
}

export async function isYocoPlatformEnabledForProvider(
  supabase: any,
  providerId: string,
): Promise<boolean> {
  const { data: provider } = await supabase
    .from("providers")
    .select("tenant_id")
    .eq("id", providerId)
    .single();

  const tenantId = (provider as { tenant_id?: string | null } | null)?.tenant_id ?? null;
  return isFeatureEnabledServer(FEATURE_FLAG_KEYS.PAYMENT_YOCO, tenantId);
}

export async function requireYocoPlatformEnabledForProvider(
  supabase: any,
  providerId: string,
): Promise<NextResponse | null> {
  const enabled = await isYocoPlatformEnabledForProvider(supabase, providerId);
  return enabled ? null : yocoPlatformDisabledResponse();
}
