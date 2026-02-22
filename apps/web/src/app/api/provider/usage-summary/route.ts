import { NextRequest } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireRoleInApi, getProviderIdForUser, successResponse, handleApiError } from '@/lib/supabase/api-helpers';

/**
 * GET /api/provider/usage-summary
 * Get provider's subscription usage summary
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return handleApiError(new Error('Provider not found'), 'Provider not found', 'NOT_FOUND', 404);
    }

    // Call the database function to get usage summary
    const { data, error } = await supabase.rpc('get_provider_usage_summary', {
      provider_id_param: providerId
    });

    if (error) {
      throw error;
    }

    return successResponse(data || []);
  } catch (error) {
    return handleApiError(error, 'Failed to fetch usage summary');
  }
}
