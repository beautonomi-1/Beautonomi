import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { z } from "zod";

const createSchema = z.object({
  booking_id: z.string().uuid(),
  new_start: z.string().datetime(),
  new_end: z.string().datetime(),
  reason: z.string().optional(),
});

/**
 * GET /api/provider/reschedule-requests
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request
    );
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "pending";

    let q = supabase
      .from("reschedule_requests")
      .select("*")
      .eq("provider_id", providerId)
      .order("created_at", { ascending: false });

    if (status !== "all") {
      q = q.eq("status", status);
    }

    const { data, error } = await q;

    if (error) {
      throw error;
    }

    return successResponse({ data: data || [] });
  } catch (error) {
    return handleApiError(error, "Failed to list reschedule requests");
  }
}

/**
 * POST /api/provider/reschedule-requests
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request
    );
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const body = createSchema.parse(await request.json());

    const { data: booking, error: bErr } = await supabase
      .from("bookings")
      .select("id, scheduled_at, provider_id")
      .eq("id", body.booking_id)
      .eq("provider_id", providerId)
      .single();

    if (bErr || !booking) {
      return notFoundResponse("Booking not found");
    }

    const start = new Date(booking.scheduled_at);
    const originalEnd = new Date(start.getTime() + 60 * 60 * 1000);

    const { data: inserted, error } = await supabase
      .from("reschedule_requests")
      .insert({
        booking_id: body.booking_id,
        provider_id: providerId,
        requested_by: user.id,
        original_start: start.toISOString(),
        original_end: originalEnd.toISOString(),
        new_start: body.new_start,
        new_end: body.new_end,
        reason: body.reason ?? null,
        status: "pending",
      })
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return successResponse({ data: inserted });
  } catch (error) {
    return handleApiError(error, "Failed to create reschedule request");
  }
}
