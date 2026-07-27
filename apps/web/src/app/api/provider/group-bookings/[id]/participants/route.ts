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
import { requirePermission } from "@/lib/auth/requirePermission";
import { z } from "zod";
import {
  tryRecalculateGroupBookingTotal,
} from "@/lib/bookings/recalculate-group-total";
import { evaluateGroupCapacity } from "@/lib/bookings/group-capacity";

function normalizeGroupBookingId(rawId: string): string {
  return rawId.startsWith("group:") ? rawId.slice("group:".length) : rawId;
}

/** Link an existing booking to the group (legacy path). */
const bookingLinkSchema = z.object({
  booking_id: z.string().uuid(),
  participant_name: z.string().min(1).optional(),
  participant_email: z.string().email().optional().nullable(),
  participant_phone: z.string().optional().nullable(),
  service_id: z.string().uuid().optional().nullable(),
  service_name: z.string().optional().nullable(),
  price: z.coerce.number().min(0).optional(),
  duration_minutes: z.coerce.number().int().min(0).optional(),
  addons: z.array(z.unknown()).optional(),
  notes: z.string().max(2000).optional().nullable(),
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
    /** Linked existing customer when selected via client search */
    customer_id: z.string().uuid().optional().nullable(),
    service_id: z.string().uuid().optional().nullable(),
    service_name: z.string().optional().nullable(),
    price: z.coerce.number().min(0).optional(),
    duration_minutes: z.coerce.number().int().min(0).optional(),
    is_primary_contact: z.boolean().optional(),
    addons: z.array(z.unknown()).optional(),
    notes: z.string().max(2000).optional().nullable(),
  })
  .refine(
    (d) =>
      Boolean(
        (d.participant_name && d.participant_name.trim()) ||
        (d.customer_name && d.customer_name.trim())
      ),
    { message: "participant_name or customer_name is required" }
  );

