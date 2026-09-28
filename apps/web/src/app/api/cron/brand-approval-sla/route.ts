import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { notifyAdminOps } from "@/lib/notifications/notify-admin-ops";

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

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

  return Response.json({ ok: true, count: overdue?.length ?? 0 });
}
