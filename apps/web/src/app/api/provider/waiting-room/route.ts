import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { z } from "zod";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import {
  mapBookingEmbedToWaitingRoomEntry,
  WAITING_ROOM_BOOKING_SELECT,
  type WaitingRoomBookingEmbedRow,
} from "@/lib/provider-waiting-room/booking-to-waiting-room-entry";

const createWaitingRoomEntrySchema = z.object({
  client_name: z.string().min(1),
  client_email: z.string().email().optional(),
  client_phone: z.string().optional(),
  appointment_id: z.string().uuid().optional(),
  service_id: z.string().uuid().optional(),
  service_name: z.string().optional(),
  team_member_id: z.string().uuid().optional(),
  team_member_name: z.string().optional(),
  checked_in_method: z.enum(["self", "staff", "online"]).default("staff"),
  estimated_wait_time: z.number().optional(),
  notes: z.string().optional(),
});

type WaitingRoomServiceRow = {
  id?: string;
  duration_minutes?: number | null;
  price?: number | null;
  title?: string | null;
};

function createWalkInEmail() {
  const uuid =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `walkin+${uuid}@beautonomi.invalid`;
}

async function ensureWaitingRoomCustomer(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  data: z.infer<typeof createWaitingRoomEntrySchema>,
) {
  const email = data.client_email?.trim().toLowerCase();
  if (email) {
    const { data: existing } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (existing?.id) return existing.id as string;
  }

  const { data: created, error } = await supabase
    .from("users")
    .insert({
      email: email || createWalkInEmail(),
      full_name: data.client_name,
      phone: data.client_phone || null,
      role: "customer",
    })
    .select("id")
    .single();
  if (error || !created?.id) throw error || new Error("Failed to create waiting-room customer");
  return created.id as string;
}

/**
 * GET /api/provider/waiting-room
 * 
 * Get waiting room entries (appointments that are checked in and waiting)
 * The waiting room shows appointments with status "WAITING" (checked in but not started)
 */
