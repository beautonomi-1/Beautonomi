import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { fuzzySearch } from '@/lib/utils/fuzzy-search';

export async function GET(request: NextRequest) {
  try {
    const supabase = await getSupabaseServer();
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q') || '';
    const limit = parseInt(searchParams.get('limit') || '20');
    const type = searchParams.get('type') || 'all'; // 'providers', 'services', 'all'

    if (!query || query.trim().length < 2) {
      return NextResponse.json({
        data: {
          providers: [],
          services: [],
        },
      });
    }

    const results: {
      providers: any[];
      services: any[];
    } = {
      providers: [],
      services: [],
    };

    // Search providers
    if (type === 'all' || type === 'providers') {
      const { data: providers, error: providersError } = await supabase
        .from('providers')
        .select(`
          id,
          business_name,
          slug,
          description,
          city,
          state,
          country,
          average_rating,
          total_reviews,
          profile_image_url
        `)
        .eq('is_active', true)
        .eq('is_approved', true)
        .limit(100);

      if (!providersError && providers) {
        const fuzzyProviders = fuzzySearch(
          providers,
          query,
          (provider) => [
            provider.business_name || '',
            provider.description || '',
            provider.city || '',
            provider.state || '',
            provider.country || '',
          ],
          0.4
        );

        results.providers = fuzzyProviders.slice(0, limit).map(p => ({
          id: p.id,
          name: p.business_name,
          slug: p.slug,
          description: p.description,
          location: [p.city, p.state, p.country].filter(Boolean).join(', '),
          rating: p.average_rating,
          reviews: p.total_reviews,
          image: p.profile_image_url,
        }));
      }
    }

    // Search services
    if (type === 'all' || type === 'services') {
      const { data: services, error: servicesError } = await supabase
        .from('services')
        .select(`
          id,
          name,
          description,
          price,
          duration_minutes,
          category_id,
          provider_id,
          providers!inner(business_name, slug)
        `)
        .eq('is_active', true)
        .limit(100);

      if (!servicesError && services) {
        const fuzzyServices = fuzzySearch(
          services,
          query,
          (service) => [
            service.name || '',
            service.description || '',
            (service.providers as any)?.business_name || '',
          ],
          0.4
        );

        results.services = fuzzyServices.slice(0, limit).map(s => ({
          id: s.id,
          name: s.name,
          description: s.description,
          price: s.price,
          duration: s.duration_minutes,
          provider: {
            id: s.provider_id,
            name: (s.providers as any)?.business_name,
            slug: (s.providers as any)?.slug,
          },
        }));
      }
    }

    return NextResponse.json({
      data: results,
    });
  } catch (error) {
    console.error('Error in fuzzy search route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