/**
 * POST /api/provider/group-bookings/[id]/participants
 *
 * - **booking_id** — link an existing booking (RLS requires a real booking row).
 * - **Inline** — create `booking_participants` with `booking_id` null (portal flow); uses service role insert.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const permissionCheck = await requirePermission("edit_appointments", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const admin = getSupabaseAdmin();
    const { id: rawGroupId } = await params;
    const groupId = normalizeGroupBookingId(rawGroupId);

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data: group, error: gErr } = await admin
      .from("group_bookings")
      .select("id, max_participants, booking_participants(id)")
      .eq("id", groupId)
      .eq("provider_id", providerId)
      .maybeSingle();

    if (gErr || !group) {
      return notFoundResponse("Group booking not found");
    }
    const currentParticipantCount = Array.isArray((group as any).booking_participants)
      ? (group as any).booking_participants.length
      : 0;

    const rawBody = await request.json();

    if (rawBody && typeof rawBody === "object" && "booking_id" in rawBody && rawBody.booking_id) {
      const body = bookingLinkSchema.parse(rawBody);
      const { data: booking, error: bErr } = await admin
        .from("bookings")
        .select(
          "id, customer_id, group_booking_id, customers:users!bookings_customer_id_fkey(full_name, email, phone)"
        )
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

      const findExistingParticipant = () =>
        admin
          .from("booking_participants")
          .select("*")
          .eq("booking_id", body.booking_id)
          .maybeSingle();

      const { data: existing, error: existingError } = await findExistingParticipant();

      if (existingError) {
        throw existingError;
      }
      if (existing) {
        const existingGroupId = (existing as { group_booking_id?: string | null }).group_booking_id;
        if (existingGroupId && existingGroupId !== groupId) {
          return errorResponse("Booking already belongs to another group", "CONFLICT", 409);
        }
        await tryRecalculateGroupBookingTotal(admin, groupId);
        return successResponse({ data: existing });
      }

      const capacity = evaluateGroupCapacity({
        maxParticipants: (group as any).max_participants,
        currentParticipants: currentParticipantCount,
        adding: 1,
      });
      if (capacity.ok === false) {
        return errorResponse(capacity.message, capacity.code, 400);
      }

      const cust = b.customers || {};
      const name = body.participant_name || cust.full_name || cust.email || "Guest";

      const { data: row, error: insErr } = await admin
        .from("booking_participants")
        .insert({
          booking_id: body.booking_id,
          group_booking_id: groupId,
          // Carry the customer from the linked booking for analytics joins
          customer_id: (b as any).customer_id ?? null,
          participant_name: name,
          participant_email: body.participant_email ?? cust.email ?? null,
          participant_phone: body.participant_phone ?? cust.phone ?? null,
          service_id: body.service_id ?? null,
          service_name: body.service_name ?? null,
          price: typeof body.price === "number" ? body.price : 0,
          duration_minutes: body.duration_minutes ?? null,
          addons: Array.isArray(body.addons) ? body.addons : [],
          notes: body.notes?.trim() || null,
          is_primary_contact: body.is_primary_contact ?? false,
        })
        .select("*")
        .single();

      if (insErr) {
        if (insErr.code === "23505") {
          const { data: racedExisting, error: racedExistingError } =
            await findExistingParticipant();
          if (racedExistingError) throw racedExistingError;
          if (racedExisting) {
            await tryRecalculateGroupBookingTotal(admin, groupId);
            return successResponse({ data: racedExisting });
          }
        }
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

      if (body.is_primary_contact === true || !b.group_booking_id) {
        if (body.is_primary_contact === true) {
          await admin
            .from("booking_participants")
            .update({ is_primary_contact: false })
            .eq("group_booking_id", groupId)
            .neq("id", row.id);
        }

        const { data: currentGroup } = await admin
          .from("group_bookings")
          .select("primary_contact_booking_id")
          .eq("id", groupId)
          .maybeSingle();
        const shouldSetPrimaryBooking =
          body.is_primary_contact === true ||
          !(currentGroup as { primary_contact_booking_id?: string | null } | null)
            ?.primary_contact_booking_id;

        if (shouldSetPrimaryBooking) {
          const { error: primaryUpdateError } = await admin
            .from("group_bookings")
            .update({
              primary_contact_booking_id: body.booking_id,
              updated_at: new Date().toISOString(),
            })
            .eq("id", groupId)
            .eq("provider_id", providerId);
          if (primaryUpdateError) throw primaryUpdateError;
        }
      }

      await tryRecalculateGroupBookingTotal(admin, groupId);

      return successResponse({ data: row });
    }

    const inline = inlineParticipantSchema.parse(rawBody);
    const capacity = evaluateGroupCapacity({
      maxParticipants: (group as any).max_participants,
      currentParticipants: currentParticipantCount,
      adding: 1,
    });
    if (capacity.ok === false) {
      return errorResponse(capacity.message, capacity.code, 400);
    }
    const name = inline.participant_name || inline.customer_name || "Guest";
    const email = inline.participant_email ?? inline.customer_email ?? null;
    const phone = inline.participant_phone ?? inline.customer_phone ?? null;

    const { data: existingPrimary } = await admin
      .from("booking_participants")
      .select("id")
      .eq("group_booking_id", groupId)
      .eq("is_primary_contact", true)
      .maybeSingle();

    const isPrimary = inline.is_primary_contact ?? !existingPrimary;

    const { data: row, error: insErr } = await admin
      .from("booking_participants")
      .insert({
        booking_id: null,
        group_booking_id: groupId,
        customer_id: inline.customer_id ?? null,
        participant_name: name,
        participant_email: email,
        participant_phone: phone,
        is_primary_contact: isPrimary,
        service_id: inline.service_id ?? null,
        service_name: inline.service_name ?? null,
        price: typeof inline.price === "number" ? inline.price : 0,
        duration_minutes: inline.duration_minutes ?? null,
        addons: Array.isArray(inline.addons) ? inline.addons : [],
        notes: inline.notes?.trim() || null,
      })
      .select("*")
      .single();

    if (insErr) {
      throw insErr;
    }

    await tryRecalculateGroupBookingTotal(admin, groupId);

    return successResponse({ data: row });
  } catch (error) {
    return handleApiError(error, "Failed to add group participant");
  }
}
