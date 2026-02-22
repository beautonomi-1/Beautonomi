import { NextRequest } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireRoleInApi, successResponse, handleApiError, getProviderIdForUser } from '@/lib/supabase/api-helpers';
import { requirePermission } from "@/lib/auth/requirePermission";
import { z } from 'zod';

const travelFeesSchema = z.object({
  enabled: z.boolean().optional(),
  rate_per_km: z.number().min(0).optional(),
  minimum_fee: z.number().min(0).optional(),
  maximum_fee: z.number().min(0).nullable().optional(),
  currency: z.string().optional(),
  use_platform_default: z.boolean().optional(),
});

/**
 * GET /api/provider/travel-fees
 * 
 * Get provider's travel fee settings
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const { searchParams } = new URL(request.url);
    const providerIdParam = searchParams.get("provider_id"); // For superadmin to view specific provider

    // For superadmin, allow viewing any provider's settings
    let providerId: string | null = null;
    if (user.role === "superadmin" && providerIdParam) {
      providerId = providerIdParam;
    } else {
      // For providers, get their own provider ID
      providerId = await getProviderIdForUser(user.id, supabase);
      if (!providerId) {
        return handleApiError(new Error("Provider not found"), "Provider account required", 403);
      }
    }

    let query = supabase
      .from('provider_travel_fee_settings')
      .select('*');

    if (providerId) {
      query = query.eq('provider_id', providerId);
    }

    const { data: travelFeeSettings, error } = await query.single();

    // Return default if not found
    if (error && error.code === 'PGRST116') {
      return successResponse({
        enabled: true,
        rate_per_km: null,
        minimum_fee: null,
        maximum_fee: null,
        currency: 'ZAR',
        use_platform_default: true,
      });
    }

    if (error) {
      throw error;
    }

    return successResponse(travelFeeSettings);
  } catch (error) {
    return handleApiError(error, 'Failed to fetch travel fee settings');
  }
}

/**
 * PATCH /api/provider/travel-fees
 * 
 * Update provider's travel fee settings
 */
export async function PATCH(request: NextRequest) {
  try {
    // Check permission to edit settings
    const permissionCheck = await requirePermission('edit_settings', request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const body = await request.json();

    // For superadmin, allow updating any provider's settings via provider_id in body
    let providerId: string | null = null;
    if (user.role === "superadmin" && body.provider_id) {
      providerId = body.provider_id;
      delete body.provider_id; // Remove from body before validation
    } else {
      providerId = await getProviderIdForUser(user.id, supabase);
      if (!providerId) {
        return handleApiError(new Error("Provider not found"), "Provider account required", 403);
      }
    }

    const validatedData = travelFeesSchema.parse(body);

    // Get platform settings to validate against limits
    const { data: platformSettings } = await supabase
      .from('platform_settings')
      .select('settings')
      .eq('is_active', true)
      .single();

    const travelFees = platformSettings?.settings?.travel_fees || {};
    
    // Validate against platform limits if provider is setting custom rates
    if (!validatedData.use_platform_default && validatedData.rate_per_km !== undefined) {
      const minRate = travelFees.provider_min_rate_per_km || 0;
      const maxRate = travelFees.provider_max_rate_per_km || 50;
      if (validatedData.rate_per_km < minRate || validatedData.rate_per_km > maxRate) {
        return handleApiError(
          new Error(`Rate per km must be between ${minRate} and ${maxRate}`),
          'Validation failed',
          'VALIDATION_ERROR',
          400
        );
      }
    }

    if (!validatedData.use_platform_default && validatedData.minimum_fee !== undefined) {
      const minFee = travelFees.provider_min_minimum_fee || 0;
      const maxFee = travelFees.provider_max_minimum_fee || 100;
      if (validatedData.minimum_fee < minFee || validatedData.minimum_fee > maxFee) {
        return handleApiError(
          new Error(`Minimum fee must be between ${minFee} and ${maxFee}`),
          'Validation failed',
          'VALIDATION_ERROR',
          400
        );
      }
    }

    const { data: settings, error } = await supabase
      .from('provider_travel_fee_settings')
      .upsert(
        {
          provider_id: providerId,
          enabled: validatedData.enabled !== false,
          rate_per_km: validatedData.rate_per_km,
          minimum_fee: validatedData.minimum_fee,
          maximum_fee: validatedData.maximum_fee ?? null,
          currency: validatedData.currency || 'ZAR',
          use_platform_default: validatedData.use_platform_default !== false,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'provider_id',
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
    return handleApiError(error, 'Failed to update travel fee settings');
  }
}
