import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { successResponse, notFoundResponse, handleApiError, requireRoleInApi, getProviderIdForUser } from "@/lib/supabase/api-helpers";

/**
 * GET /api/provider/services/[id]/variants
 * 
 * Get all variants for a specific service
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: serviceId } = await params;
    
    // Authenticate user
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    
    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // First get the parent service and verify it belongs to provider
    const { data: service, error: serviceError } = await supabase
      .from("offerings")
      .select("id, provider_id, title, service_type")
      .eq("id", serviceId)
      .eq("provider_id", providerId)
      .single();

    if (serviceError || !service) {
      return notFoundResponse("Service not found");
    }

    // Get all variants for this service
    const { data: variants, error } = await supabase
      .from("offerings")
      .select(`
        id,
        title,
        variant_name,
        description,
        price,
        duration_minutes,
        currency,
        variant_sort_order,
        display_order
      `)
      .eq("parent_service_id", serviceId)
      .eq("service_type", "variant")
      .eq("is_active", true)
      .order("variant_sort_order")
      .order("price");

    if (error) {
      throw error;
    }

    return successResponse({
      parent_service: {
        id: service.id,
        title: service.title,
        service_type: service.service_type,
      },
      variants: variants || [],
      total_count: (variants || []).length,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch variants");
  }
}
