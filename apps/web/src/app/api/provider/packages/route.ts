import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireRoleInApi, getProviderIdForUser, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { z } from "zod";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import {
  checkNewGateFeatureAccess,
  SUBSCRIPTION_FEATURE_KEYS,
} from "@/lib/subscriptions/feature-access";

const packageItemSchema = z.object({
  offering_id: z.string().uuid().optional(),
  product_id: z.string().uuid().optional(),
  product_variant_id: z.string().uuid().nullable().optional(),
  quantity: z.number().int().positive().default(1),
}).refine(
  (data) => (data.offering_id !== undefined) !== (data.product_id !== undefined),
  {
    message: "Either offering_id or product_id must be provided, but not both",
  }
);

const packageSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  price: z.number().positive("Price must be positive"),
  currency: z.string().optional(),
  discount_percentage: z.number().min(0).max(100).optional(),
  is_active: z.boolean().default(true),
  items: z.array(packageItemSchema).min(1, "At least one service or product is required"),
});

async function validatePackageOfferingItems(
  supabase: any,
  providerId: string,
  items: Array<{ offering_id?: string }>,
) {
  const offeringIds = [...new Set(items.map((item) => item.offering_id).filter(Boolean))] as string[];
  if (offeringIds.length === 0) return null;

  const { data, error } = await supabase
    .from("offerings")
    .select("id, title, service_type, provider_id")
    .in("id", offeringIds);
  if (error) throw error;

  const rows = (data ?? []) as any[];
  const byId = new Map(rows.map((row: any) => [row.id, row]));
  const missing = offeringIds.find((id) => !byId.has(id));
  if (missing) return "One or more package services could not be found.";

  const wrongProvider = rows.find((row: any) => row.provider_id !== providerId);
  if (wrongProvider) return "One or more package services do not belong to this provider.";

  const addon = rows.find((row: any) => row.service_type === "addon");
  if (addon) {
    return `Add-ons are optional extras and cannot be included as package items. Remove "${addon.title || "add-on"}" from the package and offer it as an add-on at checkout.`;
  }

  return null;
}

