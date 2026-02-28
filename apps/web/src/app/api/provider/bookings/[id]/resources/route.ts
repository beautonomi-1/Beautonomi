import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";

/**
 * GET /api/provider/bookings/[id]/resources
 * List resources assigned to this booking.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const { id: bookingId } = await params;

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const { data: booking } = await supabase
      .from("bookings")
      .select("id")
      .eq("id", bookingId)
      .eq("provider_id", providerId)
      .single();
    if (!booking) return notFoundResponse("Booking not found");

    const { data: rows, error } = await supabase
      .from("booking_resources")
      .select(`
        id,
        resource_id,
        scheduled_start_at,
        scheduled_end_at,
        resources(id, name, resource_groups(name))
      `)
      .eq("booking_id", bookingId);

    if (error) throw error;

    const resources = (rows || []).map((r: any) => {
      const res = r.resources;
      const group = res?.resource_groups;
      const groupName = Array.isArray(group) ? group[0]?.name : group?.name;
      return {
        id: r.id,
        resource_id: r.resource_id,
        resource_name: res?.name ?? "Resource",
        booking_id: bookingId,
        resource_group_name: groupName ?? null,
      };
    });

    return successResponse({ resources });
  } catch (error) {
    return handleApiError(error, "Failed to fetch booking resources");
  }
}

/**
 * POST /api/provider/bookings/[id]/resources
 * Assign a resource to this booking. Body: { resource_id: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const adminSupabase = getSupabaseAdmin();
    const { id: bookingId } = await params;

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const { data: booking, error: bookError } = await supabase
      .from("bookings")
      .select("id, scheduled_at, status")
      .eq("id", bookingId)
      .eq("provider_id", providerId)
      .single();

    if (bookError || !booking) return notFoundResponse("Booking not found");
    if ((booking as any).status === "cancelled") {
      return handleApiError(new Error("Cannot assign resources to a cancelled booking"), "Booking is cancelled", "VALIDATION", 400);
    }

    const body = await request.json().catch(() => ({}));
    const resourceId = body?.resource_id;
    if (!resourceId || typeof resourceId !== "string") {
      return handleApiError(new Error("resource_id is required"), "resource_id is required", "VALIDATION", 400);
    }

    const { data: bookingServices } = await adminSupabase
      .from("booking_services")
      .select("id, scheduled_start_at, scheduled_end_at")
      .eq("booking_id", bookingId)
      .order("scheduled_start_at", { ascending: true });

    const services = (bookingServices || []) as { id: string; scheduled_start_at: string; scheduled_end_at: string }[];
    const startAt = services.length > 0 ? services[0].scheduled_start_at : (booking as any).scheduled_at;
    const endAt = services.length > 0 ? services[services.length - 1].scheduled_end_at : null;
    if (!startAt) {
      return handleApiError(new Error("Booking has no scheduled time"), "Booking has no scheduled time", "VALIDATION", 400);
    }
    const start = new Date(startAt);
    const end = endAt ? new Date(endAt) : new Date(start.getTime() + 60 * 60 * 1000);

    const { checkResourceAvailability, assignResourcesToBooking } = await import("@/lib/resources/assignment");
    const check = await checkResourceAvailability(supabase, [resourceId], start, end, bookingId);
    if (!check.available) {
      return handleApiError(
        new Error("Resource not available at this time"),
        check.conflicts.map((c) => c.reason).join("; ") || "Resource not available",
        "CONFLICT",
        409
      );
    }

    await assignResourcesToBooking(adminSupabase, [
      {
        booking_id: bookingId,
        booking_service_id: services[0]?.id ?? null,
        resource_id: resourceId,
        scheduled_start_at: start.toISOString(),
        scheduled_end_at: end.toISOString(),
      },
    ]);

    const { data: newRows } = await supabase
      .from("booking_resources")
      .select(`
        id,
        resource_id,
        resources(id, name, resource_groups(name))
      `)
      .eq("booking_id", bookingId)
      .eq("resource_id", resourceId);

    const r = (newRows || [])[0] as any;
    const res = r?.resources;
    const group = res?.resource_groups;
    const groupName = Array.isArray(group) ? group[0]?.name : group?.name;
    const resource = {
      id: r?.id,
      resource_id: resourceId,
      resource_name: res?.name ?? "Resource",
      booking_id: bookingId,
      resource_group_name: groupName ?? null,
    };

    return successResponse({ resource, resources: [resource] });
  } catch (error) {
    return handleApiError(error, "Failed to assign resource");
  }
}
