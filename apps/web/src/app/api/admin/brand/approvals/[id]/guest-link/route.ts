import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requireBrandDeskAccess, brandAccessErrorResponse } from "@/lib/brand-marketing/auth";
import { hashGuestToken, newGuestToken } from "@/lib/brand-marketing/approvals";
import { auditBrandMutation } from "@/lib/brand-marketing/brand-audit-helper";

const bodySchema = z.object({
  guest_email: z.string().email(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const access = await requireBrandDeskAccess(request);
    const denied = brandAccessErrorResponse(access);
    if (denied) return denied;
    if (!access.tenantId) return errorResponse("Pick a market", "TENANT_REQUIRED", 400);

    const { guest_email } = bodySchema.parse(await request.json());
    const token = newGuestToken();
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("brand_approvals")
      .update({
        guest_email,
        guest_token_hash: hashGuestToken(token),
        guest_token_expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
      })
      .eq("id", id)
      .eq("tenant_id", access.tenantId)
      .select("id")
      .single();
    if (error || !data) return errorResponse("Not found", "NOT_FOUND", 404);

    await auditBrandMutation(request, supabase, access, {
      action: "brand.approval_guest_link",
      entityType: "brand_approval",
      entityId: id,
      risk: "high",
      retention: "access",
      meta: { guest_email },
    });

    const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    return successResponse({ review_url: `${base}/brand-review/${token}`, approval_id: id });
  } catch (error) {
    const denied = brandAccessErrorResponse(error);
    if (denied) return denied;
    return handleApiError(error, "Failed to create guest link");
  }
}
