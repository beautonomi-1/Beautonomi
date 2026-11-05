import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { getPlatformSalesDefaults } from "@/lib/platform-sales-settings";
import { resolveProviderVat } from "@/lib/tax/resolve-provider-vat";
import { applyProviderTaxSettingsPatch } from "@/lib/provider-settings/apply-provider-tax-settings-patch";

const patchSchema = z.object({
  tax_rate_percent: z.number().min(0).max(100).optional(),
  is_vat_registered: z.boolean().optional(),
  vat_number: z.string().optional().nullable(),
  tax_inclusive: z.boolean().optional(),
});

/**
 * GET/PATCH /api/provider/settings/sales/taxes
 * Provider tax configuration (stored on providers.tax_rate_percent).
 * Uses platform defaults if provider hasn't set a custom value.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    
    const platformDefaults = await getPlatformSalesDefaults();
    
    if (!providerId) {
      return successResponse({ 
        tax_rate_percent: platformDefaults.tax_rate_percent ?? 0,
        tax_inclusive: true,
        isUsingPlatformDefault: true,
      });
    }

    const { data, error } = await supabase
      .from("providers")
      .select(
        "tenant_id, tax_rate_percent, tax_inclusive, is_vat_registered, vat_number",
      )
      .eq("id", providerId)
      .single();
    
    if (error) throw error;
    
    const providerTaxRate = (data as { tax_rate_percent?: number | null })?.tax_rate_percent;
    const isUsingPlatformDefault = providerTaxRate === null || providerTaxRate === undefined;
    const resolved = await resolveProviderVat(supabase, {
      ...((data as Record<string, unknown>) ?? {}),
      tax_rate_override_percent: null,
    });
    
    const isVatRegistered = (data as { is_vat_registered?: boolean | null })?.is_vat_registered ?? false;
    const vatNumber = (data as { vat_number?: string | null })?.vat_number ?? null;
    
    return successResponse({ 
      tax_rate_percent: resolved.ratePercent,
      tax_inclusive: resolved.inclusive,
      is_vat_registered: isVatRegistered,
      vat_number: vatNumber,
      isUsingPlatformDefault,
    });
  } catch (error) {
    return handleApiError(error, "Failed to load tax settings");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const permissionCheck = await requirePermission('edit_settings', request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) throw new Error("Provider profile not found");

    const body = patchSchema.parse(await request.json());

    const result = await applyProviderTaxSettingsPatch(supabase, providerId, body);
    if (result.ok === false) {
      return errorResponse(result.message, result.code, result.status);
    }

    return successResponse({ 
      tax_rate_percent: result.data.tax_rate_percent,
      tax_inclusive: result.data.tax_inclusive,
      is_vat_registered: result.data.is_vat_registered,
      vat_number: result.data.vat_number,
      isUsingPlatformDefault: false,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Invalid request data", "VALIDATION_ERROR", 400, error.issues);
    }
    return handleApiError(error, "Failed to update tax settings");
  }
}
