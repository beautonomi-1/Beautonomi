import { NextRequest } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { successResponse, handleApiError } from '@/lib/supabase/api-helpers';
import { requirePublicTenant } from '@/lib/tenant/require-public-tenant';
import { z } from 'zod';

const suggestionsSchema = z.object({
  q: z.string().min(1, 'Query is required').max(100, 'Query too long'),
  limit: z.number().int().min(1).max(20).optional().default(10),
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

    const data = suggestionsSchema.parse({ q: query, limit });

    if (!data.q || data.q.trim().length < 1) {
      return successResponse({ suggestions: [] });
    }

    const tenantRes = await requirePublicTenant(request);
    if (tenantRes instanceof Response) {
      return tenantRes;
    }
    const { tenantId } = tenantRes;

    const supabase = await getSupabaseServer();
    const searchTerm = data.q.trim();

    // Search services - use separate queries for better compatibility
    const { data: servicesByName, error: servicesByNameError } = await supabase
      .from('services')
      .select('id, name, category_id, category:service_categories(name), providers!inner(tenant_id)')
      .ilike('name', `%${searchTerm}%`)
      .eq('is_active', true)
      .eq('providers.tenant_id', tenantId)
      .limit(Math.ceil(data.limit / 3));

    const { data: servicesByDesc, error: servicesByDescError } = await supabase
      .from('services')
      .select('id, name, category_id, category:service_categories(name), providers!inner(tenant_id)')
      .ilike('description', `%${searchTerm}%`)
      .eq('is_active', true)
      .eq('providers.tenant_id', tenantId)
      .limit(Math.ceil(data.limit / 3));

    // Combine and deduplicate results
    const serviceMap = new Map();
    (servicesByName || []).forEach((s: any) => serviceMap.set(s.id, s));
    (servicesByDesc || []).forEach((s: any) => {
      if (!serviceMap.has(s.id)) {
        serviceMap.set(s.id, s);
      }
    });
    const services = Array.from(serviceMap.values()).slice(0, Math.ceil(data.limit / 3));
    const servicesError = servicesByNameError || servicesByDescError;

    // Search providers
    // Use separate queries for better compatibility and to search description field
    const { data: providersByName, error: providersByNameError } = await supabase
      .from('providers')
      .select('id, business_name, slug, description, thumbnail_url, avatar_url')
      .ilike('business_name', `%${searchTerm}%`)
      .eq('status', 'active')
      .eq('tenant_id', tenantId)
      .limit(Math.ceil(data.limit / 3));

    // Only search description if it's not null/empty
    const { data: providersByDesc, error: providersByDescError } = await supabase
      .from('providers')
      .select('id, business_name, slug, description, thumbnail_url, avatar_url')
      .not('description', 'is', null)
      .ilike('description', `%${searchTerm}%`)
      .eq('status', 'active')
      .eq('tenant_id', tenantId)
      .limit(Math.ceil(data.limit / 3));

    // Combine and deduplicate results
    const providerMap = new Map();
    (providersByName || []).forEach((p: any) => providerMap.set(p.id, p));
    (providersByDesc || []).forEach((p: any) => {
      if (!providerMap.has(p.id)) {
        providerMap.set(p.id, p);
      }
    });
    let providers = Array.from(providerMap.values()).slice(0, Math.ceil(data.limit / 3));
    const providersError = providersByNameError || providersByDescError;

    if (providers.length === 0 && isPreviewOrDevHost(request)) {
      const admin = getSupabaseAdmin();
      const fallbackLimit = Math.ceil(data.limit / 3);
      const [fallbackByName, fallbackByDesc] = await Promise.all([
        admin
          .from('providers')
          .select('id, business_name, slug, description, thumbnail_url, avatar_url')
          .ilike('business_name', `%${searchTerm}%`)
          .eq('status', 'active')
          .limit(fallbackLimit),
        admin
          .from('providers')
          .select('id, business_name, slug, description, thumbnail_url, avatar_url')
          .not('description', 'is', null)
          .ilike('description', `%${searchTerm}%`)
          .eq('status', 'active')
          .limit(fallbackLimit),
      ]);
      const fallbackMap = new Map();
      (fallbackByName.data || []).forEach((p: any) => fallbackMap.set(p.id, p));
      (fallbackByDesc.data || []).forEach((p: any) => {
        if (!fallbackMap.has(p.id)) fallbackMap.set(p.id, p);
      });
      providers = Array.from(fallbackMap.values()).slice(0, fallbackLimit);
    }

    // Search legacy service categories (tenant catalog)
    const { data: categories, error: categoriesError } = await supabase
      .from('service_categories')
      .select('id, name, slug')
      .ilike('name', `%${searchTerm}%`)
      .eq('is_active', true)
      .limit(Math.ceil(data.limit / 3));

    // Global marketplace categories (same slugs as home / search filters)
    const { data: globalCategories, error: globalCategoriesError } = await supabase
      .from('global_service_categories')
      .select('id, name, slug')
      .eq('is_active', true)
      .ilike('name', `%${searchTerm}%`)
      .limit(Math.ceil(data.limit / 2));

    // Log errors with more detail
    if (servicesError) {
      console.error('Error fetching service suggestions:', servicesError);
      console.error('Service search term:', searchTerm);
    }
    if (providersError) {
      console.error('Error fetching provider suggestions:', providersError);
      console.error('Provider search term:', searchTerm);
      console.error('Providers by name:', providersByName?.length || 0);
      console.error('Providers by desc:', providersByDesc?.length || 0);
    }
    if (categoriesError) {
      console.error('Error fetching category suggestions:', categoriesError);
    }
    
    // Debug logging
    console.log(`[Search Suggestions] Query: "${searchTerm}", Found: ${services?.length || 0} services, ${providers?.length || 0} providers, ${categories?.length || 0} categories`);

    // Format suggestions
    const suggestions: Array<{
      type: 'service' | 'provider' | 'category';
      id: string;
      name: string;
      url: string;
      category?: string;
      slug?: string;
      image_url?: string | null;
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

    // Sort by relevance (exact matches first, then partial matches)
    const queryLower = data.q.toLowerCase();
    suggestions.sort((a, b) => {
      const aExact = a.name.toLowerCase().startsWith(queryLower);
      const bExact = b.name.toLowerCase().startsWith(queryLower);
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
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
