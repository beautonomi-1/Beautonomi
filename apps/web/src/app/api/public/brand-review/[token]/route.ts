import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { hashGuestToken, decideBrandApproval } from "@/lib/brand-marketing/approvals";
import { extractRequestMeta, writeAuditLog } from "@/lib/audit/audit";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const supabase = getSupabaseAdmin();
    const hash = hashGuestToken(token);
    const { data: approval } = await supabase
      .from("brand_approvals")
      .select("id, subject_type, subject_id, status, guest_token_expires_at, tenant_id")
      .eq("guest_token_hash", hash)
      .maybeSingle();
    if (!approval) return errorResponse("Invalid or expired link", "NOT_FOUND", 404);
    if (approval.guest_token_expires_at && new Date(approval.guest_token_expires_at) < new Date()) {
      return errorResponse("Link expired", "EXPIRED", 410);
    }
    return successResponse({
      subject_type: approval.subject_type,
      subject_id: approval.subject_id,
      status: approval.status,
    });
  } catch (error) {
    return handleApiError(error, "Failed to load review");
  }
}

const decideSchema = z.object({
  decision: z.enum(["approved", "changes_requested", "rejected"]),
  comment: z.string().optional(),
  reviewer_name: z.string().min(1),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const body = decideSchema.parse(await request.json());
    const supabase = getSupabaseAdmin();
    const hash = hashGuestToken(token);
    const { data: approval } = await supabase
      .from("brand_approvals")
      .select("id, tenant_id, status, guest_token_expires_at")
      .eq("guest_token_hash", hash)
      .maybeSingle();
    if (!approval) return errorResponse("Invalid link", "NOT_FOUND", 404);
    if (approval.status !== "pending") return errorResponse("Already decided", "VALIDATION_ERROR", 400);

    const meta = extractRequestMeta(request);
    const decided = await decideBrandApproval(supabase, {
      tenantId: approval.tenant_id,
      approvalId: approval.id,
      actorId: approval.id,
      decision: body.decision,
      comment: body.comment,
      allowGuest: true,
      evidence: { guest: true, reviewer_name: body.reviewer_name, ...meta },
    });
    if (decided.ok === false) return errorResponse(decided.message, "VALIDATION_ERROR", 400);

    await writeAuditLog({
      action: "brand.guest_review",
      entity_type: "brand_approval",
      entity_id: approval.id,
      module: "brand",
      risk_level: "high",
      retention_tier: "permanent",
      metadata: { reviewer_name: body.reviewer_name, decision: body.decision },
      ...meta,
    });

    return successResponse({ ok: true });
  } catch (error) {
    return handleApiError(error, "Failed to submit review");
  }
}
