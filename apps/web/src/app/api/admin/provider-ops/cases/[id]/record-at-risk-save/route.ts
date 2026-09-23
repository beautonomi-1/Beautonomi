import { NextRequest } from "next/server";
import { errorResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { requireOpsDesk } from "@/lib/provider-ops/ops-desk-auth";

/**
 * POST /api/admin/provider-ops/cases/[id]/record-at-risk-save
 * @deprecated Manual at-risk saves removed; reconcile records saves after touch + recovery.
 */
export async function POST(
  request: NextRequest,
  _context: { params: Promise<{ id: string }> },
) {
  try {
    await requireOpsDesk(["retention"], request);
    return errorResponse(
      "At-risk saves are recorded automatically when booking volume recovers after outreach. Log a touch instead.",
      "GONE",
      410,
    );
  } catch (error) {
    return handleApiError(error, "Failed to record at-risk save");
  }
}
