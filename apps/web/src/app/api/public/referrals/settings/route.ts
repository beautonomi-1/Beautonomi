import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

const REFERRAL_SETTINGS_ID = "00000000-0000-0000-0000-000000000001";

/**
 * GET /api/public/referrals/settings
 * 
 * Get public referral settings (reward amounts, currency, is_enabled).
 */
export async function GET(request: NextRequest) {
  try {
    let tenantId: string;
    try {
      tenantId = await resolveTenantIdWithZaFallback(request);
    } catch (tenantErr) {
      console.error("Tenant resolution failed in /api/public/referrals/settings:", tenantErr);
      return NextResponse.json(
        {
          data: null,
          error: { message: "Tenant not configured", code: "TENANT_UNAVAILABLE" },
        },
        { status: 503 }
      );
    }
    const tenantRegion = await getTenantRegionConfig(tenantId);
    const lastResortCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;

    const supabase = await getSupabaseServer();

    const { data: referralSettings, error } = await supabase
      .from("referral_settings")
      .select("referral_amount, referral_message, referral_currency, is_enabled")
      .eq("id", REFERRAL_SETTINGS_ID)
      .maybeSingle();

    // Return default if not found
    if (error && error.code === 'PGRST116') {
      return successResponse({
        referral_amount: 50,
        referral_message: 'Join Beautonomi and get rewarded! Use my referral link to get started.',
        referral_currency: lastResortCurrency,
        is_enabled: true,
      });
    }

    if (error) {
      throw error;
    }

    return successResponse({
      referral_amount: referralSettings?.referral_amount || 50,
      referral_message: referralSettings?.referral_message || 'Join Beautonomi and get rewarded! Use my referral link to get started.',
      referral_currency: referralSettings?.referral_currency || lastResortCurrency,
      is_enabled: referralSettings?.is_enabled !== false,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch referral settings");
  }
}
