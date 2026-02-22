import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { successResponse, notFoundResponse, handleApiError } from "@/lib/supabase/api-helpers";

interface ServiceWithVariants {
  id: string;
  title: string;
  description: string | null;
  price: number;
  duration_minutes: number;
  currency: string;
  service_type: string;
  category_id: string | null;
  category_name: string | null;
  supports_at_home: boolean;
  supports_at_salon: boolean;
  has_variants: boolean;
  variants: any[];
}

/**
 * GET /api/public/providers/[slug]/services
 * 
 * Get all bookable services for a provider (public endpoint for checkout)
 * - Filters out add-ons (they're shown separately during checkout)
 * - Groups variants under their parent service
 * - Returns services organized by category
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug: providerSlug } = await params;
    const supabase = await getSupabaseServer();

    // Get provider by slug
    const { data: provider, error: providerError } = await supabase
      .from("providers")
      .select("id, business_name, slug")
      .eq("slug", providerSlug)
      .single();

    if (providerError || !provider) {
      return notFoundResponse("Provider not found");
    }

    // Get all active services (excluding add-ons and variants with parents)
    const { data: services, error: servicesError } = await supabase
      .from("offerings")
      .select(`
        id,
        title,
        description,
        price,
        duration_minutes,
        currency,
        service_type,
        service_available_for,
        supports_at_home,
        supports_at_salon,
        online_booking_enabled,
        parent_service_id,
        variant_name,
        variant_sort_order,
        display_order,
        provider_category_id,
        provider_categories (
          id,
          name,
          color,
          display_order
        )
      `)
      .eq("provider_id", provider.id)
      .eq("is_active", true)
      .eq("online_booking_enabled", true)
      .neq("service_type", "addon") // Exclude add-ons
      .order("display_order");

    if (servicesError) {
      throw servicesError;
    }

    // Separate parent services and variants
    const parentServices: any[] = [];
    const variantsByParent: Record<string, any[]> = {};

    (services || []).forEach((service: any) => {
      if (service.service_type === "variant" && service.parent_service_id) {
        // This is a variant - group it under parent
        if (!variantsByParent[service.parent_service_id]) {
          variantsByParent[service.parent_service_id] = [];
        }
        variantsByParent[service.parent_service_id].push({
          id: service.id,
          title: service.title,
          variant_name: service.variant_name || service.title,
          description: service.description,
          price: service.price,
          duration_minutes: service.duration_minutes,
          currency: service.currency,
          variant_sort_order: service.variant_sort_order,
        });
      } else if (!service.parent_service_id) {
        // This is a parent/standalone service
        parentServices.push(service);
      }
    });

    // Build final service list with variants attached
    const servicesWithVariants: ServiceWithVariants[] = parentServices.map((service) => {
      const variants = variantsByParent[service.id] || [];
      // Sort variants by sort_order then price
      variants.sort((a, b) => (a.variant_sort_order || 0) - (b.variant_sort_order || 0) || a.price - b.price);

      return {
        id: service.id,
        title: service.title,
        description: service.description,
        price: service.price,
        duration_minutes: service.duration_minutes,
        currency: service.currency,
        service_type: service.service_type,
        service_available_for: service.service_available_for,
        category_id: service.provider_category_id,
        category_name: service.provider_categories?.name || null,
        category_color: service.provider_categories?.color || null,
        category_order: service.provider_categories?.display_order || 0,
        supports_at_home: service.supports_at_home || false,
        supports_at_salon: service.supports_at_salon !== false,
        has_variants: variants.length > 0,
        variants: variants,
        display_order: service.display_order,
      };
    });

    // Group by category
    const categories: Record<string, { name: string; color: string | null; order: number; services: ServiceWithVariants[] }> = {};
    
    servicesWithVariants.forEach((service) => {
      const categoryId = service.category_id || "uncategorized";
      const categoryName = service.category_name || "Other Services";
      
      if (!categories[categoryId]) {
        categories[categoryId] = {
          name: categoryName,
          color: (service as any).category_color || null,
          order: (service as any).category_order || 999,
          services: [],
        };
      }
      categories[categoryId].services.push(service);
    });

    // Convert to sorted array
    const sortedCategories = Object.entries(categories)
      .map(([id, cat]) => ({
        id,
        name: cat.name,
        color: cat.color,
        services: cat.services.sort((a, b) => ((a as any).display_order || 0) - ((b as any).display_order || 0)),
      }))
      .sort((a, b) => {
        const orderA = categories[a.id]?.order || 999;
        const orderB = categories[b.id]?.order || 999;
        return orderA - orderB;
      });

    return successResponse({
      provider: {
        id: provider.id,
        business_name: provider.business_name,
        slug: provider.slug,
      },
      categories: sortedCategories,
      total_services: servicesWithVariants.length,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch services");
  }
}
