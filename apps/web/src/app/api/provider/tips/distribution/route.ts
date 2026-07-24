import { NextRequest } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import {
  successResponse,
  handleApiError,
  getProviderIdForUser,
} from '@/lib/supabase/api-helpers';
import { requirePermission } from '@/lib/auth/requirePermission';

/**
 * GET /api/provider/tips/distribution
 *
 * Get provider's tip distribution settings
 */
export async function GET(request: NextRequest) {
  try {
    const authCheck = await requirePermission('view_sales', request);
    if (!authCheck.authorized) {
      return authCheck.response!;
    }
    const { user } = authCheck;
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    const [{ data: tipSettings, error }, { data: providerRow }] = await Promise.all([
      supabase
        .from('provider_tip_settings')
        .select('*')
        .eq('provider_id', providerId)
        .single(),
      supabase
        .from('providers')
        .select('tips_distribution')
        .eq('id', providerId)
        .maybeSingle(),
    ]);

    if (error && error.code === 'PGRST116') {
      const legacyDistribution = (providerRow as { tips_distribution?: string | null } | null)
        ?.tips_distribution;
      const legacyStaff = legacyDistribution === 'staff';
      return successResponse({
        keep_all_tips: !legacyStaff,
        distribute_to_staff: legacyStaff,
      });
    }

    if (error) {
      throw error;
    }

    return successResponse({
      keep_all_tips: tipSettings?.keep_all_tips !== false,
      distribute_to_staff: tipSettings?.distribute_to_staff === true,
    });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch tip distribution settings');
  }
}

/**
 * PATCH /api/provider/tips/distribution
 *
 * Update provider's tip distribution settings
 */
export async function PATCH(request: NextRequest) {
  try {
    const permissionCheck = await requirePermission('edit_settings', request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    const body = await request.json();

    const { keep_all_tips, distribute_to_staff } = body;

    const nextKeepAllTips = keep_all_tips !== false;
    const nextDistributeToStaff = distribute_to_staff === true && keep_all_tips === false;

    const { data: settings, error } = await supabase
      .from('provider_tip_settings')
      .upsert(
        {
          provider_id: providerId,
          keep_all_tips: nextKeepAllTips,
          distribute_to_staff: nextDistributeToStaff,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'provider_id',
        },
      )
      .select()
      .single();

    if (error) {
      throw error;
    }

    const { error: providerUpdateError } = await supabase
      .from('providers')
      .update({
        tips_distribution: nextDistributeToStaff ? 'staff' : 'owner',
        updated_at: new Date().toISOString(),
      })
      .eq('id', providerId);

    if (providerUpdateError) {
      throw providerUpdateError;
    }

    return successResponse(settings);
  } catch (error) {
    return handleApiError(error, 'Failed to update tip distribution settings');
  }
}
