import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAuthInApi } from "@/lib/supabase/api-helpers";

function normalizeGroupBookingId(rawId: string): string {
  return rawId.startsWith("group:") ? rawId.slice("group:".length) : rawId;
}

function num(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * GET /api/me/group-bookings/[id]
 *
 * Customer group detail view. Access is granted only when the signed-in user is
 * represented by a participant row or a linked child booking in the group.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireAuthInApi(request);
    const { id: rawId } = await params;
    const id = normalizeGroupBookingId(rawId);
    const admin = getSupabaseAdmin();

    const { data: group, error } = await admin
      .from("group_bookings")
      .select(
        `
        *,
        provider:providers(id, business_name, slug, phone, email, timezone),
        location:provider_locations(id, name, address_line1, address_line2, city, country),
        service_packages:package_id(id, name),
        booking_participants(
          id,
          booking_id,
          customer_id,
          participant_name,
          participant_email,
          participant_phone,
          is_primary_contact,
          service_name,
          price,
          duration_minutes,
          checked_in_at,
          checked_out_at
        ),
        bookings:bookings(
          id,
          booking_number,
          customer_id,
          status,
          scheduled_at,
          total_amount,
          total_paid,
          total_refunded,
          payment_status
        )
      `
      )
      .eq("id", id)
      .maybeSingle();

    if (error || !group) {
      return NextResponse.json({ data: null, error: { message: "Group booking not found", code: "NOT_FOUND" } }, { status: 404 });
    }

    const participants = Array.isArray((group as any).booking_participants)
      ? (group as any).booking_participants
      : [];
    const bookings = Array.isArray((group as any).bookings) ? (group as any).bookings : [];
    const canView =
      participants.some((p: any) => p.customer_id === user.id) ||
      bookings.some((b: any) => b.customer_id === user.id);

    if (!canView) {
      return NextResponse.json({ data: null, error: { message: "Group booking not found", code: "NOT_FOUND" } }, { status: 404 });
    }

    const participantRows = participants.map((p: any) => {
      const linkedBooking = p.booking_id ? bookings.find((b: any) => b.id === p.booking_id) : null;
      return {
        id: p.id,
        booking_id: p.booking_id ?? null,
        is_current_user: p.customer_id === user.id || linkedBooking?.customer_id === user.id,
        name: p.participant_name || "Guest",
        email: p.participant_email ?? null,
        phone: p.participant_phone ?? null,
        is_primary_contact: Boolean(p.is_primary_contact),
        service_name: p.service_name || "Service",
        price: num(p.price),
        duration_minutes: p.duration_minutes ?? null,
        checked_in: Boolean(p.checked_in_at),
        checked_out: Boolean(p.checked_out_at),
        booking_status: linkedBooking?.status ?? null,
        payment_status: linkedBooking?.payment_status ?? null,
        booking_number: linkedBooking?.booking_number ?? null,
      };
    });

    return NextResponse.json({
      data: {
        id: (group as any).id,
        ref_number: (group as any).ref_number ?? id,
        title: (group as any).title || "Group booking",
        status: (group as any).status || "confirmed",
        scheduled_at: (group as any).scheduled_at,
        provider: (group as any).provider ?? null,
        location: (group as any).location ?? null,
        location_type: (group as any).location_type ?? "at_salon",
        address: {
          line1: (group as any).address_line1 ?? null,
          city: (group as any).address_city ?? null,
          state: (group as any).address_state ?? null,
          country: (group as any).address_country ?? null,
          postal_code: (group as any).address_postal_code ?? null,
        },
        package_name: Array.isArray((group as any).service_packages)
          ? (group as any).service_packages[0]?.name ?? null
          : (group as any).service_packages?.name ?? null,
        participant_count: participantRows.length,
        max_participants: (group as any).max_participants ?? null,
        participants: participantRows,
        total_price: num((group as any).total_price),
        notes: (group as any).notes ?? null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load group booking";
    return NextResponse.json({ data: null, error: { message, code: "GROUP_BOOKING_LOAD_FAILED" } }, { status: 500 });
  }
}
