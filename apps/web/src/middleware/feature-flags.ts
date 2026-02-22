/**
 * Middleware utilities for feature flags
 * Use these in Next.js middleware or route handlers
 */

import { NextRequest, NextResponse } from 'next/server';
import { isFeatureEnabledServer } from '@/lib/server/feature-flags';

/**
 * Middleware to protect routes based on feature flags
 * Returns 404 if feature is disabled
 */
export async function requireFeature(
  request: NextRequest,
  featureKey: string
): Promise<NextResponse | null> {
  const enabled = await isFeatureEnabledServer(featureKey);
  
  if (!enabled) {
    return NextResponse.json(
      { error: 'Feature not available' },
      { status: 404 }
    );
  }
  
  return null; // Feature is enabled, continue
}

/**
 * Middleware to redirect if feature is disabled
 */
export async function redirectIfFeatureDisabled(
  request: NextRequest,
  featureKey: string,
  redirectTo: string = '/'
): Promise<NextResponse | null> {
  const enabled = await isFeatureEnabledServer(featureKey);
  
  if (!enabled) {
    return NextResponse.redirect(new URL(redirectTo, request.url));
  }
  
  return null; // Feature is enabled, continue
}

/**
 * Check multiple features and return which are enabled
 */
export async function checkFeaturesForRequest(
  request: NextRequest,
  featureKeys: string[]
): Promise<Record<string, boolean>> {
  const { checkMultipleFeaturesServer } = await import('@/lib/server/feature-flags');
  return await checkMultipleFeaturesServer(featureKeys);
}
