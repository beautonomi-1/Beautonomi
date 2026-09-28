import type { SupabaseClient } from "@supabase/supabase-js";

export async function validateSecondApprover(
  supabase: SupabaseClient,
  tenantId: string,
  approverId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { data: approver } = await supabase.from("users").select("role").eq("id", approverId).maybeSingle();
  const approverRole = String(approver?.role ?? "").toLowerCase();
  if (approverRole !== "admin_marketing" && approverRole !== "superadmin") {
    return { ok: false, message: "Second approver must be a marketing admin" };
  }
  if (approverRole === "admin_marketing") {
    const { data: membership } = await supabase
      .from("user_tenant_roles")
      .select("id")
      .eq("user_id", approverId)
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .maybeSingle();
    if (!membership) {
      return { ok: false, message: "Second approver must be a marketing admin in this market" };
    }
  }
  return { ok: true };
}
