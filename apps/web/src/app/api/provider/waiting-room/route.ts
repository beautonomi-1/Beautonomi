import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { z } from "zod";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

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

type WaitingRoomBookingRow = {
  id: string;
  booking_number?: string | null;
  customer_id?: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  service_id?: string | null;
  service_name?: string | null;
  staff_id?: string | null;
  scheduled_at?: string | null;
  checked_in_time?: string | null;
  status?: string | null;
  notes?: string | null;
  is_group_booking?: boolean | null;
  group_booking_id?: string | null;
};

type WaitingRoomStaffRow = {
  id: string;
  name: string;
};

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

    // Checked-in queue: bookings with a check-in timestamp (staff_id → provider_staff, not users).
    let query = supabase
      .from("bookings")
      .select(
        `
        id,
        booking_number,
        customer_id,
        customer_name,
        customer_email,
        customer_phone,
        service_id,
        service_name,
        staff_id,
        scheduled_at,
        checked_in_time,
        status,
        notes,
        is_group_booking,
        group_booking_id
      `.trim(),
      )
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

    const rows = (Array.isArray(bookings) ? bookings : []) as unknown as WaitingRoomBookingRow[];
    const staffIds = [
      ...new Set(rows.map((b: { staff_id?: string | null }) => b.staff_id).filter((x): x is string => !!x)),
    ];
    let staffNames: Record<string, string> = {};
    if (staffIds.length > 0) {
      const { data: staffRows } = await supabase.from("provider_staff").select("id, name").in("id", staffIds);
      staffNames = Object.fromEntries(((staffRows ?? []) as WaitingRoomStaffRow[]).map((s) => [s.id, s.name]));
    }

    // Transform bookings to waiting room entries
    const entries = rows.map((booking: any) => {
      // Determine waiting room status from booking status
      let wrStatus: "waiting" | "in_service" | "completed" | "left" = "waiting";
      if (booking.status === "in_progress") {
        wrStatus = "in_service";
      } else if (booking.status === "completed") {
        wrStatus = "completed";
      } else if (booking.status === "cancelled" || booking.status === "no_show") {
        wrStatus = "left";
      }

      return {
        id: booking.id,
        appointment_id: booking.id,
        client_name: booking.customer_name || "Client",
        client_email: booking.customer_email,
        client_phone: booking.customer_phone,
        service_id: booking.service_id,
        service_name: booking.service_name || "Service",
        team_member_id: booking.staff_id,
        team_member_name:
          (booking.staff_id && staffNames[booking.staff_id as string]) || "Staff",
        checked_in_time: booking.checked_in_time || booking.scheduled_at,
        checked_in_method: "staff" as const,
        status: wrStatus,
        notes: booking.notes,
        position: undefined,
        estimated_wait_time: undefined,
        is_group_booking: Boolean(booking.is_group_booking),
        group_booking_id: booking.group_booking_id ?? null,
      };
    });

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
        .select(
          `
          id,
          booking_number,
          customer_id,
          customer_name,
          customer_email,
          customer_phone,
          service_id,
          service_name,
          staff_id,
          scheduled_at,
          checked_in_time,
          status,
          notes
        `.trim(),
        )
        .single();

      if (bookingError || !booking) {
        return handleApiError(
          bookingError || new Error("Booking not found"),
          "Failed to check in booking"
        );
      }

      const bookingRow = booking as unknown as WaitingRoomBookingRow;
      let teamMemberName = data.team_member_name || "Staff";
      const sid = bookingRow.staff_id;
      if (sid) {
        const { data: st } = await supabase.from("provider_staff").select("name").eq("id", sid).maybeSingle();
        const staffRow = st as { name?: string | null } | null;
        if (staffRow?.name) teamMemberName = staffRow.name;
      }

      // Transform to waiting room entry format
      const entry = {
        id: bookingRow.id,
        appointment_id: bookingRow.id,
        client_name: bookingRow.customer_name || data.client_name || "Client",
        client_email: bookingRow.customer_email || data.client_email,
        client_phone: bookingRow.customer_phone || data.client_phone,
        service_id: bookingRow.service_id || data.service_id,
        service_name: bookingRow.service_name || data.service_name || "Service",
        team_member_id: bookingRow.staff_id || data.team_member_id,
        team_member_name: teamMemberName,
        checked_in_time: bookingRow.checked_in_time || checkedInTime,
        checked_in_method: data.checked_in_method || "staff",
        status: "waiting" as const,
        notes: bookingRow.notes || data.notes,
        position: undefined,
        estimated_wait_time: data.estimated_wait_time,
      };

      return successResponse(entry);
    }

    // If no appointment_id, create a new booking for walk-in
    // This is for walk-in clients who don't have a pre-existing appointment
    const customerId = await ensureWaitingRoomCustomer(supabase, data);
    const { data: newBooking, error: createError } = await supabase
      .from("bookings")
      .insert({
        provider_id: providerId,
        tenant_id: effectiveTenantId,
        customer_id: customerId,
        customer_name: data.client_name,
        customer_email: data.client_email,
        customer_phone: data.client_phone,
        scheduled_at: new Date().toISOString(), // Current time for walk-in
        location_type: 'at_salon',
        booking_source: 'walk_in',
        status: 'checked_in',
        checked_in_time: checkedInTime,
        staff_id: data.team_member_id || null,
        notes: data.notes || null,
        currency: bookingCurrency,
      })
      .select(
        `
        id,
        booking_number,
        customer_id,
        customer_name,
        customer_email,
        customer_phone,
        service_id,
        service_name,
        staff_id,
        scheduled_at,
        checked_in_time,
        status,
        notes
      `.trim(),
      )
      .single();

    if (createError || !newBooking) {
      return handleApiError(
        createError || new Error("Failed to create booking"),
        "Failed to add to waiting room"
      );
    }
    const newBookingRow = newBooking as unknown as WaitingRoomBookingRow;

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

        // Update booking with service info
        await supabase
          .from("bookings")
          .update({
            service_id: data.service_id,
            service_name: serviceRow.title || data.service_name,
          })
          .eq("id", newBookingRow.id);
      }
    }

    let walkInStaffName = data.team_member_name || "Staff";
    const nbSid = newBookingRow.staff_id;
    if (nbSid) {
      const { data: st } = await supabase.from("provider_staff").select("name").eq("id", nbSid).maybeSingle();
      const staffRow = st as { name?: string | null } | null;
      if (staffRow?.name) walkInStaffName = staffRow.name;
    }

    // Transform to waiting room entry format
    const entry = {
      id: newBookingRow.id,
      appointment_id: newBookingRow.id,
      client_name: newBookingRow.customer_name || data.client_name,
      client_email: newBookingRow.customer_email || data.client_email,
      client_phone: newBookingRow.customer_phone || data.client_phone,
      service_id: newBookingRow.service_id || data.service_id,
      service_name: newBookingRow.service_name || data.service_name || "Service",
      team_member_id: newBookingRow.staff_id || data.team_member_id,
      team_member_name: walkInStaffName,
      checked_in_time: newBookingRow.checked_in_time || checkedInTime,
      checked_in_method: data.checked_in_method || "staff",
      status: "waiting" as const,
      notes: newBookingRow.notes || data.notes,
      position: undefined,
      estimated_wait_time: data.estimated_wait_time,
    };

    return successResponse(entry);
  } catch (error) {
    return handleApiError(error, "Failed to add to waiting room");
  }
}
