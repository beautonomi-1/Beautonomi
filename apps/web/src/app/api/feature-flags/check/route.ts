import { getSupabaseServer } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/feature-flags/check?key=feature_key
 * Check if a feature is enabled (public endpoint, no auth required)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await getSupabaseServer();
    const { searchParams } = new URL(request.url);
    const featureKey = searchParams.get('key');

    if (!featureKey) {
      return NextResponse.json(
        { error: 'Feature key is required' },
        { status: 400 }
      );
    }

    // Check if feature is enabled
    const { data: featureFlag, error } = await supabase
      .from('feature_flags')
      .select('enabled, feature_key')
      .eq('feature_key', featureKey)
      .single();

    if (error || !featureFlag) {
      // If feature doesn't exist, default to false
      return NextResponse.json({ enabled: false }, { status: 200 });
    }

    return NextResponse.json(
      { enabled: featureFlag.enabled },
      { status: 200 }
    );
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/feature-flags/check
 * Check multiple features at once
 * Body: { keys: ['feature1', 'feature2', ...] }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await getSupabaseServer();
    const body = await request.json();
    const { keys } = body;

    if (!keys || !Array.isArray(keys) || keys.length === 0) {
      return NextResponse.json(
        { error: 'keys array is required' },
        { status: 400 }
      );
    }

    // Fetch all requested feature flags
    const { data: featureFlags, error } = await supabase
      .from('feature_flags')
      .select('feature_key, enabled')
      .in('feature_key', keys);

    if (error) {
      console.error('Error fetching feature flags:', error);
      return NextResponse.json(
        { error: 'Failed to check feature flags' },
        { status: 500 }
      );
    }

    // Build response object with all requested keys
    const result: Record<string, boolean> = {};
    keys.forEach((key: string) => {
      const flag = featureFlags?.find((f: any) => f.feature_key === key);
      result[key] = flag?.enabled ?? false;
    });

    return NextResponse.json({ features: result }, { status: 200 });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
