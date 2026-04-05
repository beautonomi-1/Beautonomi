import { NextRequest, NextResponse } from 'next/server';
import { resolveTenantIdWithZaFallback } from '@/lib/tenant/resolve-tenant-from-db';
import { isFeatureEnabledServer, checkMultipleFeaturesServer } from '@/lib/server/feature-flags';

/**
 * GET /api/feature-flags/check?key=feature_key
 * Check if a feature is enabled (public endpoint, no auth required)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const featureKey = searchParams.get('key');

    if (!featureKey) {
      return NextResponse.json(
        { error: 'Feature key is required' },
        { status: 400 }
      );
    }

    let tenantId: string | null = null;
    try {
      tenantId = await resolveTenantIdWithZaFallback(request);
    } catch {
      tenantId = null;
    }

    const enabled = await isFeatureEnabledServer(featureKey, tenantId);

    return NextResponse.json({ enabled }, { status: 200 });
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
    const body = await request.json();
    const { keys } = body;

    if (!keys || !Array.isArray(keys) || keys.length === 0) {
      return NextResponse.json(
        { error: 'keys array is required' },
        { status: 400 }
      );
    }

    let tenantId: string | null = null;
    try {
      tenantId = await resolveTenantIdWithZaFallback(request);
    } catch {
      tenantId = null;
    }

    const result = await checkMultipleFeaturesServer(keys as string[], tenantId);

    return NextResponse.json({ features: result }, { status: 200 });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
