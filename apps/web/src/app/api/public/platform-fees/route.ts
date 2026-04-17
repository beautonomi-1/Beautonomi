import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { resolveTenantIdWithZaFallback } from '@/lib/tenant/resolve-tenant-from-db';
import { fetchScopedSingle } from '@/lib/tenant/scoped-overrides';
import { getPlatformPaymentTypesForTenant } from '@/lib/payments/platform-payment-types';

// Charge nothing when platform settings are not yet configured.
// Never default to a non-zero percentage — that would silently charge
// customers an arbitrary rate. Operators must explicitly configure fees.
const DEFAULT_FEES = {
  platform_service_fee_type: 'fixed' as const,
  platform_service_fee_percentage: 0,
  platform_service_fee_fixed: 0,
  show_service_fee_to_customer: false,
  cash_enabled_on_platform: false,
};

/**
 * GET /api/public/platform-fees?provider_id=<uuid>
 *
 * Returns the effective service fee settings the customer will be charged.
 * When provider_id is supplied, mirrors validate-booking.ts logic:
 *   1. Provider customer_fee_config_id → platform_fee_config row (provider-specific override)
 *   2. Fallback: platform_settings.payouts (global platform fee)
 *
 * The client MUST pass provider_id so the booking flow preview matches the
 * server-side charge exactly, avoiding the client/server mismatch where
 * platform settings show "fixed R15" but the server charges "10% fee config".
 */
export async function GET(_request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(_request.url);
    const providerId = searchParams.get('provider_id');
    const tenantId = await resolveTenantIdWithZaFallback(_request);
    const paymentTypes = await getPlatformPaymentTypesForTenant(supabase, tenantId);

    // ── 1. Provider-specific fee config (same priority as validate-booking) ──
    if (providerId) {
      const { data: provider } = await supabase
        .from('providers')
        .select('customer_fee_config_id')
        .eq('id', providerId)
        .maybeSingle();

      if (provider?.customer_fee_config_id) {
        const { data: feeConfig } = await supabase
          .from('platform_fee_config')
          .select('fee_type, fee_percentage, fee_fixed_amount, applies_to, is_active')
          .eq('id', provider.customer_fee_config_id)
          .eq('is_active', true)
          .maybeSingle();

        if (feeConfig) {
          const isPercentage = feeConfig.fee_type === 'percentage';
          // applies_to 'customer' or 'both' → show to customer
          const showToCustomer = feeConfig.applies_to === 'customer' || feeConfig.applies_to === 'both';
          return NextResponse.json({
            data: {
              platform_service_fee_type: isPercentage ? 'percentage' : 'fixed',
              platform_service_fee_percentage: isPercentage ? Number(feeConfig.fee_percentage || 0) : 0,
              platform_service_fee_fixed: isPercentage ? 0 : Number(feeConfig.fee_fixed_amount || 0),
              show_service_fee_to_customer: showToCustomer,
              cash_enabled_on_platform: paymentTypes.cash === true,
            },
          });
        }
      }
    }

    // ── 2. Platform-wide fallback from platform_settings.payouts ─────────────
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

    const data = payouts
      ? {
          platform_service_fee_type: (payouts.platform_service_fee_type as string) || 'fixed',
          platform_service_fee_percentage: (payouts.platform_service_fee_percentage as number) ?? 0,
          platform_service_fee_fixed: (payouts.platform_service_fee_fixed as number) ?? 0,
          show_service_fee_to_customer: (payouts.show_service_fee_to_customer as boolean) !== false,
          cash_enabled_on_platform: paymentTypes.cash === true,
        }
      : { ...DEFAULT_FEES, cash_enabled_on_platform: paymentTypes.cash === true };

    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error in platform-fees GET route:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
