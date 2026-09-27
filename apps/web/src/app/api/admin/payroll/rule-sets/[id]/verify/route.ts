import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { loadPublishedRuleSets } from "@/lib/payroll/jurisdictions/resolve-statutory";
import { runGoldenTestsForRuleSet } from "@/lib/payroll/jurisdictions/run-golden-tests";

/**
 * POST /api/admin/payroll/rule-sets/[id]/verify
 * Run golden tests and record verifier (requires two distinct admins before publish).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireRoleInApi(["superadmin", "admin_finance"], request);
    const { id } = await params;
    const admin = getSupabaseAdmin();

    const { data: row, error } = await admin
      .from("payroll_rule_sets")
      .select("*")
      .eq("id", id)
      .single();
    if (error || !row) return notFoundResponse("Rule set not found");
    if (row.status === "published") {
      return handleApiError(new Error("Published rule sets cannot be verified again"), "INVALID_STATE", 400);
    }

    const published = await loadPublishedRuleSets(
      admin,
      row.jurisdiction_code as string,
      row.effective_from as string,
    );
    const merged = [
      ...(published ?? []).filter((r) => r.rule_type !== row.rule_type),
      row,
    ];
    const results = runGoldenTestsForRuleSet(row, merged as never);
    const failed = results.filter((r) => !r.passed);
    if (failed.length > 0) {
      return successResponse({ verified: false, goldenTests: results });
    }

    const verifiedBy = row.verified_by as string | null;
    const verifiedSecondary = (row as { verified_by_secondary?: string | null }).verified_by_secondary;
    const update: Record<string, unknown> = { status: "verified" };
    if (!verifiedBy) {
      update.verified_by = user.id;
    } else if (verifiedBy !== user.id && !verifiedSecondary) {
      update.verified_by_secondary = user.id;
    } else if (verifiedBy === user.id) {
      return handleApiError(
        new Error("A different admin must provide the second verification"),
        "INVALID_STATE",
        400,
      );
    } else {
      return handleApiError(
        new Error("Rule set already has two verifications"),
        "INVALID_STATE",
        400,
      );
    }

    const { data: updated, error: upErr } = await admin
      .from("payroll_rule_sets")
      .update(update)
      .eq("id", id)
      .select("*")
      .single();
    if (upErr) throw upErr;

    return successResponse({ verified: true, goldenTests: results, ruleSet: updated });
  } catch (error) {
    return handleApiError(error, "Failed to verify rule set");
  }
}
