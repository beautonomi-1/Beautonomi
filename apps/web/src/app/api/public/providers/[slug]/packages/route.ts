import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { requirePublicTenant } from "@/lib/tenant/require-public-tenant";

/**
 * GET /api/public/providers/[slug]/packages
 *
 * Get all active service packages for a provider (public endpoint)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const tenantRes = await requirePublicTenant(request);
    if (tenantRes instanceof Response) return tenantRes;
    const { tenantId } = tenantRes;

    const { slug } = await params;
    const supabase = await getSupabaseServer();

    // Decode slug safely
    let decodedSlug: string;
    try {
      decodedSlug = decodeURIComponent(slug);
    } catch {
      decodedSlug = slug;
    }

    // Get provider by slug
    const { data: provider, error: providerError } = await supabase
      .from("providers")
      .select("id")
      .eq("slug", decodedSlug)
      .eq("status", "active")
      .eq("tenant_id", tenantId)
      .single();

    let providerId: string | null = null;
    
    if (providerError || !provider) {
      // Try original slug if decoded fails
      const retry = await supabase
        .from("providers")
        .select("id")
        .eq("slug", slug)
        .eq("status", "active")
        .eq("tenant_id", tenantId)
        .single();
      
      if (retry.error || !retry.data) {
        return successResponse([]); // Return empty array instead of 404
      }
      providerId = retry.data.id;
    } else {
      providerId = provider.id;
    }

    const { searchParams } = new URL(request.url);
    const locationId = searchParams.get("location_id");

    // Get all active packages for this provider
    const { data: packages, error: packagesError } = await supabase
      .from("service_packages")
      .select(`
        id,
        name,
        description,
        price,
        currency,
        discount_percentage,
        is_active,
        created_at
      `)
      .eq("provider_id", providerId)
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (packagesError) {
      throw packagesError;
    }

    let filteredPackages = packages ?? [];
    if (locationId && filteredPackages.length > 0) {
      const pkgIds = filteredPackages.map((p: any) => p.id);
      const { data: atLocation } = await supabase
        .from("package_locations")
        .select("package_id")
        .in("package_id", pkgIds)
        .eq("location_id", locationId);
      const packageIdsAtLocation = new Set((atLocation ?? []).map((r: any) => r.package_id));
      const { data: allPkgLocs } = await supabase
        .from("package_locations")
        .select("package_id")
        .in("package_id", pkgIds);
      const packageIdsWithRestriction = new Set((allPkgLocs ?? []).map((r: any) => r.package_id));
      filteredPackages = filteredPackages.filter(
        (p: any) => !packageIdsWithRestriction.has(p.id) || packageIdsAtLocation.has(p.id)
      );
    }

    // Get items (services and products) included in each package
    const packageIds = filteredPackages.map((pkg: any) => pkg.id);
    
    if (packageIds.length > 0) {
      const { data: packageItems, error: itemsError } = await supabase
        .from("service_package_items")
        .select(`
          package_id,
          offering_id,
          product_id,
          quantity,
          offerings:offering_id(id, title, duration_minutes),
          products:product_id(id, name, retail_price, sku, brand)
        `)
        .in("package_id", packageIds);

      if (!itemsError && packageItems) {
        // Group items by package
        const itemsByPackage: Record<string, any[]> = {};
        packageItems.forEach((item: any) => {
          if (!itemsByPackage[item.package_id]) {
            itemsByPackage[item.package_id] = [];
          }
          // §Release-audit 2026-04: the supabase join is aliased
          // `offerings:offering_id(...)` on line 114, so the hydrated
          // row surfaces as `item.offerings` (plural). This block
          // previously read `item.offering` (singular) which was
          // always undefined — so packages were rendered as "product
          // only" on the customer-visible provider profile. Fix the
          // alias so service items actually populate.
          const offeringRow = (item.offerings ?? item.offering) as
            | { id: string; title: string; duration_minutes?: number | null }
            | null
            | undefined;
          const productRow = (item.products ?? item.product) as
            | {
                id: string;
                name: string;
                retail_price?: number | null;
                sku?: string | null;
                brand?: string | null;
              }
            | null
            | undefined;
          if (offeringRow) {
            itemsByPackage[item.package_id].push({
              id: offeringRow.id,
              title: offeringRow.title,
              type: "service",
              duration_minutes: offeringRow.duration_minutes ?? null,
              quantity: item.quantity,
            });
          } else if (productRow) {
            itemsByPackage[item.package_id].push({
              id: productRow.id,
              title: productRow.name,
              type: "product",
              price: productRow.retail_price ?? null,
              sku: productRow.sku ?? null,
              brand: productRow.brand ?? null,
              quantity: item.quantity,
            });
          }
        });

        // Add items to each package
        filteredPackages.forEach((pkg: any) => {
          pkg.items = itemsByPackage[pkg.id] || [];
          pkg.services = itemsByPackage[pkg.id]?.filter((item: any) => item.type === "service") || [];
        });
      }
    }

    const normalized = filteredPackages.map((pkg: Record<string, unknown>) => ({
      ...pkg,
      title: (pkg.title as string) || (pkg.name as string) || "Package",
    }));

    const res = successResponse(normalized);
    res.headers.set("Cache-Control", "public, s-maxage=120, stale-while-revalidate=300");
    return res;
  } catch (error) {
    return handleApiError(error, "Failed to fetch packages");
  }
}
