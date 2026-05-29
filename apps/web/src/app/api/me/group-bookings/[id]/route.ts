import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { errorResponse, handleApiError, requireAuthInApi } from "@/lib/supabase/api-helpers";
import { ME_GROUP_DETAIL_SELECT } from "@/lib/bookings/group-booking-postgrest";

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

    const { data: existence, error: existenceError } = await admin
      .from("group_bookings")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (existenceError) {
      console.error("[me group GET] existence check failed:", existenceError);
      return errorResponse(
        "Failed to load group booking",
        "GROUP_BOOKING_FETCH_FAILED",
        500,
        { db: existenceError.message ?? null }
      );
    }
    if (!existence) {
      return NextResponse.json(
        { data: null, error: { message: "Group booking not found", code: "NOT_FOUND" } },
        { status: 404 }
      );
    }

    const { data: group, error } = await admin
      .from("group_bookings")
      .select(ME_GROUP_DETAIL_SELECT)
      .eq("id", id)
      .maybeSingle();

    if (error || !group) {
      console.error("[me group GET] detail select failed:", error);
      return errorResponse(
        "Group booking exists but its detail view could not be loaded. Please refresh and try again.",
        "GROUP_BOOKING_DETAIL_FAILED",
        500,
        { db: error?.message ?? null }
      );
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
      const addons = Array.isArray(p.addons) ? p.addons : [];
      return {
        id: p.id,
        booking_id: p.booking_id ?? null,
        is_current_user: p.customer_id === user.id || linkedBooking?.customer_id === user.id,
        name: p.participant_name || "Guest",
        email: p.participant_email ?? null,
        phone: p.participant_phone ?? null,
        is_primary_contact: Boolean(p.is_primary_contact),
        service_id: p.service_id ?? null,
        service_name: p.service_name || "Service",
        price: num(p.price),
        duration_minutes: p.duration_minutes ?? null,
        addons: addons.map((ao: any) => ({
          id: ao.id ?? ao.addonId ?? null,
          name: ao.name ?? null,
          price: num(ao.price),
          duration_minutes: ao.duration_minutes ?? ao.duration ?? null,
        })),
        checked_in: Boolean(p.checked_in_at),
        checked_out: Boolean(p.checked_out_at),
        booking_status: linkedBooking?.status ?? null,
        payment_status: linkedBooking?.payment_status ?? null,
        booking_number: linkedBooking?.booking_number ?? null,
        total_paid: num(linkedBooking?.total_paid),
        total_refunded: num(linkedBooking?.total_refunded),
      };
    });

    // Products are stored as a JSONB array on group_bookings.products
    const products: { name: string; quantity: number; unit_price: number; total: number }[] = [];
    const rawProducts = (group as any).products;
    if (Array.isArray(rawProducts)) {
      for (const item of rawProducts) {
        if (!item) continue;
        products.push({
          name: String(item.productName ?? item.name ?? "Product"),
          quantity: Number(item.quantity ?? 1),
          unit_price: num(item.unitPrice ?? item.unit_price ?? item.price),
          total: num(item.total ?? (num(item.unitPrice ?? item.unit_price ?? item.price) * Number(item.quantity ?? 1))),
        });
      }
    }

    const travelFee = num((group as any).travel_fee);

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
        products,
        travel_fee: travelFee,
        total_price: num((group as any).total_price),
        notes: (group as any).notes ?? null,
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to load group booking");
  }
}
