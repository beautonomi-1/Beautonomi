import { NextRequest } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireRoleInApi, successResponse, handleApiError, getProviderIdForUser } from '@/lib/supabase/api-helpers';

/**
 * GET /api/provider/tips/distribution
 * 
 * Get provider's tip distribution settings
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    const { data: tipSettings, error } = await supabase
      .from('provider_tip_settings')
      .select('*')
      .eq('provider_id', providerId)
      .single();

    // Return default if not found (PGRST116 is "not found" error)
    if (error && error.code === 'PGRST116') {
      return successResponse({
        keep_all_tips: true,
        distribute_to_staff: false,
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
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    const body = await request.json();

    const { keep_all_tips, distribute_to_staff } = body;

    const { data: settings, error } = await supabase
      .from('provider_tip_settings')
      .upsert(
        {
          provider_id: providerId,
          keep_all_tips: keep_all_tips !== false,
          distribute_to_staff: distribute_to_staff === true && keep_all_tips === false,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'provider_id',
        }
      )
      .select()
      .single();

    if (error) {
      throw error;
    }

    return successResponse(settings);
  } catch (error) {
    return handleApiError(error, 'Failed to update tip distribution settings');
  }
}
