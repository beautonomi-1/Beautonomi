import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  errorResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { z } from "zod";

const declineBodySchema = z.object({
  reason: z.string().optional(),
});

/**
 * POST /api/provider/on-demand/requests/[id]/decline
 * Decline an on-demand request (atomic).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request
    );
    const { id } = await params;
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return errorResponse("Provider not found", "NOT_FOUND", 404);

    let providerResponsePayload: Record<string, unknown> = {};
    try {
      const body = await request.json();
      const parsed = declineBodySchema.safeParse(body);
      if (parsed.success && parsed.data.reason) {
        providerResponsePayload = { reason: parsed.data.reason };
      }
    } catch {
      // no body or invalid JSON is fine
    }

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("on_demand_requests")
      .update({
        status: "declined",
        declined_at: now,
        updated_at: now,
        provider_response_payload: providerResponsePayload,
      })
      .eq("id", id)
      .eq("provider_id", providerId)
      .eq("status", "requested")
      .gt("expires_at", now)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return errorResponse(
        "Request already handled or expired",
        "ALREADY_HANDLED_OR_EXPIRED",
        409
      );
    }

    // Notify customer (insert notification row; push may be sent by existing jobs/templates)
    const admin = getSupabaseAdmin();
    await admin.from("notifications").insert({
      user_id: data.customer_id,
      type: "system",
      title: "Request not accepted",
      message:
        "The provider was unable to accept your request. You can try another time or book a scheduled appointment.",
      data: {
        subtype: "on_demand_declined",
        on_demand_request_id: id,
        provider_response: providerResponsePayload,
      },
    });

    return successResponse(data);
  } catch (error) {
    return handleApiError(error as Error, "Failed to decline on-demand request");
  }
}
