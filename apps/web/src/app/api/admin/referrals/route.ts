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

/**
 * GET /api/admin/referrals
 * 
 * Get referral settings
 */
export async function GET(_request: NextRequest) {
  try {
    await requireRoleInApi(['superadmin']);
    const supabase = await getSupabaseServer();

    const { data: referralSettings, error } = await supabase
      .from('referral_settings')
      .select('*')
      .single();

    // Return default if not found (PGRST116 is "not found" error)
    if (error && error.code === 'PGRST116') {
      return successResponse({
        referral_amount: 50,
        referral_message: 'Join Beautonomi and get rewarded! Use my referral link to get started.',
        referral_currency: 'ZAR',
        is_enabled: true,
      });
    }

    if (error) {
      throw error;
    }

    return successResponse({
      referral_amount: referralSettings?.referral_amount || 50,
      referral_message: referralSettings?.referral_message || 'Join Beautonomi and get rewarded! Use my referral link to get started.',
      referral_currency: referralSettings?.referral_currency || 'ZAR',
      is_enabled: referralSettings?.is_enabled !== false,
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
    await requireRoleInApi(['superadmin']);
    const supabase = await getSupabaseServer();
    const body = await request.json();

    const validatedData = referralSettingsSchema.parse(body);

    const { data: settings, error } = await supabase
      .from('referral_settings')
      .upsert(
        {
          referral_amount: validatedData.referral_amount ?? 50,
          referral_message: validatedData.referral_message || 'Join Beautonomi and get rewarded! Use my referral link to get started.',
          referral_currency: validatedData.referral_currency || 'ZAR',
          is_enabled: validatedData.is_enabled !== false,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'id',
        }
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
