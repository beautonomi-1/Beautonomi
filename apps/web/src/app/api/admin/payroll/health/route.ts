import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { FEATURE_FLAG_KEYS } from "@/lib/server/feature-flag-keys";

/**
 * GET /api/admin/payroll/health
 * Providers on payroll_v2, manual statutory mode counts, rule coverage gaps snapshot.
 */
export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin", "admin_finance"], request);
    const admin = getSupabaseAdmin();
    const today = new Date().toISOString().slice(0, 10);

    const [{ count: v2Count }, { count: v2OffCount }, { data: flagRows }] = await Promise.all([
      admin
        .from("provider_settings")
        .select("provider_id", { count: "exact", head: true })
        .eq("payroll_v2_enabled", true),
      admin
        .from("provider_settings")
        .select("provider_id", { count: "exact", head: true })
        .eq("payroll_v2_enabled", false),
      admin
        .from("feature_flags")
        .select("enabled")
        .eq("feature_key", FEATURE_FLAG_KEYS.PAYROLL_V2)
        .is("tenant_id", null)
        .limit(1),
    ]);
    const flagRow = (flagRows ?? [])[0] as { enabled?: boolean } | undefined;

    const { count: manualStaff } = await admin
      .from("provider_staff")
      .select("id", { count: "exact", head: true })
      .eq("statutory_mode", "manual")
      .eq("is_active", true);

    const { data: expiring } = await admin
      .from("payroll_rule_sets")
      .select("jurisdiction_code, rule_type, effective_to")
      .eq("status", "published")
      .not("effective_to", "is", null)
      .lte("effective_to", today);

    return successResponse({
      payroll_v2_flag: {
        key: FEATURE_FLAG_KEYS.PAYROLL_V2,
        present: Boolean(flagRow),
        enabled: flagRow?.enabled === true,
      },
      payroll_v2_providers: v2Count ?? 0,
      payroll_v2_providers_off: v2OffCount ?? 0,
      staff_manual_statutory: manualStaff ?? 0,
      rules_past_effective_to: expiring ?? [],
    });
  } catch (error) {
    return handleApiError(error, "Failed to load payroll health");
  }
}
