import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { getPlatformSalesDefaults, getPlatformSalesConstraints, validateAgainstConstraints } from "@/lib/platform-sales-settings";

const patchSchema = z.object({
  tax_rate_percent: z.number().min(0).max(100).optional(),
  is_vat_registered: z.boolean().optional(),
  vat_number: z.string().optional().nullable(),
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
    
    // Get platform defaults
    const platformDefaults = await getPlatformSalesDefaults();
    
    if (!providerId) {
      return successResponse({ 
        tax_rate_percent: platformDefaults.tax_rate_percent ?? 0,
        isUsingPlatformDefault: true,
      });
    }

    const { data, error } = await supabase
      .from("providers")
      .select("tax_rate_percent, is_vat_registered, vat_number")
      .eq("id", providerId)
      .single();
    
    if (error) throw error;
    
    const providerTaxRate = (data as any)?.tax_rate_percent;
    const isUsingPlatformDefault = providerTaxRate === null || providerTaxRate === undefined;
    const taxRate = isUsingPlatformDefault 
      ? (platformDefaults.tax_rate_percent ?? 0)
      : Number(providerTaxRate);
    
    const isVatRegistered = (data as any)?.is_vat_registered ?? false;
    const vatNumber = (data as any)?.vat_number ?? null;
    
    return successResponse({ 
      tax_rate_percent: taxRate,
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
    // Check permission to edit settings
    const permissionCheck = await requirePermission('edit_settings', request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) throw new Error("Provider profile not found");

    const body = patchSchema.parse(await request.json());

    // Prepare update object
    const updateData: any = { updated_at: new Date().toISOString() };
    
    // Handle VAT registration status
    if (body.is_vat_registered !== undefined) {
      updateData.is_vat_registered = body.is_vat_registered;
      
      // If registering for VAT, set tax rate to 15% (South African standard VAT rate)
      if (body.is_vat_registered === true) {
        updateData.tax_rate_percent = 15;
        // Require VAT number if registering
        if (!body.vat_number || body.vat_number.trim() === '') {
          return errorResponse("VAT number is required when registering for VAT", "VALIDATION_ERROR", 400);
        }
        updateData.vat_number = body.vat_number.trim();
      } else {
        // If unregistering from VAT, set tax rate to 0%
        updateData.tax_rate_percent = 0;
        updateData.vat_number = null;
      }
    }
    
    // Handle VAT number update (if VAT registered)
    if (body.vat_number !== undefined && body.is_vat_registered !== false) {
      // Validate VAT number format (South African VAT numbers: 4XXXXXXXXX - 10 digits starting with 4)
      if (body.vat_number && body.vat_number.trim() !== '') {
        const vatRegex = /^4\d{9}$/;
        if (!vatRegex.test(body.vat_number.trim())) {
          return errorResponse("Invalid VAT number format. South African VAT numbers must be 10 digits starting with 4 (e.g., 4123456789)", "VALIDATION_ERROR", 400);
        }
        updateData.vat_number = body.vat_number.trim();
      }
    }
    
    // Handle manual tax rate override (only if not setting VAT registration)
    if (body.tax_rate_percent !== undefined && body.is_vat_registered === undefined) {
      // Validate against platform constraints
      const constraints = await getPlatformSalesConstraints();
      const validation = validateAgainstConstraints("tax_rate_percent", body.tax_rate_percent, constraints);
      
      if (!validation.valid) {
        return errorResponse(validation.error || "Invalid tax rate", "VALIDATION_ERROR", 400);
      }
      
      updateData.tax_rate_percent = body.tax_rate_percent;
      
      // Auto-set VAT registration based on tax rate (15% = VAT registered in SA)
      if (body.tax_rate_percent === 15) {
        updateData.is_vat_registered = true;
      } else if (body.tax_rate_percent === 0) {
        updateData.is_vat_registered = false;
        updateData.vat_number = null;
      }
    }

    const { data, error } = await (supabase.from("providers") as any)
      .update(updateData)
      .eq("id", providerId)
      .select("tax_rate_percent, is_vat_registered, vat_number")
      .single();
    if (error) throw error;

    return successResponse({ 
      tax_rate_percent: Number((data as any)?.tax_rate_percent || 0),
      is_vat_registered: (data as any)?.is_vat_registered ?? false,
      vat_number: (data as any)?.vat_number ?? null,
      isUsingPlatformDefault: false,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Invalid request data", "VALIDATION_ERROR", 400, error.issues);
    }
    return handleApiError(error, "Failed to update tax settings");
  }
}

