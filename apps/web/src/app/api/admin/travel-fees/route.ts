import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getTenantRegionConfig } from '@/lib/regions/config';
import { resolveTenantIdWithZaFallback } from '@/lib/tenant/resolve-tenant-from-db';
import { requireAdminSection, successResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_INTEGRATIONS_DEV } from "@/lib/admin-sections";
import { z } from 'zod';
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

const travelFeeTierSchema = z.object({
  max_km: z.number().min(0),
  fee: z.number().min(0),
});

const travelFeesSchema = z
  .object({
    default_rate_per_km: z.number().min(0).optional(),
    default_minimum_fee: z.number().min(0).optional(),
    default_maximum_fee: z.number().min(0).nullable().optional(),
    default_currency: z.string().optional(),
    default_free_within_km: z.number().min(0).nullable().optional(),
    allow_provider_customization: z.boolean().optional(),
    provider_min_rate_per_km: z.number().min(0).optional(),
    provider_max_rate_per_km: z.number().min(0).optional(),
    provider_min_minimum_fee: z.number().min(0).optional(),
    provider_max_minimum_fee: z.number().min(0).optional(),
    pricing_model: z.enum(['per_km', 'tiered']).optional(),
    default_tiers: z.array(travelFeeTierSchema).optional(),
    allow_provider_tiered: z.boolean().optional(),
  })
  .refine(
    (data) => {
      if (data.pricing_model !== 'tiered') return true;
      const tiers = data.default_tiers;
      if (!tiers || tiers.length === 0) return false;
      for (let i = 1; i < tiers.length; i++) {
        if (tiers[i].max_km <= tiers[i - 1].max_km) return false;
      }
      return true;
    },
    { message: 'When pricing_model is tiered, default_tiers must be non-empty and sorted by max_km ascending', path: ['default_tiers'] }
  );

/**
 * GET /api/admin/travel-fees
 *
 * Get platform travel fee settings (admin-only).
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_INTEGRATIONS_DEV, request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveTenantIdWithZaFallback(request);
    const tenantRegion = await getTenantRegionConfig(tenantId);
    const defaultCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;

    const { data: platformSettings, error } = await supabase
      .from('platform_settings')
      .select('settings')
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    const travelFees = platformSettings?.settings?.travel_fees || {
      default_rate_per_km: 8.00,
      default_minimum_fee: 20.00,
      default_maximum_fee: null,
      default_currency: defaultCurrency,
      allow_provider_customization: true,
      provider_min_rate_per_km: 0.00,
      provider_max_rate_per_km: 50.00,
      provider_min_minimum_fee: 0.00,
      provider_max_minimum_fee: 100.00,
    };
    const normalized = {
      ...travelFees,
      pricing_model: travelFees.pricing_model ?? 'per_km',
      default_tiers: travelFees.default_tiers ?? null,
      allow_provider_tiered: travelFees.allow_provider_tiered !== false,
      default_free_within_km:
        travelFees.default_free_within_km != null ? Number(travelFees.default_free_within_km) : 0,
    };

    return successResponse(normalized);
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
    await requireAdminSection(ADMIN_SECTION_INTEGRATIONS_DEV, request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveTenantIdWithZaFallback(request);
    const tenantRegion = await getTenantRegionConfig(tenantId);
    const defaultCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;
    const body = await request.json();

    const validatedData = travelFeesSchema.parse(body);

    // Get latest platform_settings row
    const { data: existing, error: _fetchError } = await supabase
      .from('platform_settings')
      .select('id, settings')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    type SettingsRow = { id?: string; settings?: Record<string, unknown> };
    const existingRow = existing as SettingsRow | null;
    const currentSettings = (existingRow?.settings ?? {}) as Record<string, unknown>;
    const currentTravelFees = (currentSettings.travel_fees ?? {}) as Record<string, unknown>;

    const updatedTravelFees = {
      ...currentTravelFees,
      ...validatedData,
    };

    const newSettings = {
      ...currentSettings,
      travel_fees: updatedTravelFees,
    };

    if (existingRow?.id) {
      const { data: updated, error: updateError } = await supabase
        .from('platform_settings')
        .update({
          settings: newSettings,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingRow.id)
        .select('settings')
        .single();

      if (updateError) throw updateError;
      const updatedRow = updated as SettingsRow | null;
      return successResponse((updatedRow?.settings as Record<string, unknown> | undefined)?.travel_fees);
    }

    // No row: create one
    const { data: created, error: createError } = await supabase
      .from('platform_settings')
      .insert({
        settings: {
          travel_fees: {
            default_rate_per_km: 8.00,
            default_minimum_fee: 20.00,
            default_maximum_fee: null,
            default_currency: defaultCurrency,
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

    if (createError) throw createError;
    const createdRow = created as SettingsRow | null;
    return successResponse((createdRow?.settings as Record<string, unknown> | undefined)?.travel_fees);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(
        new Error(error.issues.map((e: { message: string }) => e.message).join(', ')),
        'Validation failed',
        'VALIDATION_ERROR',
        400
      );
    }
    return handleApiError(error, 'Failed to update travel fee settings');
  }
}
