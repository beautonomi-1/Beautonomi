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

/**
 * GET /api/admin/platform-fees
 * 
 * Get platform fee settings
 */
export async function GET(_request: NextRequest) {
  try {
    await requireRoleInApi(['superadmin']);
    const supabase = await getSupabaseServer();

    const { data: platformSettings, error } = await supabase
      .from('platform_settings')
      .select('platform_service_fee_type, platform_service_fee_percentage, platform_service_fee_fixed, show_service_fee_to_customer')
      .single();

    // Return default if not found (PGRST116 is "not found" error)
    if (error && error.code === 'PGRST116') {
      return successResponse({
        platform_service_fee_type: 'percentage',
        platform_service_fee_percentage: 5,
        platform_service_fee_fixed: 0,
        show_service_fee_to_customer: true,
      });
    }

    if (error) {
      throw error;
    }

    return successResponse({
      platform_service_fee_type: platformSettings?.platform_service_fee_type || 'percentage',
      platform_service_fee_percentage: platformSettings?.platform_service_fee_percentage || 5,
      platform_service_fee_fixed: platformSettings?.platform_service_fee_fixed || 0,
      show_service_fee_to_customer: platformSettings?.show_service_fee_to_customer !== false,
    });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch platform fee settings');
  }
}

/**
 * PATCH /api/admin/platform-fees
 * 
 * Update platform fee settings
 */
export async function PATCH(request: NextRequest) {
  try {
    await requireRoleInApi(['superadmin']);
    const supabase = await getSupabaseServer();
    const body = await request.json();

    const validatedData = platformFeesSchema.parse(body);

    // Try update first
    const { data: updated, error: updateError } = await supabase
      .from('platform_settings')
      .update({
        platform_service_fee_type: validatedData.platform_service_fee_type || 'percentage',
        platform_service_fee_percentage: validatedData.platform_service_fee_percentage ?? 0,
        platform_service_fee_fixed: validatedData.platform_service_fee_fixed ?? 0,
        show_service_fee_to_customer: validatedData.show_service_fee_to_customer !== false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1)
      .select()
      .single();

    if (updateError && updateError.code === 'PGRST116') {
      // Try upsert if update fails (record doesn't exist)
      const { data: upserted, error: upsertError } = await supabase
        .from('platform_settings')
        .upsert({
          id: 1,
          platform_service_fee_type: validatedData.platform_service_fee_type || 'percentage',
          platform_service_fee_percentage: validatedData.platform_service_fee_percentage ?? 0,
          platform_service_fee_fixed: validatedData.platform_service_fee_fixed ?? 0,
          show_service_fee_to_customer: validatedData.show_service_fee_to_customer !== false,
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (upsertError) {
        throw upsertError;
      }

      return successResponse(upserted);
    }

    if (updateError) {
      throw updateError;
    }

    return successResponse(updated);
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
