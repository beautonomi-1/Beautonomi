import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { successResponse, notFoundResponse, handleApiError, requireRoleInApi, getProviderIdForUser } from "@/lib/supabase/api-helpers";

/**
 * GET /api/provider/services/[id]/variants
 *
 * Get all variants for a specific service.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: serviceId } = await params;

    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const { data: service, error: serviceError } = await supabase
      .from("offerings")
      .select("id, provider_id, title, service_type, currency, supports_at_home, supports_at_salon")
      .eq("id", serviceId)
      .eq("provider_id", providerId)
      .single();

    if (serviceError || !service) return notFoundResponse("Service not found");

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

    if (error) throw error;

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

/**
 * POST /api/provider/services/[id]/variants
 *
 * Create a new variant for a service. Used by both the provider mobile app and web portal.
 * Inserts an offerings row with service_type='variant' and parent_service_id=[id].
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: serviceId } = await params;

    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    // Verify parent service exists and belongs to this provider
    const { data: parent, error: parentError } = await supabase
      .from("offerings")
      .select("id, provider_id, title, currency, supports_at_home, supports_at_salon, provider_category_id")
      .eq("id", serviceId)
      .eq("provider_id", providerId)
      .single();

    if (parentError || !parent) return notFoundResponse("Service not found");

    const body = await request.json();
    const { title, variant_name, description, price, duration_minutes, variant_sort_order } = body;

    if (!title || price === undefined || price === null || !duration_minutes) {
      return handleApiError(
        new Error("title, price, and duration_minutes are required"),
        "Validation failed",
        "VALIDATION_ERROR",
        400
      );
    }

    const { data: variant, error } = await supabase
      .from("offerings")
      .insert({
        provider_id: providerId,
        title,
        variant_name: variant_name || title,
        description: description || null,
        price: Number(price),
        duration_minutes: Number(duration_minutes),
        currency: parent.currency || "ZAR",
        service_type: "variant",
        parent_service_id: serviceId,
        variant_sort_order: variant_sort_order ?? 0,
        is_active: true,
        online_booking_enabled: true,
        supports_at_home: (parent as any).supports_at_home ?? false,
        supports_at_salon: (parent as any).supports_at_salon ?? true,
        provider_category_id: (parent as any).provider_category_id || null,
        buffer_minutes: 0,
      })
      .select()
      .single();

    if (error || !variant) throw error || new Error("Failed to create variant");

    return successResponse(variant);
  } catch (error) {
    return handleApiError(error, "Failed to create variant");
  }
}
