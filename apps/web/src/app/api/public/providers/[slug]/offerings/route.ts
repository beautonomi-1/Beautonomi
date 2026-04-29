import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requirePublicTenant } from "@/lib/tenant/require-public-tenant";
import type { OfferingCard } from "@/types/beautonomi";

/**
 * GET /api/public/providers/[slug]/offerings
 * 
 * Get all active offerings for a provider
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const tenantRes = await requirePublicTenant(request);
    if (tenantRes instanceof Response) return tenantRes;
    const { tenantId } = tenantRes;

    const supabase = getSupabaseAdmin();
    const rawSlug = (await params).slug;
    let slug: string;
    try { slug = decodeURIComponent(rawSlug); } catch { slug = rawSlug; }
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);

    // Use admin client to bypass RLS — consistent with the SSR profile loader
    const { data: provider, error: providerError } = await supabase
      .from("providers")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq(isUuid ? "id" : "slug", slug)
      .maybeSingle();

    if (providerError || !provider) {
      return NextResponse.json(
        { data: null, error: { message: "Provider not found", code: "NOT_FOUND" } },
        { status: 404 }
      );
    }

    const providerData = provider as any;

    // Get offerings with master service info, provider category, and category
    const { data: offerings, error: offeringsError } = await supabase
      .from("offerings")
      .select(`
        *,
        master_service:master_service_id (
          id,
          name
        ),
        provider_categories:provider_category_id (
          id,
          name,
          color,
          display_order,
          description
        )
      `)
      .eq("provider_id", providerData.id)
      .eq("is_active", true)
      .order("title");

    if (offeringsError) {
      console.error("Error fetching offerings:", offeringsError);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to fetch offerings",
            code: "FETCH_ERROR",
          },
        },
        { status: 500 }
      );
    }

    // Transform to include master_service_name
    // Priority: provider_categories.name > master_service.name > category_name > "Other Services"
    const transformedOfferings = (offerings || []).map((offering: any) => {
      // Try to get category name from multiple sources
      let categoryName: string | null = null;
      
      // First priority: provider_categories name (provider's custom category)
      if (offering.provider_categories?.name) {
        categoryName = offering.provider_categories.name;
      }
      // Second priority: master_service name (from relationship)
      else if (offering.master_service?.name) {
        categoryName = offering.master_service.name;
      }
      // Third priority: category_name field directly on offering
      else if (offering.category_name) {
        categoryName = offering.category_name;
      }
      
      // Final fallback: use "Other Services" only if no category found
      if (!categoryName || categoryName.trim() === "") {
        categoryName = "Other Services";
      }
      
      return {
        ...offering,
        master_service_name: categoryName,
      };
    });

    return NextResponse.json({
      data: transformedOfferings as OfferingCard[],
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/public/providers/[slug]/offerings:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to fetch offerings",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
