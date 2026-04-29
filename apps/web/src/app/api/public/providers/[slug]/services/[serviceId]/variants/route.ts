import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, notFoundResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { requirePublicTenant } from "@/lib/tenant/require-public-tenant";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

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
    const tenantRes = await requirePublicTenant(request);
    if (tenantRes instanceof Response) return tenantRes;
    const { tenantId } = tenantRes;
    const tenantRegion = await getTenantRegionConfig(tenantId);
    const defaultCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;

    const { slug: rawSlug, serviceId } = await params;
    let slug: string;
    try { slug = decodeURIComponent(rawSlug); } catch { slug = rawSlug; }
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);
    // Use admin client to bypass RLS — consistent with the SSR profile loader
    const supabase = getSupabaseAdmin();

    const { data: provider, error: providerError } = await supabase
      .from("providers")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq(isUuid ? "id" : "slug", slug)
      .maybeSingle();

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
        buffer_minutes,
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
        bufferMinutes: Number(v.buffer_minutes ?? 0),
        currency: v.currency || defaultCurrency,
      })),
      total_count: (variants || []).length,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch variants");
  }
}
