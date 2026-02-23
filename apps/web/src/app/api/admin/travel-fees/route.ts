import { NextRequest } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireRoleInApi, successResponse, handleApiError } from '@/lib/supabase/api-helpers';
import { z } from 'zod';

const travelFeesSchema = z.object({
  default_rate_per_km: z.number().min(0).optional(),
  default_minimum_fee: z.number().min(0).optional(),
  default_maximum_fee: z.number().min(0).nullable().optional(),
  default_currency: z.string().optional(),
  allow_provider_customization: z.boolean().optional(),
  provider_min_rate_per_km: z.number().min(0).optional(),
  provider_max_rate_per_km: z.number().min(0).optional(),
  provider_min_minimum_fee: z.number().min(0).optional(),
  provider_max_minimum_fee: z.number().min(0).optional(),
});

/**
 * GET /api/admin/travel-fees
 * 
 * Get platform travel fee settings
 * Allows providers to read limits (for validation), but only superadmins can modify
 */
export async function GET(request: NextRequest) {
  try {
    // Allow providers and superadmins to read platform limits
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin']);
    const supabase = await getSupabaseServer(request);

    const { data: platformSettings, error } = await supabase
      .from('platform_settings')
      .select('settings')
      .eq('is_active', true)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    const travelFees = platformSettings?.settings?.travel_fees || {
      default_rate_per_km: 8.00,
      default_minimum_fee: 20.00,
      default_maximum_fee: null,
      default_currency: 'ZAR',
      allow_provider_customization: true,
      provider_min_rate_per_km: 0.00,
      provider_max_rate_per_km: 50.00,
      provider_min_minimum_fee: 0.00,
      provider_max_minimum_fee: 100.00,
    };

    // For providers, only return the limits they need for validation
    // For superadmins, return full settings
    if (user.role === 'superadmin') {
      return successResponse(travelFees);
    } else {
      // Return only the limits providers need
      return successResponse({
        provider_min_rate_per_km: travelFees.provider_min_rate_per_km || 0.00,
        provider_max_rate_per_km: travelFees.provider_max_rate_per_km || 50.00,
        provider_min_minimum_fee: travelFees.provider_min_minimum_fee || 0.00,
        provider_max_minimum_fee: travelFees.provider_max_minimum_fee || 100.00,
        allow_provider_customization: travelFees.allow_provider_customization !== false,
      });
    }
  } catch (error) {
    return handleApiError(error, 'Failed to fetch travel fee settings');
  }
}

/**
 * PATCH /api/admin/travel-fees
 * 
 * Update platform travel fee settings
 */
export async function PATCH(request: NextRequest) {
  try {
    await requireRoleInApi(['superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const body = await request.json();

    const validatedData = travelFeesSchema.parse(body);

    // Get existing settings
    const { data: existing, error: _fetchError } = await supabase
      .from('platform_settings')
      .select('settings')
      .eq('is_active', true)
      .single();

    const currentSettings = existing?.settings || {};
    const currentTravelFees = currentSettings.travel_fees || {};

    // Merge with validated data
    const updatedTravelFees = {
      ...currentTravelFees,
      ...validatedData,
    };

    // Update settings JSONB
    const { data: updated, error: updateError } = await supabase
      .from('platform_settings')
      .update({
        settings: {
          ...currentSettings,
          travel_fees: updatedTravelFees,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('is_active', true)
      .select('settings')
      .single();

    if (updateError && updateError.code === 'PGRST116') {
      // Create new record if doesn't exist
      const { data: created, error: createError } = await supabase
        .from('platform_settings')
        .insert({
          settings: {
            travel_fees: {
              default_rate_per_km: 8.00,
              default_minimum_fee: 20.00,
              default_maximum_fee: null,
              default_currency: 'ZAR',
              allow_provider_customization: true,
              provider_min_rate_per_km: 0.00,
              provider_max_rate_per_km: 50.00,
              provider_min_minimum_fee: 0.00,
              provider_max_minimum_fee: 100.00,
              ...validatedData,
            },
          },
          is_active: true,
        })
        .select('settings')
        .single();

      if (createError) {
        throw createError;
      }

      return successResponse(created.settings.travel_fees);
    }

    if (updateError) {
      throw updateError;
    }

    return successResponse(updated.settings.travel_fees);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(
        new Error(error.issues.map((e: any) => e.message).join(', ')),
        'Validation failed',
        'VALIDATION_ERROR',
        400
      );
    }
    return handleApiError(error, 'Failed to update travel fee settings');
  }
}
