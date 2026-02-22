/**
 * Server-side Feature Flags Utility
 * For use in Server Components and API routes
 */

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export interface FeatureFlag {
  id: string;
  feature_key: string;
  feature_name: string;
  description: string | null;
  enabled: boolean;
  category: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

/**
 * Get Supabase client for server-side operations
 */
async function getSupabaseClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  );
}

/**
 * Check if a feature is enabled (server-side)
 * @param featureKey - The key of the feature to check
 * @returns Promise<boolean> - True if feature is enabled, false otherwise
 */
export async function isFeatureEnabledServer(featureKey: string): Promise<boolean> {
  try {
    const supabase = await getSupabaseClient();
    
    const { data, error } = await supabase
      .from('feature_flags')
      .select('enabled')
      .eq('feature_key', featureKey)
      .single();

    if (error || !data) {
      console.warn(`Feature flag not found or error: ${featureKey}`, error);
      return false;
    }

    return data.enabled ?? false;
  } catch (error) {
    console.error(`Error checking feature flag ${featureKey}:`, error);
    return false;
  }
}

/**
 * Check multiple features at once (server-side)
 * @param featureKeys - Array of feature keys to check
 * @returns Promise<Record<string, boolean>> - Object mapping feature keys to enabled status
 */
export async function checkMultipleFeaturesServer(
  featureKeys: string[]
): Promise<Record<string, boolean>> {
  try {
    const supabase = await getSupabaseClient();
    
    const { data, error } = await supabase
      .from('feature_flags')
      .select('feature_key, enabled')
      .in('feature_key', featureKeys);

    if (error) {
      console.error('Error fetching feature flags:', error);
      // Return all false as fallback
      return featureKeys.reduce((acc, key) => ({ ...acc, [key]: false }), {});
    }

    // Build result object
    const result: Record<string, boolean> = {};
    featureKeys.forEach((key) => {
      const flag = data?.find((f) => f.feature_key === key);
      result[key] = flag?.enabled ?? false;
    });

    return result;
  } catch (error) {
    console.error('Error checking feature flags:', error);
    // Return all false as fallback
    return featureKeys.reduce((acc, key) => ({ ...acc, [key]: false }), {});
  }
}

/**
 * Get all feature flags (server-side, admin only)
 * @returns Promise<FeatureFlag[]>
 */
export async function getAllFeatureFlagsServer(): Promise<FeatureFlag[]> {
  try {
    const supabase = await getSupabaseClient();
    
    // Check if user is superadmin
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || user.user_metadata?.role !== 'superadmin') {
      throw new Error('Unauthorized: Superadmin access required');
    }

    const { data, error } = await supabase
      .from('feature_flags')
      .select('*')
      .order('category', { ascending: true })
      .order('feature_name', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch feature flags: ${error.message}`);
    }

    return data ?? [];
  } catch (error) {
    console.error('Error fetching feature flags:', error);
    throw error;
  }
}

/**
 * Check if user has a specific permission (server-side)
 * @param userRole - The user's role
 * @param permissionKey - The permission key to check
 * @returns Promise<boolean>
 */
export async function hasPermissionServer(
  userRole: string,
  permissionKey: string
): Promise<boolean> {
  try {
    const supabase = await getSupabaseClient();
    
    const { data, error } = await supabase.rpc('has_permission', {
      user_role: userRole,
      permission_key_param: permissionKey,
    });

    if (error) {
      console.error('Error checking permission:', error);
      return false;
    }

    return data ?? false;
  } catch (error) {
    console.error('Error checking permission:', error);
    return false;
  }
}
