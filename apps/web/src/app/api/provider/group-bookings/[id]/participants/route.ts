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

const postSchema = z.object({
  booking_id: z.string().uuid(),
  participant_name: z.string().min(1).optional(),
  is_primary_contact: z.boolean().optional(),
});

/**
 * POST /api/provider/group-bookings/[id]/participants
 * Link an existing booking to this group (creates booking_participants row).
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
    const supabase = await getSupabaseServer(request);
    const { id: groupId } = await params;

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data: group, error: gErr } = await supabase
      .from("group_bookings")
      .select("id")
      .eq("id", groupId)
      .eq("provider_id", providerId)
      .single();

    if (gErr || !group) {
      return notFoundResponse("Group booking not found");
    }

    const body = postSchema.parse(await request.json());

    const { data: booking, error: bErr } = await supabase
      .from("bookings")
      .select("id, customer_id, group_booking_id, customers:users!bookings_customer_id_fkey(full_name, email, phone)")
      .eq("id", body.booking_id)
      .eq("provider_id", providerId)
      .single();

    if (bErr || !booking) {
      return notFoundResponse("Booking not found");
    }

    const b = booking as any;
    if (b.group_booking_id && b.group_booking_id !== groupId) {
      return errorResponse("Booking already belongs to another group", "CONFLICT", 409);
    }

    const { data: existing } = await supabase
      .from("booking_participants")
      .select("id")
      .eq("booking_id", body.booking_id)
      .maybeSingle();

    if (existing) {
      return errorResponse("Booking already has a participant record", "CONFLICT", 409);
    }

    const cust = b.customers || {};
    const name =
      body.participant_name ||
      cust.full_name ||
      cust.email ||
      "Guest";

    const { data: row, error: insErr } = await supabase
      .from("booking_participants")
      .insert({
        booking_id: body.booking_id,
        group_booking_id: groupId,
        participant_name: name,
        participant_email: cust.email ?? null,
        participant_phone: cust.phone ?? null,
        is_primary_contact: body.is_primary_contact ?? false,
      })
      .select("*")
      .single();

    if (insErr) {
      throw insErr;
    }

    await supabase
      .from("bookings")
      .update({
        group_booking_id: groupId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", body.booking_id)
      .eq("provider_id", providerId);

    return successResponse({ data: row });
  } catch (error) {
    return handleApiError(error, "Failed to add group participant");
  }
}
