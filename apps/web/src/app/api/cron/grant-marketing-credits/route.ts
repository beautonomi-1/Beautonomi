import { NextRequest, NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { grantMonthlyIncludedCredits } from "@/lib/marketing/credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/grant-marketing-credits
 * Monthly reset of plan-included marketing credits (1st of month).
 */
export async function GET(request: NextRequest) {
  const auth = verifyCronRequest(request);
  if (!auth.valid) {
    return NextResponse.json({ error: auth.error ?? "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const periodKey = new Date().toISOString().slice(0, 7);

  const { data: subs } = await supabase
    .from("provider_subscriptions")
    .select("provider_id, subscription_plans(features)")
    .eq("status", "active")
    .limit(500);

  let granted = 0;
  for (const sub of subs ?? []) {
    const plan = sub.subscription_plans as { features?: Record<string, unknown> } | null;
    const marketing = plan?.features?.marketing_campaigns as
      | {
          use_platform_credentials?: boolean;
          included_marketing_credit_zar_per_month?: number;
        }
      | undefined;
    const usePlatform = marketing?.use_platform_credentials === true;
    const marketingGrant = Number(marketing?.included_marketing_credit_zar_per_month ?? 0);
    const ads = plan?.features?.platform_ads as { included_credit_zar_per_month?: number } | undefined;
    const grant = marketingGrant > 0 ? marketingGrant : usePlatform ? Number(ads?.included_credit_zar_per_month ?? 0) : 0;
    if (grant <= 0) continue;
    try {
      await grantMonthlyIncludedCredits(supabase, sub.provider_id as string, grant, periodKey);
      granted++;
    } catch (e) {
      console.warn("[grant-marketing-credits]", sub.provider_id, e);
    }
  }

  return NextResponse.json({ ok: true, granted, period: periodKey });
}
