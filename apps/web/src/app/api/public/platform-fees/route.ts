import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';

const DEFAULT_FEES = {
  platform_service_fee_type: 'percentage',
  platform_service_fee_percentage: 5,
  platform_service_fee_fixed: 0,
  show_service_fee_to_customer: true,
};

export async function GET(_request: NextRequest) {
  try {
    const supabase = await getSupabaseServer();

    // Platform fee settings live in platform_settings.settings.payouts (JSONB)
    const { data: row, error } = await supabase
      .from('platform_settings')
      .select('id, settings')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error fetching platform fees:', error);
      return NextResponse.json({ data: DEFAULT_FEES });
    }

    const payouts = (row?.settings as Record<string, unknown>)?.payouts as Record<string, unknown> | undefined;
    const data = payouts
      ? {
          platform_service_fee_type: (payouts.platform_service_fee_type as string) || 'percentage',
          platform_service_fee_percentage: (payouts.platform_service_fee_percentage as number) ?? 5,
          platform_service_fee_fixed: (payouts.platform_service_fee_fixed as number) ?? 0,
          show_service_fee_to_customer: (payouts.show_service_fee_to_customer as boolean) !== false,
        }
      : DEFAULT_FEES;

    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error in platform-fees GET route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
