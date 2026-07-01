import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAdminSection, successResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_USERS_TRUST } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminSection(ADMIN_SECTION_USERS_TRUST, request);
    const supabase = await getSupabaseServer(request);

    if (!supabase) {
      return successResponse([]);
    }

    const tenantId = await resolveAdminApiTenantId(request);
    const { id } = await params;

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
      .eq("tenant_id", tenantId)
      .eq("customer_id", id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (bookingsError) {
      console.error("Error fetching bookings:", bookingsError);
      return successResponse([]);
    }

    // Fetch related data separately to avoid join issues
    type BookingRow = { provider_id?: string; service_id?: string; id: string; status?: string; scheduled_at?: string; total_amount?: number; created_at?: string };
    const providerIds = [...new Set((bookings || []).map((b: BookingRow) => b.provider_id).filter(Boolean))];
    const serviceIds = [...new Set((bookings || []).map((b: BookingRow) => b.service_id).filter(Boolean))];

    const { data: providers } = providerIds.length > 0
      ? await supabase
          .from("providers")
          .select("id, business_name, full_name")
          .eq("tenant_id", tenantId)
          .in("id", providerIds)
      : { data: [] };

    const { data: services } = serviceIds.length > 0
      ? await supabase
          .from("master_services")
          .select("id, name")
          .in("id", serviceIds)
      : { data: [] };

    type ProviderRow = { id: string; business_name?: string; full_name?: string };
    type ServiceRow = { id: string; name?: string };
    const providerMap = new Map((providers || []).map((p: ProviderRow) => [p.id, p]));
    const serviceMap = new Map((services || []).map((s: ServiceRow) => [s.id, s]));

    const transformedBookings = (bookings || []).map((booking: BookingRow) => {
      const provider = providerMap.get(booking.provider_id ?? "");
      const service = serviceMap.get(booking.service_id ?? "");
      
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
