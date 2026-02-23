import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const supabase = await getSupabaseServer(request);

    if (!supabase) {
      return successResponse([]);
    }

    const { id } = await params;

    // Fetch bookings for the user - check both user_id and customer_id columns
    const { data: bookings, error: bookingsError } = await supabase
      .from("bookings")
      .select(`
        id,
        status,
        scheduled_at,
        total_amount,
        created_at,
        customer_id,
        provider_id,
        service_id
      `)
      .or(`customer_id.eq.${id},user_id.eq.${id}`)
      .order("created_at", { ascending: false })
      .limit(100);

    if (bookingsError) {
      console.error("Error fetching bookings:", bookingsError);
      return successResponse([]);
    }

    // Fetch related data separately to avoid join issues
    const providerIds = [...new Set((bookings || []).map((b: any) => b.provider_id).filter(Boolean))];
    const serviceIds = [...new Set((bookings || []).map((b: any) => b.service_id).filter(Boolean))];

    const { data: providers } = providerIds.length > 0
      ? await supabase
          .from("providers")
          .select("id, business_name, full_name")
          .in("id", providerIds)
      : { data: [] };

    const { data: services } = serviceIds.length > 0
      ? await supabase
          .from("master_services")
          .select("id, name")
          .in("id", serviceIds)
      : { data: [] };

    const providerMap = new Map((providers || []).map((p: any) => [p.id, p]));
    const serviceMap = new Map((services || []).map((s: any) => [s.id, s]));

    // Transform the data to match expected format
    const transformedBookings = (bookings || []).map((booking: any) => {
      const provider = providerMap.get(booking.provider_id);
      const service = serviceMap.get(booking.service_id);
      
      return {
        id: booking.id,
        status: booking.status,
        service_name: service?.name || "Unknown Service",
        provider_name:
          provider?.business_name ||
          provider?.full_name ||
          "Unknown Provider",
        scheduled_at: booking.scheduled_at,
        total_amount: booking.total_amount || 0,
        created_at: booking.created_at,
      };
    });

    return successResponse(transformedBookings);
  } catch (error) {
    return handleApiError(error, "Failed to fetch user bookings");
  }
}
