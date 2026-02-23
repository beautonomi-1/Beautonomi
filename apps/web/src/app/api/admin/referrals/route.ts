import { NextRequest } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireRoleInApi, successResponse, handleApiError } from '@/lib/supabase/api-helpers';
import { z } from 'zod';

const referralSettingsSchema = z.object({
  referral_amount: z.number().min(0).optional(),
  referral_message: z.string().min(1).optional(),
  referral_currency: z.string().length(3).optional(),
  is_enabled: z.boolean().optional(),
});

const REFERRAL_SETTINGS_ID = '00000000-0000-0000-0000-000000000001';
const DEFAULT_REFERRAL_SETTINGS = {
  referral_amount: 50,
  referral_message: 'Join Beautonomi and get rewarded! Use my referral link to get started.',
  referral_currency: 'ZAR',
  is_enabled: true,
};

/**
 * GET /api/admin/referrals
 * Get referral settings (single-row table by fixed id).
 */
export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(['superadmin'], request);
    const supabase = await getSupabaseServer(request);

    const { data: referralSettings, error } = await supabase
      .from('referral_settings')
      .select('*')
      .eq('id', REFERRAL_SETTINGS_ID)
      .maybeSingle();

    if (error) throw error;
    if (!referralSettings) return successResponse(DEFAULT_REFERRAL_SETTINGS);

    return successResponse({
      referral_amount: referralSettings.referral_amount ?? 50,
      referral_message: referralSettings.referral_message || DEFAULT_REFERRAL_SETTINGS.referral_message,
      referral_currency: referralSettings.referral_currency || 'ZAR',
      is_enabled: referralSettings.is_enabled !== false,
    });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch referral settings');
  }
}

/**
 * PATCH /api/admin/referrals
 * 
 * Update referral settings
 */
export async function PATCH(request: NextRequest) {
  try {
    await requireRoleInApi(['superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const body = await request.json();

    const validatedData = referralSettingsSchema.parse(body);

    const { data: settings, error } = await supabase
      .from('referral_settings')
      .upsert(
        {
          id: REFERRAL_SETTINGS_ID,
          referral_amount: validatedData.referral_amount ?? 50,
          referral_message: validatedData.referral_message || 'Join Beautonomi and get rewarded! Use my referral link to get started.',
          referral_currency: validatedData.referral_currency || 'ZAR',
          is_enabled: validatedData.is_enabled !== false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      )
      .select()
      .single();

    if (error) {
      throw error;
    }

    return successResponse(settings);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(
        new Error(error.issues.map((e: any) => e.message).join(', ')),
        'Validation failed',
        'VALIDATION_ERROR',
        400
      );
    }
    return handleApiError(error, 'Failed to update referral settings');
  }
}
