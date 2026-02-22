import { NextRequest } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireRoleInApi, successResponse, handleApiError, getProviderIdForUser } from '@/lib/supabase/api-helpers';

/**
 * GET /api/provider/subscription
 * 
 * Get provider's subscription information
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    const { data: subscription, error: subError } = await supabase
      .from('provider_subscriptions')
      .select('*, plan:subscription_plans(id, name, price_monthly, price_yearly, currency, features)')
      .eq('provider_id', providerId)
      .maybeSingle();

    if (subError) {
      throw subError;
    }

    if (!subscription) return successResponse(null);

    // Auto-mark expired if past expires_at (best-effort)
    const expiresAt = (subscription as any).expires_at ? new Date((subscription as any).expires_at) : null;
    if ((subscription as any).status === "active" && expiresAt && expiresAt < new Date()) {
      await (supabase.from("provider_subscriptions") as any)
        .update({ status: "expired", updated_at: new Date().toISOString() })
        .eq("id", (subscription as any).id);
      return successResponse({ ...(subscription as any), status: "expired" });
    }

    return successResponse(subscription as any);
  } catch (error) {
    return handleApiError(error, 'Failed to fetch subscription');
  }
}
