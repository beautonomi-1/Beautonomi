import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/admin/payroll/health
 * Providers on payroll_v2, manual statutory mode counts, rule coverage gaps snapshot.
 */
export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin", "admin_finance"], request);
    const admin = getSupabaseAdmin();
    const today = new Date().toISOString().slice(0, 10);

    const { count: v2Count } = await admin
      .from("provider_settings")
      .select("provider_id", { count: "exact", head: true })
      .eq("payroll_v2_enabled", true);

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
      payroll_v2_providers: v2Count ?? 0,
      staff_manual_statutory: manualStaff ?? 0,
      rules_past_effective_to: expiring ?? [],
    });
  } catch (error) {
    return handleApiError(error, "Failed to load payroll health");
  }
}
