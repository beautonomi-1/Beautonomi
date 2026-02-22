import { NextRequest } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { successResponse, handleApiError } from '@/lib/supabase/api-helpers';
import { z } from 'zod';

const suggestionsSchema = z.object({
  q: z.string().min(1, 'Query is required').max(100, 'Query too long'),
  limit: z.number().int().min(1).max(20).optional().default(10),
});

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

    const supabase = await getSupabaseServer();
    const searchTerm = data.q.trim();

    // Search services - use separate queries for better compatibility
    const { data: servicesByName, error: servicesByNameError } = await supabase
      .from('services')
      .select('id, name, category_id, category:service_categories(name)')
      .ilike('name', `%${searchTerm}%`)
      .eq('is_active', true)
      .limit(Math.ceil(data.limit / 3));

    const { data: servicesByDesc, error: servicesByDescError } = await supabase
      .from('services')
      .select('id, name, category_id, category:service_categories(name)')
      .ilike('description', `%${searchTerm}%`)
      .eq('is_active', true)
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
      .select('id, business_name, description')
      .ilike('business_name', `%${searchTerm}%`)
      .eq('status', 'active')
      .limit(Math.ceil(data.limit / 3));

    // Only search description if it's not null/empty
    const { data: providersByDesc, error: providersByDescError } = await supabase
      .from('providers')
      .select('id, business_name, description')
      .not('description', 'is', null)
      .ilike('description', `%${searchTerm}%`)
      .eq('status', 'active')
      .limit(Math.ceil(data.limit / 3));

    // Combine and deduplicate results
    const providerMap = new Map();
    (providersByName || []).forEach((p: any) => providerMap.set(p.id, p));
    (providersByDesc || []).forEach((p: any) => {
      if (!providerMap.has(p.id)) {
        providerMap.set(p.id, p);
      }
    });
    const providers = Array.from(providerMap.values()).slice(0, Math.ceil(data.limit / 3));
    const providersError = providersByNameError || providersByDescError;

    // Search categories
    const { data: categories, error: categoriesError } = await supabase
      .from('service_categories')
      .select('id, name, slug')
      .ilike('name', `%${searchTerm}%`)
      .eq('is_active', true)
      .limit(Math.ceil(data.limit / 3));

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
        url: `/search?q=${encodeURIComponent(provider.business_name)}&type=provider`,
      });
    });

    // Add category suggestions
    (categories || []).forEach((category: any) => {
      suggestions.push({
        type: 'category',
        id: category.id,
        name: category.name,
        url: `/category/${category.slug}`,
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
