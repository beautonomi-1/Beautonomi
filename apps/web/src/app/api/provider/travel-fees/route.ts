import { NextRequest } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireRoleInApi, successResponse, handleApiError, getProviderIdForUser } from '@/lib/supabase/api-helpers';
import { requirePermission } from "@/lib/auth/requirePermission";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { z } from 'zod';
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

const travelFeeTierSchema = z.object({
  max_km: z.number().min(0),
  fee: z.number().min(0),
});

const travelFeesSchema = z
  .object({
    enabled: z.boolean().optional(),
    rate_per_km: z.number().min(0).optional(),
    minimum_fee: z.number().min(0).optional(),
    maximum_fee: z.number().min(0).nullable().optional(),
    free_within_km: z.number().min(0).nullable().optional(),
    currency: z.string().optional(),
    use_platform_default: z.boolean().optional(),
    pricing_model: z.enum(["per_km", "tiered"]).nullable().optional(),
    tiers: z.array(travelFeeTierSchema).optional(),
  })
  .refine(
    (data) => {
      if (data.pricing_model !== "tiered") return true;
      const tiers = data.tiers;
      if (!tiers || tiers.length === 0) return false;
      for (let i = 1; i < tiers.length; i++) {
        if (tiers[i].max_km <= tiers[i - 1].max_km) return false;
      }
      return true;
    },
    { message: "When pricing_model is tiered, tiers must be non-empty and sorted by max_km ascending", path: ["tiers"] }
  );

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

    const { data: platformSettings } = await supabase
      .from("platform_settings")
      .select("settings")
      .eq("is_active", true)
      .maybeSingle();
    const allowCustomization =
      platformSettings?.settings?.travel_fees?.allow_provider_customization !== false;

    // Return default if not found
    if (error && error.code === 'PGRST116') {
      let defaultCurrency: string = LAST_RESORT_CURRENCY;
      if (providerId) {
        const { data: provRow } = await supabase
          .from("providers")
          .select("tenant_id")
          .eq("id", providerId)
          .maybeSingle();
        const tr = provRow?.tenant_id ? await getTenantRegionConfig(provRow.tenant_id as string) : null;
        defaultCurrency = tr?.defaultCurrency ?? LAST_RESORT_CURRENCY;
      }
      return successResponse({
        enabled: true,
        rate_per_km: null,
        minimum_fee: null,
        maximum_fee: null,
        free_within_km: null,
        currency: defaultCurrency,
        use_platform_default: true,
        pricing_model: null,
        tiers: null,
        allow_provider_customization: allowCustomization,
      });
    }

    if (error) {
      throw error;
    }

    return successResponse({
      ...travelFeeSettings,
      pricing_model: travelFeeSettings.pricing_model ?? null,
      tiers: travelFeeSettings.tiers ?? null,
      free_within_km: travelFeeSettings.free_within_km ?? null,
      use_platform_default: allowCustomization ? Boolean(travelFeeSettings.use_platform_default) : true,
      allow_provider_customization: allowCustomization,
    });
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

    let validatedData = travelFeesSchema.parse(body);

    const { data: provForTenant } = await supabase
      .from("providers")
      .select("tenant_id")
      .eq("id", providerId!)
      .maybeSingle();
    const tenantRegionForCurrency = provForTenant?.tenant_id
      ? await getTenantRegionConfig(provForTenant.tenant_id as string)
      : null;
    const tenantDefaultCurrency = tenantRegionForCurrency?.defaultCurrency ?? LAST_RESORT_CURRENCY;

    // Get platform settings to validate against limits
    const { data: platformSettings } = await supabase
      .from('platform_settings')
      .select('settings')
      .eq('is_active', true)
      .single();

    const travelFees = platformSettings?.settings?.travel_fees || {};
    const allowCustomization = travelFees.allow_provider_customization !== false;

    if (!allowCustomization) {
      validatedData = { ...validatedData, use_platform_default: true };
    }

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

    if (
      !validatedData.use_platform_default &&
      validatedData.pricing_model === 'tiered' &&
      validatedData.tiers?.length
    ) {
      if (travelFees.allow_provider_tiered === false) {
        return handleApiError(
          new Error('Tiered pricing is not allowed by platform. Use per-km or platform default.'),
          'Validation failed',
          'VALIDATION_ERROR',
          400
        );
      }
    }

    const upsertPayload: Record<string, unknown> = {
      provider_id: providerId,
      enabled: validatedData.enabled !== false,
      currency: validatedData.currency || tenantDefaultCurrency,
      use_platform_default: validatedData.use_platform_default !== false,
      updated_at: new Date().toISOString(),
    };

    if (allowCustomization) {
      upsertPayload.maximum_fee = validatedData.maximum_fee ?? null;
      if (validatedData.rate_per_km !== undefined) upsertPayload.rate_per_km = validatedData.rate_per_km;
      if (validatedData.minimum_fee !== undefined) upsertPayload.minimum_fee = validatedData.minimum_fee;
      if (validatedData.pricing_model !== undefined) upsertPayload.pricing_model = validatedData.pricing_model;
      if (validatedData.pricing_model === "per_km") {
        upsertPayload.tiers = null;
      } else if (validatedData.tiers !== undefined) {
        upsertPayload.tiers = validatedData.tiers;
      }
      if (validatedData.free_within_km !== undefined) upsertPayload.free_within_km = validatedData.free_within_km;
    } else {
      upsertPayload.use_platform_default = true;
    }

    const { data: settings, error } = await supabase
      .from('provider_travel_fee_settings')
      .upsert(upsertPayload, {
        onConflict: 'provider_id',
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return successResponse({
      ...settings,
      allow_provider_customization: allowCustomization,
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
    return handleApiError(error, 'Failed to update travel fee settings');
  }
}
