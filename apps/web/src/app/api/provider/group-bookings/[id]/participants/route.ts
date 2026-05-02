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

async function recalculateGroupBookingTotal(admin: ReturnType<typeof getSupabaseAdmin>, groupId: string) {
  const [{ data: group }, { data: participantRows }] = await Promise.all([
    admin
      .from("group_bookings")
      .select("products, travel_fee, location_type")
      .eq("id", groupId)
      .maybeSingle(),
    admin
      .from("booking_participants")
      .select("price")
      .eq("group_booking_id", groupId),
  ]);
  const products = Array.isArray(group?.products) ? group.products : [];
  const participantTotal = (participantRows ?? []).reduce((sum: number, p: any) => sum + Math.max(0, Number(p.price || 0)), 0);
  const productTotal = products.reduce(
    (sum: number, p: any) =>
      sum + Math.max(0, Number(p.total_price ?? p.totalPrice ?? (Number(p.unit_price ?? p.unitPrice ?? 0) * Number(p.quantity ?? 1)))),
    0,
  );
  const travelFee = group?.location_type === "at_home" ? Math.max(0, Number(group.travel_fee || 0)) : 0;
  await admin
    .from("group_bookings")
    .update({ total_price: participantTotal + productTotal + travelFee, updated_at: new Date().toISOString() })
    .eq("id", groupId);
}

/** Link an existing booking to the group (legacy path). */
const bookingLinkSchema = z.object({
  booking_id: z.string().uuid(),
  participant_name: z.string().min(1).optional(),
  service_id: z.string().uuid().optional().nullable(),
  service_name: z.string().optional().nullable(),
  price: z.coerce.number().min(0).optional(),
  duration_minutes: z.coerce.number().int().min(0).optional(),
  addons: z.array(z.unknown()).optional(),
  is_primary_contact: z.boolean().optional(),
});

/** Add a waitlist-style participant without an individual booking row yet. */
const inlineParticipantSchema = z
  .object({
    participant_name: z.string().min(1).optional(),
    participant_email: z.string().email().optional().nullable(),
    participant_phone: z.string().optional().nullable(),
    customer_name: z.string().min(1).optional(),
    customer_email: z.string().email().optional().nullable(),
    customer_phone: z.string().optional().nullable(),
    service_id: z.string().uuid().optional().nullable(),
    service_name: z.string().optional().nullable(),
    price: z.coerce.number().min(0).optional(),
    duration_minutes: z.coerce.number().int().min(0).optional(),
    is_primary_contact: z.boolean().optional(),
    addons: z.array(z.unknown()).optional(),
  })
  .refine(
    (d) =>
      Boolean(
        (d.participant_name && d.participant_name.trim()) ||
          (d.customer_name && d.customer_name.trim()),
      ),
    { message: "participant_name or customer_name is required" },
  );

/**
 * POST /api/provider/group-bookings/[id]/participants
 *
 * - **booking_id** — link an existing booking (RLS requires a real booking row).
 * - **Inline** — create `booking_participants` with `booking_id` null (portal flow); uses service role insert.
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
    const admin = getSupabaseAdmin();
    const { id: groupId } = await params;

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data: group, error: gErr } = await admin
      .from("group_bookings")
      .select("id")
      .eq("id", groupId)
      .eq("provider_id", providerId)
      .maybeSingle();

    if (gErr || !group) {
      return notFoundResponse("Group booking not found");
    }

    const rawBody = await request.json();

    if (rawBody && typeof rawBody === "object" && "booking_id" in rawBody && rawBody.booking_id) {
      const body = bookingLinkSchema.parse(rawBody);

      const { data: booking, error: bErr } = await admin
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

      const { data: existing } = await admin
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

      const { data: row, error: insErr } = await admin
        .from("booking_participants")
        .insert({
          booking_id: body.booking_id,
          group_booking_id: groupId,
          participant_name: name,
          participant_email: cust.email ?? null,
          participant_phone: cust.phone ?? null,
          service_id: body.service_id ?? null,
          service_name: body.service_name ?? null,
          price: typeof body.price === "number" ? body.price : 0,
          duration_minutes: body.duration_minutes ?? null,
          addons: Array.isArray(body.addons) ? body.addons : [],
          is_primary_contact: body.is_primary_contact ?? false,
        })
        .select("*")
        .single();

      if (insErr) {
        throw insErr;
      }

      const { error: bookingUpdateError } = await admin
        .from("bookings")
        .update({
          group_booking_id: groupId,
          is_group_booking: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", body.booking_id)
        .eq("provider_id", providerId);
      if (bookingUpdateError) {
        throw bookingUpdateError;
      }

      await recalculateGroupBookingTotal(admin, groupId);

      return successResponse({ data: row });
    }

    const inline = inlineParticipantSchema.parse(rawBody);
    const name =
      inline.participant_name ||
      inline.customer_name ||
      "Guest";
    const email = inline.participant_email ?? inline.customer_email ?? null;
    const phone = inline.participant_phone ?? inline.customer_phone ?? null;

    const { data: existingPrimary } = await admin
      .from("booking_participants")
      .select("id")
      .eq("group_booking_id", groupId)
      .eq("is_primary_contact", true)
      .maybeSingle();

    const isPrimary =
      inline.is_primary_contact ?? !existingPrimary;

    const { data: row, error: insErr } = await admin
      .from("booking_participants")
      .insert({
        booking_id: null,
        group_booking_id: groupId,
        participant_name: name,
        participant_email: email,
        participant_phone: phone,
        is_primary_contact: isPrimary,
        service_id: inline.service_id ?? null,
        service_name: inline.service_name ?? null,
        price: typeof inline.price === "number" ? inline.price : 0,
        duration_minutes: inline.duration_minutes ?? null,
        addons: Array.isArray(inline.addons) ? inline.addons : [],
      })
      .select("*")
      .single();

    if (insErr) {
      throw insErr;
    }

    await recalculateGroupBookingTotal(admin, groupId);

    return successResponse({ data: row });
  } catch (error) {
    return handleApiError(error, "Failed to add group participant");
  }
}