export async function GET(request: NextRequest) {
  try {
    const permissionCheck = await requirePermission("view_calendar", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = getSupabaseAdmin();
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status");
    const locationId = searchParams.get("location_id");
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Checked-in queue: real `bookings` columns + joins (no denormalized customer_name/service_* on bookings).
    let query = supabase
      .from("bookings")
      .select(WAITING_ROOM_BOOKING_SELECT)
      .eq("provider_id", providerId)
      .in("status", ["waiting", "checked_in", "confirmed"])
      .not("checked_in_time", "is", null)
      .order("checked_in_time", { ascending: true });

    if (locationId) {
      query = query.eq("location_id", locationId);
    }

    // Filter by status if provided
    if (status && status !== 'all') {
      if (status === 'waiting') {
        query = query.in("status", ["waiting", "checked_in", "confirmed"]);
      } else if (status === 'in_service') {
        // 'in_progress' is the correct booking status for an active service
        query = query.eq("status", "in_progress");
      } else if (status === 'completed') {
        query = query.eq("status", "completed");
      }
    }

    const { data: bookings, error } = await query;

    if (error) {
      throw error;
    }

    const rows = (Array.isArray(bookings) ? bookings : []) as unknown as WaitingRoomBookingEmbedRow[];
    const entries = rows.map((booking) => mapBookingEmbedToWaitingRoomEntry(booking));

    return successResponse(entries);
  } catch (error) {
    return handleApiError(error, "Failed to fetch waiting room entries");
  }
}

/**
 * POST /api/provider/waiting-room
 * 
 * Add entry to waiting room
 */
export async function POST(request: NextRequest) {
  try {
    const permissionCheck = await requirePermission("create_appointments", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = getSupabaseAdmin();
    const body = await request.json();

    const validationResult = createWaitingRoomEntrySchema.safeParse(body);
    if (!validationResult.success) {
      return errorResponse(
        "Validation failed",
        "VALIDATION_ERROR",
        400,
        validationResult.error.issues
      );
    }

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data: prow } = await supabase
      .from("providers")
      .select("tenant_id, currency")
      .eq("id", providerId)
      .maybeSingle();
    const effectiveTenantId =
      (prow as { tenant_id?: string | null } | null)?.tenant_id ??
      (await resolveTenantIdWithZaFallback(request));
    const tenantRegion = await getTenantRegionConfig(effectiveTenantId);
    const lastResortCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;
    const bookingCurrency =
      (prow as { currency?: string | null } | null)?.currency || lastResortCurrency;

    const data = validationResult.data;
    const checkedInTime = new Date().toISOString();

    // If appointment_id is provided, update the existing booking
    if (data.appointment_id) {
      const { data: booking, error: bookingError } = await supabase
        .from("bookings")
        .update({
          checked_in_time: checkedInTime,
          status: "checked_in", // Set status to checked_in
        })
        .eq("id", data.appointment_id)
        .eq("provider_id", providerId)
        .select(WAITING_ROOM_BOOKING_SELECT)
        .single();

      if (bookingError || !booking) {
        return handleApiError(
          bookingError || new Error("Booking not found"),
          "Failed to check in booking"
        );
      }

      const bookingRow = booking as unknown as WaitingRoomBookingEmbedRow;
      const entry = {
        ...mapBookingEmbedToWaitingRoomEntry(bookingRow),
        checked_in_method: data.checked_in_method || "staff",
        status: "waiting" as const,
        estimated_wait_time: data.estimated_wait_time,
      };

      return successResponse(entry);
    }

    // If no appointment_id, create a new booking for walk-in
    // This is for walk-in clients who don't have a pre-existing appointment
    const customerId = await ensureWaitingRoomCustomer(supabase, data);
    const walkInRef =
      globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const bookingNumber = `WI-${walkInRef.slice(0, 8).toUpperCase()}`;
    const { data: newBooking, error: createError } = await supabase
      .from("bookings")
      .insert({
        provider_id: providerId,
        tenant_id: effectiveTenantId,
        customer_id: customerId,
        booking_number: bookingNumber,
        scheduled_at: checkedInTime,
        location_type: "at_salon",
        booking_source: "walk_in",
        status: "checked_in",
        checked_in_time: checkedInTime,
        notes: data.notes || null,
        currency: bookingCurrency,
        subtotal: 0,
        total_amount: 0,
        payment_status: "pending",
      })
      .select(WAITING_ROOM_BOOKING_SELECT)
      .single();

    if (createError || !newBooking) {
      return handleApiError(
        createError || new Error("Failed to create booking"),
        "Failed to add to waiting room"
      );
    }
    const newBookingRow = newBooking as unknown as WaitingRoomBookingEmbedRow;

    // If service_id is provided, create booking_service entry
    if (data.service_id) {
      // Get service details
      const { data: service } = await supabase
        .from("offerings")
        .select("id, duration_minutes, price, title")
        .eq("id", data.service_id)
        .single();

      const serviceRow = service as WaitingRoomServiceRow | null;
      if (serviceRow) {
        const serviceStart = new Date(checkedInTime);
        const serviceEnd = new Date(serviceStart.getTime() + (serviceRow.duration_minutes || 60) * 60000);

        await supabase
          .from("booking_services")
          .insert({
            booking_id: newBookingRow.id,
            offering_id: data.service_id,
            staff_id: data.team_member_id || null,
            scheduled_start_at: serviceStart.toISOString(),
            scheduled_end_at: serviceEnd.toISOString(),
            duration_minutes: serviceRow.duration_minutes || 60,
            price: serviceRow.price || 0,
            currency: bookingCurrency,
          });
      }
    }

    const { data: refreshedWalkIn } = await supabase
      .from("bookings")
      .select(WAITING_ROOM_BOOKING_SELECT)
      .eq("id", newBookingRow.id)
      .maybeSingle();
    const walkInEmbed = (refreshedWalkIn ?? newBookingRow) as WaitingRoomBookingEmbedRow;
    const entry = {
      ...mapBookingEmbedToWaitingRoomEntry(walkInEmbed),
      checked_in_method: data.checked_in_method || "staff",
      status: "waiting" as const,
      estimated_wait_time: data.estimated_wait_time,
    };

    return successResponse(entry);
  } catch (error) {
    return handleApiError(error, "Failed to add to waiting room");
  }
}
