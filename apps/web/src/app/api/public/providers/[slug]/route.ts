import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getMapboxService } from "@/lib/mapbox/mapbox";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { getTenantRegionConfig } from "@/lib/regions/config";
import type { PublicProfilePromotion, PublicProviderDetail } from "@/types/beautonomi";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { resolveActiveBadge } from "@/lib/provider/active-badge";
import { isProviderPubliclyVisible } from "@/lib/providers/public-provider-visibility";
import { redactProviderDetailForTier } from "@/lib/providers/provider-disclosure";

function mapPublicProfilePromotions(rows: unknown, currency: string): PublicProfilePromotion[] {
  if (!Array.isArray(rows)) return [];
  const now = Date.now();
  const out: PublicProfilePromotion[] = [];
  for (const raw of rows) {
    const r = raw as Record<string, unknown>;
    if (!r?.code || typeof r.code !== "string") continue;
    const vf = r.valid_from ? new Date(String(r.valid_from)).getTime() : 0;
    const vu = r.valid_until ? new Date(String(r.valid_until)).getTime() : Number.POSITIVE_INFINITY;
    if (now < vf || now > vu) continue;
    const type = String(r.type || "");
    const val = Number(r.value ?? 0);
    const savings =
      type === "percentage"
        ? `${Math.min(100, Math.max(0, Number.isFinite(val) ? val : 0))}% off`
        : `${currency} ${Number.isFinite(val) ? val.toFixed(0) : "0"} off`;
    const title = typeof r.name === "string" && r.name.trim() ? r.name.trim() : r.code;
    const desc = typeof r.description === "string" && r.description.trim() ? r.description.trim() : null;
    out.push({ code: r.code.toUpperCase(), title, description: desc, savings_label: savings });
    if (out.length >= 6) break;
  }
  return out;
}

// Increase timeout for this route
export const maxDuration = 30; // 30 seconds
// Cache provider profiles for 5 minutes (they don't change often)
export const revalidate = 300;

