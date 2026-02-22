import { NextRequest } from 'next/server';
import {  requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/provider/feature-flags
 * Get all feature flags for provider portal
 * Returns feature flags that are relevant to providers
 */
export async function GET(request: NextRequest) {
  try {
    // Require provider role
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);

    // Use service role client to avoid RLS issues
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );    // Fetch all enabled feature flags
    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");

    // Filter by categories relevant to providers
    const { data: featureFlags, error } = await supabaseAdmin
      .from('feature_flags')
      .select('feature_key, feature_name, enabled, category, metadata')
      .eq('enabled', true)
      .order('category', { ascending: true })
      .order('feature_name', { ascending: true });

    if (error) {
      console.error('Error fetching feature flags:', error);
      return handleApiError(
        new Error(`Failed to fetch feature flags: ${error.message}`),
        'FEATURE_FLAGS_FETCH_ERROR',
        500
      );
    }

    // Return feature flags in a format that's easy to use
    const flags = (featureFlags || []).map((flag) => ({
      feature_key: flag.feature_key,
      feature_name: flag.feature_name,
      enabled: flag.enabled,
      category: flag.category,
      metadata: flag.metadata || {},
    }));

    return successResponse(flags);
  } catch (error: any) {
    console.error('Unexpected error in feature flags endpoint:', error);
    return handleApiError(
      error,
      'FEATURE_FLAGS_ERROR',
      500
    );
  }
}
