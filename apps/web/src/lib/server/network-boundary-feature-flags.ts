/**
 * Feature-flag helpers for the network boundary (Next.js `src/proxy.ts` or route handlers).
 * Not Next.js `middleware.ts` — this repo uses the Next 16 `proxy` entry only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { isFeatureEnabledServer } from '@/lib/server/feature-flags';

/**
 * Return a 404 response if the feature is disabled; otherwise `null` (caller continues).
 */
export async function requireFeature(
  request: NextRequest,
  featureKey: string,
): Promise<NextResponse | null> {
  const enabled = await isFeatureEnabledServer(featureKey);

  if (!enabled) {
    return NextResponse.json({ error: 'Feature not available' }, { status: 404 });
  }

  return null;
}

/**
 * Redirect if the feature is disabled; otherwise `null` (caller continues).
 */
export async function redirectIfFeatureDisabled(
  request: NextRequest,
  featureKey: string,
  redirectTo: string = '/',
): Promise<NextResponse | null> {
  const enabled = await isFeatureEnabledServer(featureKey);

  if (!enabled) {
    return NextResponse.redirect(new URL(redirectTo, request.url));
  }

  return null;
}

/**
 * Resolve multiple feature keys for a single request (e.g. gating compound routes).
 */
export async function checkFeaturesForRequest(
  request: NextRequest,
  featureKeys: string[],
): Promise<Record<string, boolean>> {
  const { checkMultipleFeaturesServer } = await import('@/lib/server/feature-flags');
  return await checkMultipleFeaturesServer(featureKeys);
}
