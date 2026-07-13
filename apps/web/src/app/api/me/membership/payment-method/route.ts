import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { isPaymentMethodExpired } from "@/lib/payments/payment-method-expiry";
import { z } from "zod";

const schema = z.object({
  membership_id: z.string().uuid(),
  payment_method_id: z.string().uuid(),
});

/**
 * POST /api/me/membership/payment-method
 *
 * Point a salon membership's recurring billing at a different saved card.
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
    const { membership_id, payment_method_id } = parsed.data;

    const { data: membership, error: memErr } = await (supabase.from("user_memberships") as any)
      .select("id, user_id, status")
      .eq("id", membership_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (memErr || !membership) {
      return successResponse({ success: false, message: "Membership not found" });
    }
    if (!["active", "past_due"].includes(membership.status)) {
      return successResponse({
        success: false,
        message: "Cannot update the card on this membership",
      });
    }

    const { data: pm, error: pmErr } = await (supabase.from("payment_methods") as any)
      .select("id, provider_payment_method_id, expiry_month, expiry_year, is_active")
      .eq("id", payment_method_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (pmErr || !pm || pm.is_active !== true) {
      return successResponse({ success: false, message: "Payment method not found" });
    }
    if (!pm.provider_payment_method_id) {
      return successResponse({
        success: false,
        message: "This card cannot be used for recurring billing. Add a card via Paystack checkout.",
      });
    }
    if (isPaymentMethodExpired(pm.expiry_month, pm.expiry_year)) {
      return successResponse({ success: false, message: "This card has expired" });
    }

    const { error: updateErr } = await (supabase.from("user_memberships") as any)
      .update({
        payment_method_id,
        paystack_authorization_code: pm.provider_payment_method_id,
        auto_renew: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", membership_id)
      .eq("user_id", user.id);

    if (updateErr) return handleApiError(updateErr, "Failed to update membership card");

    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to update membership card");
  }
}
