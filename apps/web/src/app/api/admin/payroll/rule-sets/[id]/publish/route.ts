import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * POST /api/admin/payroll/rule-sets/[id]/publish
 * Publish a verified rule set (requires two distinct verifiers).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireRoleInApi(["superadmin", "admin_finance"], request);
    const { id } = await params;
    const admin = getSupabaseAdmin();

    const { data: row } = await admin.from("payroll_rule_sets").select("*").eq("id", id).single();
    if (!row) return notFoundResponse("Rule set not found");

    const verifiedBy = row.verified_by as string | null;
    const verifiedSecondary = (row as { verified_by_secondary?: string | null }).verified_by_secondary;
    if (row.status !== "verified" || !verifiedBy || !verifiedSecondary || verifiedBy === verifiedSecondary) {
      return handleApiError(
        new Error("Rule set needs two distinct admin verifications before publish"),
        "INVALID_STATE",
        400,
      );
    }

    await admin
      .from("payroll_rule_sets")
      .update({ status: "retired" })
      .eq("jurisdiction_code", row.jurisdiction_code)
      .eq("rule_type", row.rule_type)
      .eq("status", "published")
      .lte("effective_from", row.effective_from);

    const { data: published, error } = await admin
      .from("payroll_rule_sets")
      .update({
        status: "published",
        published_by: user.id,
        published_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;

    return successResponse(published);
  } catch (error) {
    return handleApiError(error, "Failed to publish rule set");
  }
}
