import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { z } from "zod";

const bodySchema = z.object({
  booking_ids: z.array(z.string().uuid()).min(2),
});

async function generateGroupBookingRef(admin: ReturnType<typeof getSupabaseAdmin>) {
  const { data, error } = await admin.rpc("generate_group_booking_ref");
  if (!error && typeof data === "string" && data.trim()) return data.trim();
  return `GB-${Date.now().toString().slice(-10)}`;
}

/**
 * POST /api/provider/group-bookings/from-bookings
 * Link existing bookings into one group_booking (creates group + participant rows).
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request
    );
    const supabase = await getSupabaseServer(request);
    const admin = getSupabaseAdmin();
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { booking_ids } = bodySchema.parse(await request.json());

    const { data: bookings, error: bErr } = await admin
      .from("bookings")
      .select(
        "id, customer_id, provider_id, scheduled_at, booking_number, customer_name, customer_email, customer_phone, service_id, service_name, group_booking_id, package_id"
      )
      .in("id", booking_ids)
      .eq("provider_id", providerId);

    if (bErr || !bookings || bookings.length !== booking_ids.length) {
      return errorResponse("One or more bookings not found", "NOT_FOUND", 404);
    }

    for (const b of bookings) {
      if (b.group_booking_id) {
        return errorResponse("A booking is already in a group", "CONFLICT", 409);
      }
    }

    const scheduledAt = bookings[0]?.scheduled_at || new Date().toISOString();
    const packageIds = [...new Set(bookings.map((b) => b.package_id).filter(Boolean))];
    const sharedPackageId = packageIds.length === 1 ? packageIds[0] : null;

    // Detect scheduling divergence so callers can surface a warning in the UI.
    // Using the first booking's scheduled_at as the group anchor is correct for
    // the typical "batch-group same-time bookings" case; warn when any booking
    // differs by more than 30 minutes.
    const anchorMs = new Date(scheduledAt).getTime();
    const divergentIds = bookings
      .filter((b) => {
        if (!b.scheduled_at) return false;
        return Math.abs(new Date(b.scheduled_at).getTime() - anchorMs) > 30 * 60 * 1000;
      })
      .map((b) => b.id);

    const refNumber = await generateGroupBookingRef(admin);

    const { data: group, error: gErr } = await admin
      .from("group_bookings")
      .insert({
        provider_id: providerId,
        ref_number: refNumber,
        primary_contact_booking_id: bookings[0]!.id,
        scheduled_at: scheduledAt,
        status: "confirmed",
        package_id: sharedPackageId,
        max_participants: Math.max(10, bookings.length),
      })
      .select("*")
      .single();

    if (gErr || !group) {
      throw gErr || new Error("Failed to create group");
    }

    // Link participants one at a time. On any failure roll back the group row
    // so providers are never left with a partially-created group they cannot
    // manage — mirrors the same rollback pattern in POST /api/provider/group-bookings.
    try {
      for (let i = 0; i < bookings.length; i++) {
        const b = bookings[i]!;
        const { error: pErr } = await admin.from("booking_participants").insert({
          booking_id: b.id,
          group_booking_id: group.id,
          participant_name: b.customer_name || `Guest ${i + 1}`,
          participant_email: b.customer_email,
          participant_phone: b.customer_phone,
          is_primary_contact: i === 0,
        });
        if (pErr) throw pErr;

        const { error: uErr } = await admin
          .from("bookings")
          .update({
            group_booking_id: group.id,
            is_group_booking: true,
            updated_at: new Date().toISOString(),
          })
          .eq("id", b.id)
          .eq("provider_id", providerId);
        if (uErr) throw uErr;
      }
    } catch (linkErr) {
      // Rollback: delete the orphaned group row before surfacing the error.
      await admin.from("group_bookings").delete().eq("id", group.id);
      throw linkErr;
    }

    const { data: full } = await admin
      .from("group_bookings")
      .select(
        `*, booking_participants(id, participant_name, participant_email, participant_phone, is_primary_contact, booking_id)`
      )
      .eq("id", group.id)
      .single();

    return successResponse({
      ...(full || group),
      ...(divergentIds.length > 0
        ? {
            warnings: [
              {
                code: "TIME_DIVERGENCE",
                message:
                  "Some bookings have scheduled times that differ from the group anchor by more than 30 minutes. Verify the group schedule before proceeding.",
                divergent_booking_ids: divergentIds,
              },
            ],
          }
        : {}),
    });
  } catch (error) {
    return handleApiError(error, "Failed to create group from bookings");
  }
}
