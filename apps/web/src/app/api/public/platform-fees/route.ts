import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';

export async function GET(_request: NextRequest) {
  try {
    const supabase = await getSupabaseServer();

    // Fetch platform fees from platform_settings (public endpoint)
    const { data: platformSettings, error } = await supabase
      .from('platform_settings')
      .select('platform_service_fee_type, platform_service_fee_percentage, platform_service_fee_fixed, show_service_fee_to_customer')
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching platform fees:', error);
    }

    // Return default if not found
    if (!platformSettings) {
      return NextResponse.json({
        data: {
          platform_service_fee_type: 'percentage',
          platform_service_fee_percentage: 5,
          platform_service_fee_fixed: 0,
          show_service_fee_to_customer: true,
        },
      });
    }

    return NextResponse.json({
      data: {
        platform_service_fee_type: platformSettings.platform_service_fee_type || 'percentage',
        platform_service_fee_percentage: platformSettings.platform_service_fee_percentage || 5,
        platform_service_fee_fixed: platformSettings.platform_service_fee_fixed || 0,
        show_service_fee_to_customer: platformSettings.show_service_fee_to_customer !== false,
      },
    });
  } catch (error) {
    console.error('Error in platform-fees GET route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
