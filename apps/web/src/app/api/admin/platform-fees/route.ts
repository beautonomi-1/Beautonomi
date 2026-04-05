import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAdminSection, successResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PLATFORM_CONFIG } from "@/lib/admin-sections";
import { fetchScopedSingle, resolveAdminTenantContext } from "@/lib/tenant/scoped-overrides";
import { z } from 'zod';

const platformFeesSchema = z.object({
  platform_service_fee_type: z.enum(['percentage', 'fixed']).optional(),
  platform_service_fee_percentage: z.number().min(0).max(100).optional(),
  platform_service_fee_fixed: z.number().min(0).optional(),
  show_service_fee_to_customer: z.boolean().optional(),
  cash_enabled_on_platform: z.boolean().optional(),
});

const DEFAULT_PLATFORM_FEES = {
  platform_service_fee_type: 'percentage' as const,
  platform_service_fee_percentage: 5,
  platform_service_fee_fixed: 0,
  show_service_fee_to_customer: true,
  cash_enabled_on_platform: false,
};

/**
 * GET /api/admin/platform-fees
 *
 * Get platform fee settings from platform_settings.settings.payouts (JSONB)
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_PLATFORM_CONFIG, request);
    const supabase = getSupabaseAdmin();
    const { currentTenantId } = await resolveAdminTenantContext(request, undefined, user.role ?? null);

    const scoped = await fetchScopedSingle<{ id?: string; settings?: Record<string, unknown> }>({
      supabase,
      table: 'platform_settings',
      tenantId: currentTenantId,
      select: 'id, settings',
      apply: (q) => q.eq('is_active', true),
      orderBy: { column: 'updated_at', ascending: false },
    });
    const row = scoped.data;

    const settings = row?.settings as Record<string, any> | undefined;
    const payouts = settings?.payouts as Record<string, any> | undefined;
    const paymentTypes = settings?.payment_types as Record<string, any> | undefined;
    return successResponse({
      platform_service_fee_type: (payouts?.platform_service_fee_type as string) || 'percentage',
      platform_service_fee_percentage: (payouts?.platform_service_fee_percentage as number) ?? 5,
      platform_service_fee_fixed: (payouts?.platform_service_fee_fixed as number) ?? 0,
      show_service_fee_to_customer: (payouts?.show_service_fee_to_customer as boolean) !== false,
      cash_enabled_on_platform: paymentTypes?.cash === true,
    });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch platform fee settings');
  }
}

/**
 * PATCH /api/admin/platform-fees
 *
 * Update platform fee settings in platform_settings.settings.payouts (JSONB)
 */
export async function PATCH(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_PLATFORM_CONFIG, request);
    const supabase = getSupabaseAdmin();
    const body = await request.json();
    const { currentTenantId } = await resolveAdminTenantContext(request, body, user.role ?? null);

    const validatedData = platformFeesSchema.parse(body);

    // Edit the current tenant row if present; otherwise start from scoped fallback.
    const scoped = await fetchScopedSingle<{ id?: string; settings?: Record<string, unknown>; tenant_id?: string | null }>({
      supabase,
      table: 'platform_settings',
      tenantId: currentTenantId,
      select: 'id, settings, tenant_id',
      apply: (q) => q.eq('is_active', true),
      orderBy: { column: 'updated_at', ascending: false },
    });
    const existingRow = scoped.data ?? null;

    const currentSettings = (existingRow?.settings as Record<string, any>) || {};
    const payouts = { ...(currentSettings.payouts as Record<string, any> || {}) };
    const paymentTypes = { ...(currentSettings.payment_types as Record<string, any> || {}) };
    payouts.platform_service_fee_type = validatedData.platform_service_fee_type ?? payouts.platform_service_fee_type ?? 'percentage';
    payouts.platform_service_fee_percentage = validatedData.platform_service_fee_percentage ?? (payouts.platform_service_fee_percentage as number) ?? 0;
    payouts.platform_service_fee_fixed = validatedData.platform_service_fee_fixed ?? (payouts.platform_service_fee_fixed as number) ?? 0;
    if (validatedData.show_service_fee_to_customer !== undefined) {
      payouts.show_service_fee_to_customer = validatedData.show_service_fee_to_customer;
    }
    if (validatedData.cash_enabled_on_platform !== undefined) {
      paymentTypes.cash = validatedData.cash_enabled_on_platform;
    }
    paymentTypes.card = paymentTypes.card !== false;
    paymentTypes.mobile = paymentTypes.mobile !== false;
    paymentTypes.gift_card = paymentTypes.gift_card !== false;
    const updatedSettings = { ...currentSettings, payouts, payment_types: paymentTypes };

    const isTenantOwnedRow = existingRow?.tenant_id === currentTenantId;
    if (existingRow?.id && isTenantOwnedRow) {
      const { data: updated, error: updateError } = await supabase
        .from('platform_settings')
        .update({
          settings: updatedSettings,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingRow.id)
        .select('settings')
        .single();

      if (updateError || !updated) {
        throw updateError || new Error('Failed to update platform fee settings');
      }

      const outPayouts = (updated?.settings as Record<string, any>)?.payouts as Record<string, any> | undefined;
      return successResponse({
        platform_service_fee_type: (outPayouts?.platform_service_fee_type as string) || 'percentage',
        platform_service_fee_percentage: (outPayouts?.platform_service_fee_percentage as number) ?? 5,
        platform_service_fee_fixed: (outPayouts?.platform_service_fee_fixed as number) ?? 0,
        show_service_fee_to_customer: (outPayouts?.show_service_fee_to_customer as boolean) !== false,
        cash_enabled_on_platform:
          ((updated?.settings as Record<string, any> | undefined)?.payment_types as Record<string, any> | undefined)?.cash === true,
      });
    }

    // No row yet: insert one with payouts and minimal defaults
    const { data: inserted, error: insertError } = await supabase
      .from('platform_settings')
      .insert({
        tenant_id: currentTenantId,
        settings: updatedSettings,
        is_active: true,
      })
      .select('settings')
      .single();

    if (insertError || !inserted) {
      throw insertError || new Error('Failed to create platform fee settings');
    }

    const outPayouts = (inserted?.settings as Record<string, any>)?.payouts as Record<string, any> | undefined;
    return successResponse({
      platform_service_fee_type: (outPayouts?.platform_service_fee_type as string) || 'percentage',
      platform_service_fee_percentage: (outPayouts?.platform_service_fee_percentage as number) ?? 5,
      platform_service_fee_fixed: (outPayouts?.platform_service_fee_fixed as number) ?? 0,
      show_service_fee_to_customer: (outPayouts?.show_service_fee_to_customer as boolean) !== false,
      cash_enabled_on_platform:
        ((inserted?.settings as Record<string, any> | undefined)?.payment_types as Record<string, any> | undefined)?.cash === true,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(
        new Error(error.issues.map((e: { message: string }) => e.message).join(", ")),
        'Validation failed',
        'VALIDATION_ERROR',
        400
      );
    }
    return handleApiError(error, 'Failed to update platform fee settings');
  }
}
