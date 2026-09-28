import { NextRequest, NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";
import { runLockedCronRoute } from "@/lib/cron/locked-cron-route";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { notifyAdminOps } from "@/lib/notifications/notify-admin-ops";

const JOB_NAME = "brand-approval-sla";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const auth = verifyCronRequest(request);
  if (!auth.valid) {
    return NextResponse.json({ error: auth.error ?? "Unauthorized" }, { status: 401 });
  }

  return runLockedCronRoute(JOB_NAME, async () => {
    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();
    const { data: overdue } = await supabase
      .from("brand_approvals")
      .select("id, tenant_id, subject_type, due_at")
      .eq("status", "pending")
      .lt("due_at", now);

    for (const row of overdue ?? []) {
      await notifyAdminOps({
        roles: ["admin_marketing", "superadmin"],
        type: "admin_ops_alert",
        title: "Brand approval overdue",
        message: `${row.subject_type} approval past due`,
        link: "/admin/brand",
        tenantId: row.tenant_id,
      });
    }

    return NextResponse.json({ ok: true, count: overdue?.length ?? 0 });
  });
}
