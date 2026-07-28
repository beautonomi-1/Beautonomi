import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FEATURE_FLAG_KEYS } from "@/lib/server/feature-flag-keys";
import { isFeatureEnabledServer } from "@/lib/server/feature-flags";

const GATEWAY_CARD_PROVIDERS = new Set([
  "paycloud",
  "yoco",
  "paystack",
  "stripe",
  "flutterwave",
  "paystack_terminal",
  "paystack_virtual_terminal",
]);

/**
 * Reject manual card mark-paid when payment_manual_card is disabled.
 * Gateway captures pass payment_provider and are never blocked.
 */
export async function requireManualCardEnabledForProvider(
  supabase: SupabaseClient,
  providerId: string,
  params: {
    payment_method: string;
    payment_provider?: string | null;
  },
): Promise<NextResponse | null> {
  const effectiveMethod =
    params.payment_method === "mobile" ? "other" : params.payment_method;
  if (effectiveMethod !== "card") return null;

  const provider = (params.payment_provider ?? "").trim().toLowerCase();
  if (provider && GATEWAY_CARD_PROVIDERS.has(provider)) return null;

  const { data: row } = await supabase
    .from("providers")
    .select("tenant_id")
    .eq("id", providerId)
    .maybeSingle();
  const tenantId = (row as { tenant_id?: string | null } | null)?.tenant_id ?? null;

  const enabled = await isFeatureEnabledServer(
    FEATURE_FLAG_KEYS.PAYMENT_MANUAL_CARD,
    tenantId,
  );
  if (enabled) return null;

  return NextResponse.json(
    {
      error: {
        message:
          'Manual card recording is disabled. Use a card machine or another payment method.',
        code: "MANUAL_CARD_DISABLED",
      },
    },
    { status: 403 },
  );
}
