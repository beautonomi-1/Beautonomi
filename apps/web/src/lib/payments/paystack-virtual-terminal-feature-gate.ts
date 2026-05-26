import { NextResponse } from "next/server";
import { FEATURE_FLAG_KEYS } from "@/lib/server/feature-flag-keys";
import { isFeatureEnabledServer } from "@/lib/server/feature-flags";

export const PAYSTACK_VIRTUAL_TERMINAL_DISABLED_CODE =
  "PAYSTACK_VIRTUAL_TERMINAL_DISABLED_BY_PLATFORM";

export function paystackVirtualTerminalDisabledResponse(
  message = "Paystack Terminal payments are disabled for this market.",
) {
  return NextResponse.json(
    {
      data: null,
      error: {
        message,
        code: PAYSTACK_VIRTUAL_TERMINAL_DISABLED_CODE,
      },
    },
    { status: 403 },
  );
}

export async function isPaystackVirtualTerminalEnabledForProvider(
  supabase: any,
  providerId: string,
): Promise<boolean> {
  const { data: provider } = await supabase
    .from("providers")
    .select("tenant_id")
    .eq("id", providerId)
    .single();

  const tenantId = (provider as { tenant_id?: string | null } | null)?.tenant_id ?? null;
  return isFeatureEnabledServer(FEATURE_FLAG_KEYS.PAYMENT_PAYSTACK_VIRTUAL_TERMINAL, tenantId);
}

export async function requirePaystackVirtualTerminalEnabledForProvider(
  supabase: any,
  providerId: string,
): Promise<NextResponse | null> {
  const enabled = await isPaystackVirtualTerminalEnabledForProvider(supabase, providerId);
  return enabled ? null : paystackVirtualTerminalDisabledResponse();
}
