import { NextRequest } from 'next/server';
import {  requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { createClient } from '@supabase/supabase-js';
import { mergeGlobalAndTenantFeatureFlags } from "@/lib/config/merge-feature-flags";

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

    const { data: providerRow, error: providerRowError } = await supabaseAdmin
      .from("providers")
      .select("tenant_id")
      .eq("id", providerId)
      .maybeSingle();

    if (providerRowError) {
      console.error("Error loading provider tenant for feature flags:", providerRowError);
    }

    const marketTenantId = (providerRow as { tenant_id?: string | null } | null)?.tenant_id ?? null;

    const { data: globalFlags, error: globalErr } = await supabaseAdmin
      .from("feature_flags")
      .select("feature_key, feature_name, enabled, category, metadata")
      .is("tenant_id", null)
      .eq("enabled", true)
      .order("category", { ascending: true })
      .order("feature_name", { ascending: true });

    let featureFlags = globalFlags ?? [];

    if (marketTenantId) {
      const { data: tenantFlags, error: tenantErr } = await supabaseAdmin
        .from("feature_flags")
        .select("feature_key, feature_name, enabled, category, metadata")
        .eq("tenant_id", marketTenantId)
        .eq("enabled", true)
        .order("category", { ascending: true })
        .order("feature_name", { ascending: true });

      if (tenantErr) {
        console.error("Error fetching tenant feature flags:", tenantErr);
      } else if (tenantFlags?.length) {
        featureFlags = mergeGlobalAndTenantFeatureFlags(
          featureFlags as typeof tenantFlags,
          tenantFlags
        );
      }
    }

    type ProviderFlagRow = {
      feature_key: string;
      feature_name: string;
      enabled: boolean;
      category: string | null;
      metadata: Record<string, unknown> | null;
    };

    featureFlags = [...(featureFlags as ProviderFlagRow[])].sort((a, b) => {
      const c = (a.category ?? "").localeCompare(b.category ?? "");
      if (c !== 0) return c;
      return (a.feature_name ?? "").localeCompare(b.feature_name ?? "");
    });

    const error = globalErr;

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
