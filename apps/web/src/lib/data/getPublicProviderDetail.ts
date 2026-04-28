import { cache } from "react";
import { headers } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSupabaseServer } from "@/lib/supabase/server";
import { haversineDistanceKm } from "@/lib/geo/distance";
import { resolveTenantIdFromServerHeaders } from "@/lib/tenant/resolve-tenant-from-headers";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import type { PublicProfilePromotion, PublicProviderDetail } from "@/types/beautonomi";

function isUnmappedPreviewOrDevHost(host: string): boolean {
  const h = host.toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h.endsWith(".vercel.app");
}

async function getServerHost(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-host") || h.get("host") || "").split(":")[0] || "";
}

async function resolvePublicProfileTenantId(): Promise<string> {
  try {
    return await resolveTenantIdFromServerHeaders();
  } catch (error) {
    const host = await getServerHost();
    if (!isUnmappedPreviewOrDevHost(host)) throw error;

    const { data } = await getSupabaseAdmin()
      .from("tenants")
      .select("id")
      .eq("slug", "za")
      .eq("is_active", true)
      .maybeSingle();
    if (data?.id) return data.id as string;
    throw error;
  }
}

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

/**
 * Server-side data loader for the partner-profile page.
 * Wrapped in React.cache so `generateMetadata` and the page body share one DB round-trip.
 */