/**
 * GET /api/provider/packages
 * 
 * Get all service packages for provider
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    
    // Use service role client for better performance
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) {
      return successResponse({ packages: [] });
    }

    const { searchParams } = new URL(request.url);
    const locationId = searchParams.get("location_id");

    // Fetch packages first (simpler query)
    const { data: packages, error: packagesError } = await supabaseAdmin
      .from("service_packages")
      .select("id, name, description, price, currency, discount_percentage, is_active, created_at")
      .eq("provider_id", providerId)
      .order("created_at", { ascending: false });

    if (packagesError) {
      throw packagesError;
    }

    let filteredPackages = packages ?? [];

    // Branch filter: when location_id provided, only packages available at that location
    if (locationId && filteredPackages.length > 0) {
      const pkgIds = filteredPackages.map((p: { id: string }) => p.id);
      const { data: pkgLocs } = await supabaseAdmin
        .from("package_locations")
        .select("package_id")
        .in("package_id", pkgIds)
        .eq("location_id", locationId);
      const packageIdsAtLocation = new Set((pkgLocs ?? []).map((r: { package_id: string }) => r.package_id));
      const { data: allPkgLocs } = await supabaseAdmin
        .from("package_locations")
        .select("package_id")
        .in("package_id", pkgIds);
      const packageIdsWithAnyRestriction = new Set((allPkgLocs ?? []).map((r: { package_id: string }) => r.package_id));
      filteredPackages = filteredPackages.filter((p: { id: string }) =>
        !packageIdsWithAnyRestriction.has(p.id) || packageIdsAtLocation.has(p.id)
      );
    }

    if (filteredPackages.length === 0) {
      return successResponse({ packages: [] });
    }

    // Fetch package items separately to avoid deep nesting issues
    const packageIds = filteredPackages.map((p) => p.id);
    const { data: packageItems, error: itemsError } = await supabaseAdmin
      .from("service_package_items")
      .select(`
        id,
        package_id,
        offering_id,
        product_id,
        product_variant_id,
        quantity,
        offerings:offering_id (
          id,
          title,
          duration_minutes,
          price
        ),
        products:product_id (
          id,
          name,
          retail_price,
          sku,
          brand
        ),
        product_variants:product_variant_id (
          id,
          option_values,
          retail_price,
          sku
        )
      `)
      .in("package_id", packageIds)
      .order("id", { ascending: true });

    if (itemsError) {
      console.warn("Error fetching package items:", itemsError);
      // Continue with empty items rather than failing
    }

    // Group items by package_id
    const itemsByPackage = new Map<string, any[]>();
    packageItems?.forEach((item) => {
      if (!itemsByPackage.has(item.package_id)) {
        itemsByPackage.set(item.package_id, []);
      }
      itemsByPackage.get(item.package_id)!.push({
        id: item.id,
        offering_id: item.offering_id,
        product_id: item.product_id,
        product_variant_id: item.product_variant_id,
        quantity: item.quantity,
        offering: item.offerings,
        product: item.products,
        product_variant: item.product_variants,
      });
    });

    // Combine packages with their items
    const packagesWithItems = filteredPackages.map((pkg) => ({
      ...pkg,
      items: itemsByPackage.get(pkg.id) || [],
    }));

    return successResponse({ packages: packagesWithItems });
  } catch (error) {
    console.error("Error in GET /api/provider/packages:", error);
    return handleApiError(error, "Failed to fetch packages");
  }
}

/**
 * POST /api/provider/packages
 * 
 * Create a new service package
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    
    // Use service role client for better performance
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );
    
    const body = await request.json();

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return errorResponse("Provider not found", "PROVIDER_NOT_FOUND", 404);
    }

    const packagesOk = await checkNewGateFeatureAccess(
      providerId,
      SUBSCRIPTION_FEATURE_KEYS.packages,
      supabase,
    );
    if (!packagesOk) {
      return errorResponse(
        "Service packages are not included in your current subscription plan. Upgrade to create packages.",
        "SUBSCRIPTION_FEATURE_DISABLED",
        403,
      );
    }

    const { data: prow } = await supabase
      .from("providers")
      .select("tenant_id")
      .eq("id", providerId)
      .maybeSingle();
    const effectiveTenantId =
      (prow as { tenant_id?: string | null } | null)?.tenant_id ??
      (await resolveTenantIdWithZaFallback(request));
    const lastResortCurrency =
      (await getTenantRegionConfig(effectiveTenantId))?.defaultCurrency ?? LAST_RESORT_CURRENCY;

    const validated = packageSchema.parse(body);
    const offeringItemsError = await validatePackageOfferingItems(supabase, providerId, validated.items);
    if (offeringItemsError) {
      return errorResponse(offeringItemsError, "VALIDATION_ERROR", 400);
    }
    const packageCurrency = validated.currency ?? lastResortCurrency;

    // Create package
    const { data: packageData, error: packageError } = await supabase
      .from("service_packages")
      .insert({
        provider_id: providerId,
        name: validated.name,
        description: validated.description,
        price: validated.price,
        currency: packageCurrency,
        discount_percentage: validated.discount_percentage,
        is_active: validated.is_active,
      })
      .select()
      .single();

    if (packageError) {
      throw packageError;
    }

    // Create package items
    const items = validated.items.map((item) => ({
      package_id: packageData.id,
      ...(item.offering_id ? { offering_id: item.offering_id } : {}),
      ...(item.product_id ? { product_id: item.product_id } : {}),
      ...(item.product_id && item.product_variant_id ? { product_variant_id: item.product_variant_id } : {}),
      quantity: item.quantity,
    }));

    const { error: itemsError } = await supabase
      .from("service_package_items")
      .insert(items);

    if (itemsError) {
      // Rollback package creation
      await supabase.from("service_packages").delete().eq("id", packageData.id);
      throw itemsError;
    }

    // Fetch complete package with items
    const { data: completePackage } = await supabase
      .from("service_packages")
      .select(`
        *,
        items:service_package_items(
          id,
          offering_id,
          product_id,
          product_variant_id,
          quantity,
          offerings:offering_id(
            id,
            title,
            duration_minutes,
            price
          ),
          products:product_id(
            id,
            name,
            retail_price,
            sku,
            brand
          ),
          product_variants:product_variant_id(
            id,
            option_values,
            retail_price,
            sku
          )
        )
      `)
      .eq("id", packageData.id)
      .single();

    return successResponse({
      package: completePackage,
      message: "Package created successfully",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(
        error.issues.map((e) => e.message).join(", "),
        "VALIDATION_ERROR",
        400
      );
    }
    return handleApiError(error, "Failed to create package");
  }
}
