import { NextRequest } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireRoleInApi, successResponse, handleApiError } from '@/lib/supabase/api-helpers';
import { z } from 'zod';

const platformFeesSchema = z.object({
  platform_service_fee_type: z.enum(['percentage', 'fixed']).optional(),
  platform_service_fee_percentage: z.number().min(0).max(100).optional(),
  platform_service_fee_fixed: z.number().min(0).optional(),
  show_service_fee_to_customer: z.boolean().optional(),
});

const DEFAULT_PLATFORM_FEES = {
  platform_service_fee_type: 'percentage' as const,
  platform_service_fee_percentage: 5,
  platform_service_fee_fixed: 0,
  show_service_fee_to_customer: true,
};

/**
 * GET /api/admin/platform-fees
 *
 * Get platform fee settings from platform_settings.settings.payouts (JSONB)
 */
export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(['superadmin'], request);
    const supabase = await getSupabaseServer(request);

    const { data: row, error } = await supabase
      .from('platform_settings')
      .select('id, settings')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn('Platform fees query error (returning defaults):', error.code, error.message);
      return successResponse(DEFAULT_PLATFORM_FEES);
    }

    const payouts = (row?.settings as Record<string, unknown>)?.payouts as Record<string, unknown> | undefined;
    return successResponse({
      platform_service_fee_type: (payouts?.platform_service_fee_type as string) || 'percentage',
      platform_service_fee_percentage: (payouts?.platform_service_fee_percentage as number) ?? 5,
      platform_service_fee_fixed: (payouts?.platform_service_fee_fixed as number) ?? 0,
      show_service_fee_to_customer: (payouts?.show_service_fee_to_customer as boolean) !== false,
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
    await requireRoleInApi(['superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const body = await request.json();

    const validatedData = platformFeesSchema.parse(body);

    const { data: existingRow, error: fetchError } = await supabase
      .from('platform_settings')
      .select('id, settings')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (fetchError) {
      throw fetchError;
    }

    const currentSettings = (existingRow?.settings as Record<string, unknown>) || {};
    const payouts = { ...(currentSettings.payouts as Record<string, unknown> || {}) };
    payouts.platform_service_fee_type = validatedData.platform_service_fee_type ?? payouts.platform_service_fee_type ?? 'percentage';
    payouts.platform_service_fee_percentage = validatedData.platform_service_fee_percentage ?? (payouts.platform_service_fee_percentage as number) ?? 0;
    payouts.platform_service_fee_fixed = validatedData.platform_service_fee_fixed ?? (payouts.platform_service_fee_fixed as number) ?? 0;
    if (validatedData.show_service_fee_to_customer !== undefined) {
      payouts.show_service_fee_to_customer = validatedData.show_service_fee_to_customer;
    }
    const updatedSettings = { ...currentSettings, payouts };

    if (existingRow?.id) {
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

      const outPayouts = (updated?.settings as Record<string, unknown>)?.payouts as Record<string, unknown> | undefined;
      return successResponse({
        platform_service_fee_type: (outPayouts?.platform_service_fee_type as string) || 'percentage',
        platform_service_fee_percentage: (outPayouts?.platform_service_fee_percentage as number) ?? 5,
        platform_service_fee_fixed: (outPayouts?.platform_service_fee_fixed as number) ?? 0,
        show_service_fee_to_customer: (outPayouts?.show_service_fee_to_customer as boolean) !== false,
      });
    }

    // No row yet: insert one with payouts and minimal defaults
    const { data: inserted, error: insertError } = await supabase
      .from('platform_settings')
      .insert({
        settings: updatedSettings,
        is_active: true,
      })
      .select('settings')
      .single();

    if (insertError || !inserted) {
      throw insertError || new Error('Failed to create platform fee settings');
    }

    const outPayouts = (inserted?.settings as Record<string, unknown>)?.payouts as Record<string, unknown> | undefined;
    return successResponse({
      platform_service_fee_type: (outPayouts?.platform_service_fee_type as string) || 'percentage',
      platform_service_fee_percentage: (outPayouts?.platform_service_fee_percentage as number) ?? 5,
      platform_service_fee_fixed: (outPayouts?.platform_service_fee_fixed as number) ?? 0,
      show_service_fee_to_customer: (outPayouts?.show_service_fee_to_customer as boolean) !== false,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(
        new Error(error.issues.map((e: any) => e.message).join(', ')),
        'Validation failed',
        'VALIDATION_ERROR',
        400
      );
    }
    return handleApiError(error, 'Failed to update platform fee settings');
  }
}
