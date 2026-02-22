import { NextRequest } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { successResponse, handleApiError } from '@/lib/supabase/api-helpers';

/**
 * GET /api/public/travel-fees/[providerId]
 * 
 * Get effective travel fee settings for a provider
 * Returns provider settings if they exist, otherwise platform defaults
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ providerId: string }> }
) {
  try {
    const supabase = await getSupabaseServer();
    const { providerId } = await params;

    // Get provider settings
    const { data: providerSettings } = await supabase
      .from('provider_travel_fee_settings')
      .select('*')
      .eq('provider_id', providerId)
      .eq('enabled', true)
      .single();

    // Get platform settings
    const { data: platformSettings } = await supabase
      .from('platform_settings')
      .select('settings')
      .eq('is_active', true)
      .single();

    const travelFees = platformSettings?.settings?.travel_fees || {
      default_rate_per_km: 8.00,
      default_minimum_fee: 20.00,
      default_maximum_fee: null,
      default_currency: 'ZAR',
    };

    // If provider has custom settings and not using platform default
    if (providerSettings && !providerSettings.use_platform_default) {
      return successResponse({
        rate_per_km: providerSettings.rate_per_km,
        minimum_fee: providerSettings.minimum_fee,
        maximum_fee: providerSettings.maximum_fee,
        currency: providerSettings.currency,
      });
    }

    // Return platform defaults
    return successResponse({
      rate_per_km: travelFees.default_rate_per_km,
      minimum_fee: travelFees.default_minimum_fee,
      maximum_fee: travelFees.default_maximum_fee,
      currency: travelFees.default_currency,
    });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch travel fee settings');
  }
}