export const getPublicProviderDetail = cache(
  async (
    slug: string,
    userLat?: number,
    userLng?: number,
  ): Promise<{ provider: PublicProviderDetail | null; seoIndexable: boolean }> => {
    try {
      const supabase = await getSupabaseServer();

      const tenantId = await resolvePublicProfileTenantId();

      const tenantRegion = await getTenantRegionConfig(tenantId);
      const defaultCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;

      let decodedSlug: string;
      try {
        decodedSlug = decodeURIComponent(slug);
      } catch {
        decodedSlug = slug;
      }

      // Resolve provider row
      let providerRow = await resolveProvider(supabase, decodedSlug, slug, tenantId);
      if (!providerRow && isUnmappedPreviewOrDevHost(await getServerHost())) {
        providerRow = await resolveProviderAcrossTenants(supabase, decodedSlug, slug);
      }
      if (!providerRow) return { provider: null, seoIndexable: false };

      const providerData = providerRow as Record<string, any>;
      const userData = providerData.users as Record<string, any> | null;
      const includeInSearchEngines = userData?.include_in_search_engines ?? false;
      const acceptsCustomRequests = providerData.accepts_custom_requests ?? true;

      // Parallel queries
      const [locationsResult, offeringsResult, staffCountResult, policiesResult, pointsResult] =
        await Promise.all([
          supabase
            .from("provider_locations")
            .select("*")
            .eq("provider_id", providerData.id)
            .eq("is_active", true),
          supabase
            .from("offerings")
            .select(
              "category_id, price, currency, category_name, provider_category_id, supports_at_home, service_id",
            )
            .eq("provider_id", providerData.id)
            .eq("is_active", true)
            .limit(100),
          providerData.business_type === "salon"
            ? supabase
                .from("provider_staff")
                .select("*", { count: "exact", head: true })
                .eq("provider_id", providerData.id)
                .eq("is_active", true)
            : Promise.resolve({ count: 0 }),
          supabase
            .from("provider_policies")
            .select("*")
            .eq("provider_id", providerData.id)
            .maybeSingle(),
          supabase
            .from("provider_points")
            .select(
              `total_points, current_badge_id,
              provider_badges!provider_points_current_badge_id_fkey (
                id, name, slug, description, icon_url, tier, color, requirements, benefits
              )`,
            )
            .eq("provider_id", providerData.id)
            .maybeSingle(),
        ]);

      const locations = locationsResult.data || [];
      const offerings = offeringsResult.data || [];
      const staffCount = staffCountResult.count || undefined;
      const policies = policiesResult.data;
      const pointsData = pointsResult.data as Record<string, any> | null;

      // Badge
      let currentBadge = null;
      const badge = Array.isArray(pointsData?.provider_badges)
        ? pointsData?.provider_badges?.[0]
        : pointsData?.provider_badges;
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

      const primaryLocation =
        (locations as any[]).find((loc: any) => loc.is_primary) || locations[0];
      const city = (primaryLocation as any)?.city || "";
      const country = (primaryLocation as any)?.country || "";

      const providerCategoryIds = Array.from(
        new Set((offerings as any[]).map((o) => o.provider_category_id).filter(Boolean)),
      );
      const categoryIds = Array.from(
        new Set((offerings as any[]).map((o) => o.category_id).filter(Boolean)),
      );
      const supportsHouseCallsQuick = (offerings as any[]).some((o) => Boolean(o.supports_at_home));
      const serviceIdsForHomeCheck = !supportsHouseCallsQuick
        ? Array.from(new Set((offerings as any[]).map((o) => o.service_id).filter(Boolean)))
        : [];

      const [pcResult, gcResult, sResult] = await Promise.all([
        providerCategoryIds.length > 0
          ? supabase.from("provider_categories").select("name").in("id", providerCategoryIds)
          : Promise.resolve({ data: null as { name: string }[] | null }),
        categoryIds.length > 0
          ? supabase.from("global_service_categories").select("name").in("id", categoryIds)
          : Promise.resolve({ data: null as { name: string }[] | null }),
        !supportsHouseCallsQuick && serviceIdsForHomeCheck.length > 0
          ? supabase
              .from("services")
              .select("supports_at_home")
              .in("id", serviceIdsForHomeCheck)
              .limit(100)
          : Promise.resolve({ data: null as { supports_at_home: boolean }[] | null }),
      ]);

      const categories: string[] = [];
      categories.push(...(pcResult.data?.map((c: any) => c.name) || []));
      categories.push(
        ...((gcResult.data?.map((c: any) => c.name) || []) as string[]).filter(
          (c) => !categories.includes(c),
        ),
      );
      const offeringCategories = Array.from(
        new Set((offerings as any[]).map((o) => o.category_name).filter(Boolean)),
      );
      categories.push(
        ...(offeringCategories as string[]).filter((c) => !categories.includes(c)),
      );

      const hasUserLocation =
        userLat != null &&
        userLng != null &&
        !Number.isNaN(userLat) &&
        !Number.isNaN(userLng) &&
        userLat >= -90 &&
        userLat <= 90 &&
        userLng >= -180 &&
        userLng <= 180;
      let distance_km: number | null = null;
      if (hasUserLocation && locations.length > 0) {
        let minDistance = Infinity;
        for (const loc of locations as any[]) {
          const locLat = loc.latitude ?? loc.address_lat;
          const locLng = loc.longitude ?? loc.address_lng;
          if (locLat != null && locLng != null) {
            const d = haversineDistanceKm(
              { latitude: userLat!, longitude: userLng! },
              { latitude: Number(locLat), longitude: Number(locLng) },
            );
            if (d < minDistance) minDistance = d;
          }
        }
        if (Number.isFinite(minDistance)) distance_km = Math.round(minDistance * 10) / 10;
      }

      let startingPrice: number | undefined;
      const prices = (offerings as any[])
        .filter((o) => o.price && o.price > 0)
        .map((o) => o.price);
      if (prices.length > 0) startingPrice = Math.min(...prices);

      let supportsHouseCalls = supportsHouseCallsQuick;
      if (!supportsHouseCalls && sResult.data?.some((s: any) => Boolean(s.supports_at_home))) {
        supportsHouseCalls = true;
      }
      if (!supportsHouseCalls && providerData.offers_mobile_services === true) {
        supportsHouseCalls = true;
      }
      const salonLocations = (locations as any[]).filter(
        (l: any) => (l.location_type || "salon") === "salon",
      );
      const supportsSalon = salonLocations.length > 0;

      const { data: promotionRows } = await supabase
        .from("promotions")
        .select("code, type, value, description, name, is_active, valid_from, valid_until")
        .eq("provider_id", providerData.id)
        .eq("is_active", true)
        .eq("public_on_profile", true)
        .order("created_at", { ascending: false })
        .limit(20);

      const profile_promotions = mapPublicProfilePromotions(promotionRows, providerData.currency || defaultCurrency);

      const result: PublicProviderDetail & { owner_name?: string; operating_hours?: any; seo_indexable?: boolean } = {
        id: providerData.id,
        slug: providerData.slug,
        business_name: providerData.business_name || "Provider",
        business_type: providerData.business_type,
        rating: providerData.rating_average ?? 0,
        review_count: providerData.review_count ?? 0,
        thumbnail_url: providerData.thumbnail_url,
        avatar_url: providerData.avatar_url ?? null,
        city,
        country,
        is_featured: providerData.is_featured ?? false,
        is_verified: providerData.is_verified ?? false,
        starting_price: startingPrice,
        currency: providerData.currency || defaultCurrency,
        description: providerData.description || "",
        gallery: providerData.gallery || [],
        categories,
        supports_house_calls: supportsHouseCalls,
        supports_salon: supportsSalon,
        locations: (locations as any[]).map((loc) => ({
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
        policies: policies
          ? {
              cancellation_window_hours: (policies as any).cancellation_window_hours,
              requires_deposit: (policies as any).requires_deposit,
              deposit_percentage: (policies as any).deposit_percentage,
              no_show_fee_enabled: (policies as any).no_show_fee_enabled,
              no_show_fee_amount: (policies as any).no_show_fee_amount,
              currency: (policies as any).currency,
            }
          : {
              cancellation_window_hours: 24,
              requires_deposit: false,
              no_show_fee_enabled: false,
              currency: providerData.currency,
            },
        staff_count: staffCount,
        years_in_business: providerData.years_in_business,
        accepts_custom_requests: acceptsCustomRequests,
        website: providerData.website ?? null,
        social_media_links: providerData.social_media_links ?? {},
        response_rate: providerData.response_rate ?? 100,
        response_time_hours: providerData.response_time_hours ?? 1,
        languages_spoken: providerData.languages_spoken ?? ["English"],
        current_badge: currentBadge,
        total_points: pointsData?.total_points || undefined,
        distance_km: distance_km ?? undefined,
        seo_indexable: includeInSearchEngines,
        profile_promotions,
      };

      return { provider: result, seoIndexable: includeInSearchEngines };
    } catch (error) {
      console.error("getPublicProviderDetail error:", error);
      return { provider: null, seoIndexable: false };
    }
  },
);

const PROVIDER_SELECT = `
  id, slug, business_name, business_type, description,
  rating_average, review_count, thumbnail_url, avatar_url,
  gallery, is_featured, is_verified, currency,
  years_in_business, tax_rate_percent, tips_enabled,
  website, social_media_links, accepts_custom_requests,
  response_rate, response_time_hours, languages_spoken,
  offers_mobile_services, minimum_mobile_booking_amount,
  user_id, users(include_in_search_engines)
`;

async function resolveProvider(
  supabase: Awaited<ReturnType<typeof getSupabaseServer>>,
  decodedSlug: string,
  originalSlug: string,
  tenantId: string,
): Promise<Record<string, any> | null> {
  // Primary: by decoded slug
  const { data, error } = await supabase
    .from("providers")
    .select(PROVIDER_SELECT)
    .eq("slug", decodedSlug)
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .maybeSingle();
  if (data) return data;

  // Retry with original slug
  if (decodedSlug !== originalSlug) {
    const retry = await supabase
      .from("providers")
      .select(PROVIDER_SELECT)
      .eq("slug", originalSlug)
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .maybeSingle();
    if (retry.data) return retry.data;
  }

  // Try UUID lookup
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(originalSlug)) {
    const { data: byId } = await supabase
      .from("providers")
      .select(PROVIDER_SELECT)
      .eq("id", originalSlug)
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .maybeSingle();
    if (byId) return byId;
  }

  // Last attempt: without status filter (reject suspended/banned/etc.)
  const last = await supabase
    .from("providers")
    .select(PROVIDER_SELECT + ", status")
    .eq("slug", decodedSlug)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const lastRowUnknown = last.data as unknown as Record<string, unknown> | null | undefined;
  if (lastRowUnknown == null || typeof lastRowUnknown !== "object") {
    return null;
  }
  if (!("status" in lastRowUnknown)) {
    return null;
  }
  const row = lastRowUnknown as { status?: string } & Record<string, unknown>;
  const nonPublic = ["suspended", "deactivated", "banned", "deleted"];
  if (nonPublic.includes(String(row.status ?? ""))) return null;
  return lastRowUnknown as Record<string, any>;
}

async function resolveProviderAcrossTenants(
  supabase: Awaited<ReturnType<typeof getSupabaseServer>>,
  decodedSlug: string,
  originalSlug: string,
): Promise<Record<string, any> | null> {
  const candidates = Array.from(new Set([decodedSlug, originalSlug].filter(Boolean)));
  for (const candidate of candidates) {
    const { data } = await supabase
      .from("providers")
      .select(PROVIDER_SELECT + ", status")
      .eq("slug", candidate)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const row = data as ({ status?: string } & Record<string, any>) | null;
    if (!row) continue;
    const nonPublic = ["suspended", "deactivated", "banned", "deleted"];
    if (nonPublic.includes(String(row.status ?? ""))) return null;
    return row;
  }
  return null;
}