/**
 * GET /api/public/providers/[slug]
 * 
 * Returns detailed provider information for public viewing.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    let tenantId: string;
    try {
      tenantId = await resolveTenantIdWithZaFallback(request);
    } catch (tenantErr) {
      console.error("Tenant resolution failed in /api/public/providers/[slug]:", tenantErr);
      return NextResponse.json(
        { data: null, error: { message: "Tenant not configured", code: "TENANT_UNAVAILABLE" } },
        { status: 503 }
      );
    }
    // Use admin client so providers are visible regardless of status — matching
    // the SSR getPublicProviderDetail loader. The anon client with RLS blocks any
    // provider whose status != 'active', causing the profile to load (SSR = admin)
    // but all client-side tab fetches to 404 (API routes = anon).
    const supabase = getSupabaseAdmin();
    const tenantRegion = await getTenantRegionConfig(tenantId);
    const defaultCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;
    const { slug: rawSlug } = await params;
    const { searchParams } = new URL(request.url);
    const latParam = searchParams.get("lat");
    const lngParam = searchParams.get("lng");
    const userLat = latParam != null && lngParam != null ? parseFloat(latParam) : NaN;
    const userLng = lngParam != null && latParam != null ? parseFloat(lngParam) : NaN;
    const hasUserLocation = !Number.isNaN(userLat) && !Number.isNaN(userLng) && userLat >= -90 && userLat <= 90 && userLng >= -180 && userLng <= 180;

    // Decode slug in case it's URL encoded (safely)
    let slug: string;
    let decodedSlug: string;
    try {
      decodedSlug = decodeURIComponent(rawSlug);
      slug = decodedSlug;
    } catch {
      // If decoding fails, use original
      slug = rawSlug;
      decodedSlug = rawSlug;
    }


    // Fetch provider via admin client (bypasses RLS). Visibility is enforced below
    // with isProviderPubliclyVisible — matching getPublicProviderDetail SSR loader.
    // Accept UUIDs in the slug position so mobile deep-links with only provider_id work.
    const PROVIDER_SELECT = `
      id, slug, business_name, business_type, description,
      rating_average, review_count, thumbnail_url, avatar_url,
      gallery, is_featured, is_verified, currency,
      years_in_business, tax_rate_percent, tax_inclusive, tips_enabled, timezone, website,
      social_media_links, accepts_custom_requests,
      response_rate, response_time_hours, languages_spoken,
      offers_mobile_services, minimum_mobile_booking_amount,
      status, deleted_at,
      user_id, users(include_in_search_engines)
    `;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(decodedSlug);

    let provider: any;
    let providerError: any;

    if (isUuid) {
      const r = await supabase.from("providers").select(PROVIDER_SELECT).eq("id", decodedSlug).eq("tenant_id", tenantId).maybeSingle();
      provider = r.data; providerError = r.error;
    } else {
      const r = await supabase.from("providers").select(PROVIDER_SELECT).eq("slug", decodedSlug).eq("tenant_id", tenantId).maybeSingle();
      provider = r.data; providerError = r.error;
      // Fallback: try original (non-decoded) slug
      if (!provider && !providerError) {
        const r2 = await supabase.from("providers").select(PROVIDER_SELECT).eq("slug", slug).eq("tenant_id", tenantId).maybeSingle();
        provider = r2.data; providerError = r2.error;
      }
    }

    if (providerError || !provider || !isProviderPubliclyVisible(provider)) {
      return NextResponse.json(
        { data: null, error: { message: "Provider not found", code: "NOT_FOUND" } },
        { status: 404 }
      );
    }


    const providerData = provider as any;
    
    // Check if provider has include_in_search_engines enabled
    // The users relation should be available from the select query
    const userData = (providerData as any).users;
    const includeInSearchEngines = userData?.include_in_search_engines ?? false;
    
    // Extract new fields from provider data (with fallbacks for migration period)
    const acceptsCustomRequests = providerData.accepts_custom_requests ?? true;
    const website = providerData.website ?? null;
    const socialMediaLinks = providerData.social_media_links ?? {};
    const responseRate = providerData.response_rate ?? 100;
    const responseTimeHours = providerData.response_time_hours ?? 1;
    const languagesSpoken = providerData.languages_spoken ?? ['English'];

    // Fetch all related data in parallel for better performance
    const loadPublicRatings = async () => {
      const statusFiltered = await supabase
        .from("reviews")
        .select("rating")
        .eq("provider_id", providerData.id)
        .eq("status", "published");
      if (!statusFiltered.error) {
        return statusFiltered.data ?? [];
      }
      const visibleFiltered = await supabase
        .from("reviews")
        .select("rating")
        .eq("provider_id", providerData.id)
        .eq("is_visible", true);
      return visibleFiltered.data ?? [];
    };

    const [
      locationsResult,
      offeringsResult,
      staffCountResult,
      pointsResult,
      publicRatings,
      providerPromotionsResult,
    ] = await Promise.all([
      // Fetch locations
      supabase
        .from("provider_locations")
        .select("*")
        .eq("provider_id", providerData.id)
        .eq("is_active", true),
      
      // Fetch categories and prices (from offerings) - also get supports_at_home
      supabase
        .from("offerings")
        .select("category_id, price, currency, category_name, provider_category_id, supports_at_home, master_service_id")
        .eq("provider_id", providerData.id)
        .eq("is_active", true)
        .limit(100), // Limit to prevent huge queries
      
      // Fetch staff count (for salons)
      providerData.business_type === "salon"
        ? supabase
            .from("provider_staff")
            .select("*", { count: "exact", head: true })
            .eq("provider_id", providerData.id)
            .eq("is_active", true)
        : Promise.resolve({ count: 0 }),
      
      // Fetch points and badge
      supabase
        .from("provider_points")
        .select(`
          total_points,
          current_badge_id,
          badge_expires_at,
          provider_badges!provider_points_current_badge_id_fkey (
            id,
            name,
            slug,
            description,
            icon_url,
            tier,
            color,
            requirements,
            benefits
          )
        `)
        .eq("provider_id", providerData.id)
        .maybeSingle(),
      loadPublicRatings(),
      supabase
        .from("promotions")
        .select("code, type, value, description, name, is_active, valid_from, valid_until")
        .eq("provider_id", providerData.id)
        .eq("is_active", true)
        .eq("public_on_profile", true)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    const locations = locationsResult.data || [];
    const offerings = offeringsResult.data || [];
    const staffCount = staffCountResult.count || undefined;
    const { getCancellationPolicy } = await import("@/lib/bookings/cancellation-policy");
    const cancellationPolicy = await getCancellationPolicy(supabase, providerData.id, "at_salon");
    const pointsData = pointsResult.data;
    const profile_promotions = mapPublicProfilePromotions(
      providerPromotionsResult.data,
      providerData.currency || defaultCurrency,
    );

    const reviewRows = Array.isArray(publicRatings) ? publicRatings : [];
    const reviewCountLive = reviewRows.length;
    const ratingAverageLive =
      reviewCountLive > 0
        ? reviewRows.reduce((sum: number, r: { rating?: number | null }) => sum + Number(r.rating ?? 0), 0) / reviewCountLive
        : 0;
    
    // Extract badge from points data (Supabase may return relation as array).
    // Guarded so an expired (unmaintained) badge never shows publicly.
    let currentBadge = null;
    const rawBadge = Array.isArray(pointsData?.provider_badges) ? pointsData?.provider_badges?.[0] : pointsData?.provider_badges;
    const badge = resolveActiveBadge(rawBadge, (pointsData as { badge_expires_at?: string | null } | null)?.badge_expires_at);
    if (badge) {
      currentBadge = {
        id: badge.id,
        name: badge.name,
        slug: badge.slug,
        description: badge.description,
        icon_url: badge.icon_url,
        tier: badge.tier,
        color: badge.color,
        requirements: badge.requirements,
        benefits: badge.benefits,
      };
    }

    // Get category names - prioritize provider_categories, then global_service_categories
    const categories: string[] = [];
    
    // Get provider category IDs
    const providerCategoryIds = Array.from(
      new Set(offerings?.map((o: any) => o.provider_category_id).filter(Boolean) || [])
    );
    
    if (providerCategoryIds.length > 0) {
      const { data: providerCategoryData } = await supabase
        .from("provider_categories")
        .select("name")
        .in("id", providerCategoryIds);
      categories.push(...(providerCategoryData?.map((c: any) => c.name) || []));
    }
    
    // Get category names from global_service_categories
    const categoryIds = Array.from(
      new Set(offerings?.map((o: any) => o.category_id).filter(Boolean) || [])
    );
    if (categoryIds.length > 0) {
      const { data: categoryData } = await supabase
        .from("global_service_categories")
        .select("name")
        .in("id", categoryIds);
      const globalCategories = categoryData?.map((c: any) => c.name) || [];
      categories.push(...globalCategories.filter((c: string) => !categories.includes(c)));
    }

    const offeringsData = offerings as any;
    const offeringCategories = Array.from(
      new Set(offeringsData?.map((o: any) => o.category_name).filter(Boolean) || [])
    );
    // Merge both category sources
    categories.push(...(Array.from(offeringCategories) as string[]).filter((c) => !categories.includes(c)));

    // Get primary location for city/country
    const primaryLocation = locations?.find((loc: any) => loc.is_primary) || locations?.[0];
    const city = primaryLocation?.city || "";
    const country = primaryLocation?.country || "";

    // Distance from user to provider (nearest location) when lat/lng provided - same Haversine as home API
    let distance_km: number | null = null;
    if (hasUserLocation && locations && locations.length > 0) {
      try {
        const mapbox = await getMapboxService();
        const userCoords = { latitude: userLat, longitude: userLng };
        let minDistance = Infinity;
        for (const loc of locations as any[]) {
          const locLat = loc.latitude ?? loc.address_lat;
          const locLng = loc.longitude ?? loc.address_lng;
          if (locLat != null && locLng != null) {
            const d = mapbox.calculateDistance(userCoords, { latitude: Number(locLat), longitude: Number(locLng) });
            if (d < minDistance) minDistance = d;
          }
        }
        if (Number.isFinite(minDistance)) distance_km = Math.round(minDistance * 10) / 10;
      } catch {
        // Leave distance_km null if Mapbox unavailable
      }
    }

    // Calculate starting_price from offerings
    let startingPrice: number | undefined;
    if (offerings && offerings.length > 0) {
      const prices = (offerings as any[])
        .filter((o: any) => o.price && o.price > 0)
        .map((o: any) => o.price);
      if (prices.length > 0) {
        startingPrice = Math.min(...prices);
      }
    }

    // Determine service type support (house calls and salon)
    let supportsHouseCalls = false;
    let supportsSalon = false;

    // Check if provider supports house calls (normalize boolean-like values)
    if (offerings && offerings.length > 0) {
      supportsHouseCalls = (offerings as any[]).some((o: any) => Boolean(o.supports_at_home));
    }

    // Keep provider-level capability as a fallback signal when data is partially migrated.
    if (!supportsHouseCalls && providerData.offers_mobile_services === true) {
      supportsHouseCalls = true;
    }

    // Support salon only if provider has at least one physical salon location (location_type = 'salon').
    // Base-only locations (location_type = 'base') are for distance/travel only—mobile-only freelancers.
    const salonLocations = (locations || []).filter((l: any) => (l.location_type || "salon") === "salon");
    supportsSalon = salonLocations.length > 0;

    // Ensure business_name is not null/undefined
    if (!providerData.business_name) {
      console.warn(`Provider ${providerData.id} (slug: ${slug}) has no business_name`);
    }

    const result = {
      id: providerData.id,
      slug: providerData.slug,
      business_name: providerData.business_name || "Provider",
      business_type: providerData.business_type,
      rating: Number.isFinite(ratingAverageLive) ? Math.round(ratingAverageLive * 100) / 100 : (providerData.rating_average ?? 0),
      review_count: reviewCountLive || 0,
      thumbnail_url: providerData.thumbnail_url,
      avatar_url: providerData.avatar_url ?? null,
      city: city,
      country: country,
      is_featured: providerData.is_featured ?? false,
      is_verified: providerData.is_verified ?? false,
      starting_price: startingPrice,
      currency: providerData.currency || defaultCurrency,
      description: providerData.description || "",
      gallery: providerData.gallery || [],
      categories: categories as string[],
      supports_house_calls: supportsHouseCalls,
      supports_salon: supportsSalon,
      // Include location_type so booking flow can show only salon locations for "Visit Salon"; base = distance-only (mobile-only).
      locations: ((locations || []) as any[]).map((loc: any) => ({
        id: loc.id,
        provider_id: loc.provider_id,
        name: loc.name,
        is_primary: loc.is_primary ?? false,
        address_line1: loc.address_line1,
        address_line2: loc.address_line2,
        city: loc.city,
        state: loc.state,
        country: loc.country,
        postal_code: loc.postal_code,
        latitude: loc.latitude,
        longitude: loc.longitude,
        phone: loc.phone,
        is_active: loc.is_active,
        working_hours: loc.working_hours,
        location_type: loc.location_type || "salon",
        created_at: loc.created_at,
        updated_at: loc.updated_at,
      })),
      policies: {
        cancellation_window_hours: cancellationPolicy?.hours_before_cutoff ?? 24,
        grace_window_minutes: cancellationPolicy?.grace_window_minutes ?? 15,
        late_refund_percentage: cancellationPolicy?.refund_percentage ?? 0,
        requires_deposit: Boolean(providerData.requires_deposit),
        deposit_percentage: providerData.deposit_percentage ?? null,
        no_show_fee_enabled: Boolean(providerData.no_show_fee_enabled),
        no_show_fee_amount: providerData.no_show_fee_amount ?? null,
        currency: providerData.currency,
        policy_text: cancellationPolicy?.policy_text ?? null,
      },
      staff_count: staffCount,
      years_in_business: providerData.years_in_business,
      accepts_custom_requests: acceptsCustomRequests,
      website: website,
      social_media_links: socialMediaLinks,
      response_rate: responseRate,
      response_time_hours: responseTimeHours,
      languages_spoken: languagesSpoken,
      current_badge: currentBadge,
      total_points: pointsData?.total_points || undefined,
      distance_km: distance_km ?? undefined,
      /** Expose to clients so booking pages can add noindex when provider opted out */
      seo_indexable: includeInSearchEngines,
      tax_rate_percent: providerData.tax_rate_percent ?? 0,
      tax_inclusive: Boolean((providerData as { tax_inclusive?: boolean | null }).tax_inclusive),
      tips_enabled: providerData.tips_enabled ?? true,
      timezone: providerData.timezone ?? "Africa/Johannesburg",
      profile_promotions,
    } as PublicProviderDetail;

    const publicResult = redactProviderDetailForTier(result, "anon");

    const response = NextResponse.json({
      data: publicResult,
      error: null,
    });
    
    // Cache provider profiles for 5 minutes
    response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    
    // Add X-Robots-Tag header to control search engine indexing
    // If include_in_search_engines is false, tell search engines not to index this page
    if (!includeInSearchEngines) {
      response.headers.set('X-Robots-Tag', 'noindex, nofollow');
    }
    
    return response;
  } catch (error) {
    console.error("Unexpected error in /api/public/providers/[slug]:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to fetch provider",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
