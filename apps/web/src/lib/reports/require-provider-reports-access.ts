import type { NextRequest } from "next/server";
import { requirePermission, type PermissionCheckResult } from "@/lib/auth/requirePermission";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getProviderIdForUser } from "@/lib/supabase/api-helpers";
import { isUserSuperadmin } from "@/lib/subscriptions/entitlements";
import { assertReportSubscriptionAccess } from "@/lib/subscriptions/report-gating";
import type { ReportAccessGate } from "@/lib/reports/report-subscription-types";

/** Gate provider report APIs to owners/managers with `view_reports`, optionally by subscription. */
export async function requireProviderReportsAccess(
  request?: NextRequest,
  opts?: ReportAccessGate,
): Promise<PermissionCheckResult> {
  const permissionCheck = await requirePermission("view_reports", request);
  if (!permissionCheck.authorized || !opts?.reportType) {
    return permissionCheck;
  }

  const { user } = permissionCheck;
  const supabase = await getSupabaseServer(request);
  const providerId = await getProviderIdForUser(user.id, supabase);
  if (!providerId) {
    return permissionCheck;
  }

  const isSuperadmin = user.role === "superadmin" || (await isUserSuperadmin(supabase, user.id));
  const gate = await assertReportSubscriptionAccess({
    providerId,
    reportType: opts.reportType,
    supabase,
    isSuperadmin,
  });

  if (gate.allowed === false) {
    return {
      authorized: false,
      response: gate.response,
      user,
    };
  }

  return permissionCheck;
}
