import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { z } from "zod";

const patchSchema = z.object({
  is_default: z.boolean().optional(),
});

/**
 * PATCH /api/me/payment-methods/[id]
 *
 * Update a payment method (e.g. set as primary/default card).
 * Only the owner can update their payment methods.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["customer", "provider_owner", "provider_staff", "superadmin"], request);
    const { id } = await params;
    const supabase = await getSupabaseServer(request);

    if (!id) {
      return errorResponse("Payment method id is required", "VALIDATION_ERROR", 400);
    }

    const body = await request.json().catch(() => ({}));
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        parsed.error.issues.map((i) => i.message).join(", "),
        "VALIDATION_ERROR",
        400
      );
    }

    const { is_default } = parsed.data;

    // Ensure the payment method belongs to the user
    const { data: existing, error: fetchErr } = await supabase
      .from("payment_methods")
      .select("id, user_id")
      .eq("id", id)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .single();

    if (fetchErr || !existing) {
      return errorResponse("Payment method not found", "NOT_FOUND", 404);
    }

    if (is_default === true) {
      // Unset other defaults for this user
      await (supabase.from("payment_methods") as any)
        .update({ is_default: false })
        .eq("user_id", user.id)
        .eq("is_default", true);

      const { data: updated, error: updateErr } = await (supabase.from("payment_methods") as any)
        .update({ is_default: true, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", user.id)
        .select()
        .single();

      if (updateErr) throw updateErr;
      return successResponse(updated);
    }

    // Other fields could be supported here (e.g. is_default: false)
    return successResponse(existing);
  } catch (error) {
    return handleApiError(error, "Failed to update payment method");
  }
}
