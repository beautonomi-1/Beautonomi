import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { z } from "zod";

const schema = z.object({
  membership_id: z.string().uuid(),
  auto_renew: z.boolean(),
});

/**
 * POST /api/me/membership/auto-renew
 *
 * Toggle auto_renew on a salon membership the authenticated customer owns.
 * Requires the membership to have a saved payment_method_id to re-enable.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request,
    );
    const supabase = await getSupabaseServer(request);
    const body = await request.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return successResponse({ success: false, message: "Invalid input" });
    }
    const { membership_id, auto_renew } = parsed.data;

    const { data: row, error: findErr } = await (supabase.from("user_memberships") as any)
      .select("id, user_id, status, payment_method_id, paystack_authorization_code")
      .eq("id", membership_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (findErr || !row) {
      return successResponse({ success: false, message: "Membership not found" });
    }
    if (!["active", "past_due"].includes(row.status)) {
      return successResponse({ success: false, message: "Cannot toggle auto-renew on this membership" });
    }

    // Require a saved card with a reusable authorization to re-enable auto_renew.
    if (auto_renew && (!row.payment_method_id || !row.paystack_authorization_code)) {
      return successResponse({
        success: false,
        message: "Please add a payment card before enabling auto-renew.",
        code: "NO_CARD",
      });
    }

    const { error: updateErr } = await (supabase.from("user_memberships") as any)
      .update({ auto_renew, updated_at: new Date().toISOString() })
      .eq("id", membership_id)
      .eq("user_id", user.id);

    if (updateErr) return handleApiError(updateErr, "Failed to update auto-renew");

    return successResponse({ success: true, auto_renew });
  } catch (error) {
    return handleApiError(error, "Failed to update auto-renew");
  }
}
