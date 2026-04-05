import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { resolveTenantIdWithZaFallback } from '@/lib/tenant/resolve-tenant-from-db';
import { fetchScopedSingle } from '@/lib/tenant/scoped-overrides';
import { getPlatformPaymentTypesForTenant } from '@/lib/payments/platform-payment-types';

const DEFAULT_FEES = {
  platform_service_fee_type: 'percentage',
  platform_service_fee_percentage: 5,
  platform_service_fee_fixed: 0,
  show_service_fee_to_customer: true,
  cash_enabled_on_platform: false,
};

export async function GET(_request: NextRequest) {
  try {
    const request = _request;
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveTenantIdWithZaFallback(request);
    const scoped = await fetchScopedSingle<Record<string, unknown>>({
      supabase,
      table: 'platform_settings',
      tenantId,
      select: 'settings',
      apply: (q) => q.eq('is_active', true),
      orderBy: { column: 'updated_at', ascending: false },
    });

    const settings = (scoped.data as { settings?: Record<string, unknown> } | null)?.settings;
    const payouts = (settings as Record<string, any> | undefined)?.payouts as Record<string, any> | undefined;
    const paymentTypes = await getPlatformPaymentTypesForTenant(supabase, tenantId);
    const data = payouts
      ? {
          platform_service_fee_type: (payouts.platform_service_fee_type as string) || 'percentage',
          platform_service_fee_percentage: (payouts.platform_service_fee_percentage as number) ?? 5,
          platform_service_fee_fixed: (payouts.platform_service_fee_fixed as number) ?? 0,
          show_service_fee_to_customer: (payouts.show_service_fee_to_customer as boolean) !== false,
          cash_enabled_on_platform: paymentTypes.cash === true,
        }
      : { ...DEFAULT_FEES, cash_enabled_on_platform: paymentTypes.cash === true };

    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error in platform-fees GET route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
