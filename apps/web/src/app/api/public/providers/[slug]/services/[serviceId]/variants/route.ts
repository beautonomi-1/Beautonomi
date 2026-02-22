import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { successResponse, notFoundResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * GET /api/public/providers/[slug]/services/[serviceId]/variants
 * 
 * Get all variants for a specific service (public endpoint for booking)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; serviceId: string }> }
) {
  try {
    const { slug, serviceId } = await params;
    const supabase = await getSupabaseServer();

    // Get provider by slug
    const { data: provider, error: providerError } = await supabase
      .from("providers")
      .select("id")
      .eq("slug", slug)
      .single();

    if (providerError || !provider) {
      return notFoundResponse("Provider not found");
    }

    // Verify the service belongs to this provider
    const { data: service, error: serviceError } = await supabase
      .from("offerings")
      .select("id, title, provider_id, service_type")
      .eq("id", serviceId)
      .eq("provider_id", provider.id)
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
      variants: (variants || []).map((v: any) => ({
        id: v.id,
        title: v.title,
        variant_name: v.variant_name,
        description: v.description,
        price: parseFloat(v.price || 0),
        duration: v.duration_minutes,
        currency: v.currency || "ZAR",
      })),
      total_count: (variants || []).length,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch variants");
  }
}
