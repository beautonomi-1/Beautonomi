/**
 * POST /api/me/custom-requests/[id]/cancel
 *
 * Cancel (withdraw) a custom request. Only allowed when:
 * - Request belongs to the current customer
 * - Request status is pending or offered
 * - No offer on this request has status "paid" (cannot cancel if already paid)
 */

import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  notFoundResponse,
  errorResponse,
} from "@/lib/supabase/api-helpers";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["customer", "superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const { id } = await params;

    if (!id) {
      return errorResponse("Request ID is required", "VALIDATION_ERROR", 400);
    }

    const { data: reqRow, error: fetchError } = await supabase
      .from("custom_requests")
      .select("id, customer_id, status")
      .eq("id", id)
      .single();

    if (fetchError || !reqRow) {
      return notFoundResponse("Custom request not found");
    }

    const req = reqRow as { id: string; customer_id: string; status: string };
    if (req.customer_id !== user.id) {
      return notFoundResponse("Custom request not found");
    }

    if (req.status === "cancelled") {
      return successResponse({ cancelled: true, alreadyCancelled: true });
    }

    if (req.status !== "pending" && req.status !== "offered") {
      return errorResponse(
        `This request can no longer be cancelled. Current status: ${req.status}.`,
        "INVALID_STATUS",
        400
      );
    }

    const { data: paidOffer } = await supabase
      .from("custom_offers")
      .select("id")
      .eq("request_id", id)
      .eq("status", "paid")
      .limit(1)
      .maybeSingle();

    if (paidOffer) {
      return errorResponse(
        "This request has a paid offer and cannot be cancelled.",
        "HAS_PAID_OFFER",
        400
      );
    }

    const { error: updateError } = await supabase
      .from("custom_requests")
      .update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("customer_id", user.id);

    if (updateError) {
      throw updateError;
    }

    return successResponse({ cancelled: true });
  } catch (error) {
    return handleApiError(error, "Failed to cancel custom request");
  }
}
