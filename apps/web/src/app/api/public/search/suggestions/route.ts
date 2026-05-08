import { NextRequest } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { successResponse, handleApiError } from '@/lib/supabase/api-helpers';
import { requirePublicTenant } from '@/lib/tenant/require-public-tenant';
import {
  buildIlikeOrClause,
  expandSearchTokens,
  fuzzyTextRelevanceScore,
} from '@/lib/search/fuzzy-rank';
import { haversineDistanceKmFromCoords } from "@/lib/geo/distance";
import { z } from 'zod';

const suggestionsSchema = z.object({
  q: z.string().min(1, 'Query is required').max(100, 'Query too long'),
  limit: z.number().int().min(1).max(20).optional().default(10),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
});

function isPreviewOrDevHost(request: NextRequest): boolean {
  const host = (request.headers.get("x-forwarded-host") || request.headers.get("host") || "")
    .split(":")[0]
    .toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host.endsWith(".vercel.app");
}

/**
 * GET /api/public/search/suggestions
 * 
 * Get search suggestions based on query
 * Returns services, providers, and categories that match
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    const latRaw = searchParams.get('lat');
    const lngRaw = searchParams.get('lng');

    const data = suggestionsSchema.parse({ 
      q: query, 
      limit,
      lat: latRaw ? parseFloat(latRaw) : undefined,
      lng: lngRaw ? parseFloat(lngRaw) : undefined
    });

    if (!data.q || data.q.trim().length < 1) {
      return successResponse({ suggestions: [] });
    }

    const tenantRes = await requirePublicTenant(request);
    if (tenantRes instanceof Response) {
      return tenantRes;
    }
    const { tenantId } = tenantRes;

    let supabase;
    try {
      const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
      supabase = getSupabaseAdmin();
    } catch (e) {
      supabase = await getSupabaseServer();
    }
    const searchTerm = data.q.trim();
    const tokens = expandSearchTokens(searchTerm);
    const serviceOr = buildIlikeOrClause(['name', 'description'], tokens);
    const providerOr = buildIlikeOrClause(['business_name', 'description'], tokens);
    const categoryOr = buildIlikeOrClause(['name'], tokens);

    let services: any[] = [];
    let servicesError: any = null;
    if (serviceOr) {
      const res = await supabase
        .from('services')
        .select('id, name, category_id, category:service_categories(name), providers!inner(tenant_id)')
        .or(serviceOr)
        .eq('is_active', true)
        .eq('providers.tenant_id', tenantId)
        .limit(Math.ceil(data.limit * 1.5));
      services = res.data ?? [];
      servicesError = res.error;
    }

    let providers: any[] = [];
    let providersError: any = null;
    if (providerOr) {
      const res = await supabase
        .from('providers')
        .select('id, business_name, slug, description, thumbnail_url, avatar_url')
        .or(providerOr)
        .eq('status', 'active')
        .eq('tenant_id', tenantId)
        .limit(Math.ceil(data.limit * 1.5));
      providers = res.data ?? [];
      providersError = res.error;
    }

    let categories: any[] | null = [];
    let categoriesError: any = null;
    if (categoryOr) {
      const res = await supabase
        .from('service_categories')
        .select('id, name, slug')
        .or(categoryOr)
        .eq('is_active', true)
        .limit(Math.ceil(data.limit / 2));
      categories = res.data;
      categoriesError = res.error;
    }

    let globalCategories: any[] | null = [];
    let globalCategoriesError: any = null;
    if (categoryOr) {
      const res = await supabase
        .from('global_service_categories')
        .select('id, name, slug')
        .eq('is_active', true)
        .or(categoryOr)
        .limit(Math.ceil(data.limit));
      globalCategories = res.data;
      globalCategoriesError = res.error;
    }

    // Log errors with more detail
    if (servicesError) {
      console.error('Error fetching service suggestions:', servicesError);
      console.error('Service search term:', searchTerm);
    }
    if (providersError) {
      console.error('Error fetching provider suggestions:', providersError);
      console.error('Provider search term:', searchTerm);
    }
    if (categoriesError) {
      console.error('Error fetching category suggestions:', categoriesError);
    }
    
    // Debug logging
    console.log(`[Search Suggestions] Query: "${searchTerm}", Found: ${services?.length || 0} services, ${providers?.length || 0} providers, ${categories?.length || 0} categories`);

    const distanceMap = new Map<string, number>();
    if (providers.length > 0 && data.lat != null && data.lng != null && Number.isFinite(data.lat) && Number.isFinite(data.lng)) {
      const providerIds = providers.map((p: any) => p.id);
      const { data: locations } = await supabase
        .from("provider_locations")
        .select("provider_id, latitude, longitude, address_lat, address_lng")
        .in("provider_id", providerIds)
        .eq("is_active", true);

      if (locations) {
        const byProvider = new Map<string, any[]>();
        locations.forEach((loc: any) => {
          if (!byProvider.has(loc.provider_id)) byProvider.set(loc.provider_id, []);
          byProvider.get(loc.provider_id)!.push(loc);
        });

        byProvider.forEach((locs, providerId) => {
          let minKm = Infinity;
          for (const loc of locs) {
            const lat = loc.latitude ?? loc.address_lat;
            const lng = loc.longitude ?? loc.address_lng;
            if (lat != null && lng != null) {
              const km = haversineDistanceKmFromCoords(data.lat!, data.lng!, Number(lat), Number(lng));
              if (km < minKm) minKm = km;
            }
          }
          if (Number.isFinite(minKm)) distanceMap.set(providerId, Math.round(minKm * 10) / 10);
        });
      }
    }

    // Format suggestions
    const suggestions: Array<{
      type: 'service' | 'provider' | 'category';
      id: string;
      name: string;
      url: string;
      category?: string;
      slug?: string;
      image_url?: string | null;
      distance_km?: number;
    }> = [];

    // Add service suggestions
    (services || []).forEach((service: any) => {
      suggestions.push({
        type: 'service',
        id: service.id,
        name: service.name,
        url: `/search?q=${encodeURIComponent(service.name)}&type=service`,
        category: service.category?.name,
      });
    });

    // Add provider suggestions
    (providers || []).forEach((provider: any) => {
      suggestions.push({
        type: 'provider',
        id: provider.id,
        name: provider.business_name || 'Unknown',
        url: provider.slug
          ? `/partner-profile?slug=${encodeURIComponent(provider.slug)}`
          : `/search?q=${encodeURIComponent(provider.business_name)}&type=provider`,
        slug: provider.slug || undefined,
        image_url: provider.avatar_url || provider.thumbnail_url || null,
        distance_km: distanceMap.get(provider.id),
      });
    });

    const seenCategorySlugs = new Set<string>();

    // Add global category suggestions first (search filter parity with home)
    (globalCategories || []).forEach((category: { id: string; name: string; slug: string }) => {
      const slug = category.slug?.trim();
      if (!slug || seenCategorySlugs.has(slug)) return;
      seenCategorySlugs.add(slug);
      suggestions.push({
        type: 'category',
        id: category.id,
        name: category.name,
        slug,
        url: `/search?category=${encodeURIComponent(slug)}`,
      });
    });

    // Legacy service categories — link to search with category slug when present
    (categories || []).forEach((category: { id: string; name: string; slug?: string | null }) => {
      const slug = category.slug?.trim();
      if (slug && seenCategorySlugs.has(slug)) return;
      if (slug) seenCategorySlugs.add(slug);
      suggestions.push({
        type: 'category',
        id: category.id,
        name: category.name,
        slug: slug || undefined,
        url: slug
          ? `/search?category=${encodeURIComponent(slug)}`
          : `/search?q=${encodeURIComponent(category.name)}`,
      });
    });

    // Sort by fuzzy relevance, then stable name
    suggestions.sort((a, b) => {
      const sa = fuzzyTextRelevanceScore(data.q, a.name, a.category ?? '');
      const sb = fuzzyTextRelevanceScore(data.q, b.name, b.category ?? '');
      
      // If score difference is small (< 100), consider distance
      if (Math.abs(sb - sa) < 100) {
        if (a.distance_km != null && b.distance_km != null) {
          if (a.distance_km !== b.distance_km) return a.distance_km - b.distance_km;
        } else if (a.distance_km != null) {
          return -1; // a is closer (has distance)
        } else if (b.distance_km != null) {
          return 1; // b is closer (has distance)
        }
      }

      if (sb !== sa) return sb - sa;
      return a.name.localeCompare(b.name);
    });

    // Limit results
    const limitedSuggestions = suggestions.slice(0, data.limit);

    return successResponse({
      suggestions: limitedSuggestions,
      query: data.q,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(
        new Error(error.issues.map(e => e.message).join(', ')),
        'Validation failed',
        'VALIDATION_ERROR',
        400
      );
    }
    return handleApiError(error, 'Failed to fetch search suggestions');
  }
}
