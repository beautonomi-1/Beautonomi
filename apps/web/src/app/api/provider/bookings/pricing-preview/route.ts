import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getProviderIdForUser,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { resolveMembershipDiscount } from "@/lib/provider/salon-membership-entitlement";
import { z } from "zod";

const querySchema = z.object({
  customer_id: z.string().uuid(),
  subtotal: z.coerce.number().finite().min(0),
});

/**
 * GET /api/provider/bookings/pricing-preview
 * Preview salon/platform membership discount for a cart subtotal (provider new-booking UI).
 */
export async function GET(request: NextRequest) {
  try {
    const permissionCheck = await requirePermission("create_appointments", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = getSupabaseAdmin();
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return errorResponse("Provider not found", "NOT_FOUND", 404);
    }

    const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
    if (!parsed.success) {
      return errorResponse("Invalid query", "VALIDATION_ERROR", 400, parsed.error.issues);
    }

    const { customer_id, subtotal } = parsed.data;
    const result = await resolveMembershipDiscount({
      supabase,
      customerId: customer_id,
      providerId,
      subtotal,
    });

    return successResponse({
      membershipDiscountAmount: result.membershipDiscountAmount,
      membershipPlanId: result.membershipPlanId,
      membershipId: result.membershipId,
      membershipPlanName: result.membershipPlanName,
    });
  } catch (error) {
    return handleApiError(error, "Failed to preview membership pricing");
  }
}
