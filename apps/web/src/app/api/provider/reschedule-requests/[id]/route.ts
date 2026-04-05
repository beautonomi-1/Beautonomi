import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { z } from "zod";

const patchSchema = z.object({
  status: z.enum(["approved", "rejected"]),
});

/**
 * PATCH /api/provider/reschedule-requests/[id]
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request
    );
    const supabase = await getSupabaseServer(request);
    const { id } = await params;
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const body = patchSchema.parse(await request.json());

    const { data: reqRow, error: rErr } = await supabase
      .from("reschedule_requests")
      .select("*")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (rErr || !reqRow) {
      return notFoundResponse("Request not found");
    }

    if (reqRow.status !== "pending") {
      return errorResponse("Request already resolved", "INVALID_STATE", 409);
    }

    const now = new Date().toISOString();

    if (body.status === "approved") {
      const { error: uErr } = await supabase
        .from("bookings")
        .update({
          scheduled_at: reqRow.new_start,
          updated_at: now,
        })
        .eq("id", reqRow.booking_id)
        .eq("provider_id", providerId);

      if (uErr) {
        throw uErr;
      }
    }

    const { data: updated, error } = await supabase
      .from("reschedule_requests")
      .update({
        status: body.status,
        responded_by: user.id,
        responded_at: now,
        updated_at: now,
      })
      .eq("id", id)
      .eq("provider_id", providerId)
      .select("*")
      .single();

    if (error || !updated) {
      throw error || new Error("update failed");
    }

    return successResponse({ data: updated });
  } catch (error) {
    return handleApiError(error, "Failed to update reschedule request");
  }
}
