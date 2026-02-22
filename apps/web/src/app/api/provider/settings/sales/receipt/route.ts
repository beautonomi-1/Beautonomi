import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { getPlatformSalesDefaults, getPlatformSalesConstraints, validateAgainstConstraints, mergeWithPlatformDefaults } from "@/lib/platform-sales-settings";

/**
 * GET/PATCH /api/provider/settings/sales/receipt
 * Stores settings on providers.*
 * Uses platform defaults if provider hasn't set custom values.
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
        receipt_prefix: platformDefaults.receipt_prefix ?? "REC",
        receipt_next_number: platformDefaults.receipt_next_number ?? 1,
        receipt_header: platformDefaults.receipt_header ?? null,
        receipt_footer: platformDefaults.receipt_footer ?? null,
        isUsingPlatformDefault: true,
      });
    }

    const { data, error } = await supabase
      .from("providers")
      .select("receipt_prefix, receipt_next_number, receipt_header, receipt_footer")
      .eq("id", providerId)
      .single();
    
    if (error) throw error;

    const providerSettings = {
      receipt_prefix: (data as any)?.receipt_prefix,
      receipt_next_number: (data as any)?.receipt_next_number,
      receipt_header: (data as any)?.receipt_header,
      receipt_footer: (data as any)?.receipt_footer,
    };

    const isUsingPlatformDefault = 
      !providerSettings.receipt_prefix && 
      !providerSettings.receipt_next_number &&
      providerSettings.receipt_header === null &&
      providerSettings.receipt_footer === null;

    const merged = mergeWithPlatformDefaults(providerSettings, {
      receipt_prefix: platformDefaults.receipt_prefix ?? "REC",
      receipt_next_number: platformDefaults.receipt_next_number ?? 1,
      receipt_header: platformDefaults.receipt_header ?? null,
      receipt_footer: platformDefaults.receipt_footer ?? null,
    });

    return successResponse({
      receipt_prefix: merged.receipt_prefix || "REC",
      receipt_next_number: Number(merged.receipt_next_number || 1),
      receipt_header: merged.receipt_header ?? null,
      receipt_footer: merged.receipt_footer ?? null,
      isUsingPlatformDefault,
    });
  } catch (error) {
    return handleApiError(error, "Failed to load receipt settings");
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

    // Get constraints for validation
    const constraints = await getPlatformSalesConstraints();
    
    // Create dynamic schema based on constraints
    const patchSchema = z.object({
      receipt_prefix: z.string().min(1).max(constraints.max_receipt_prefix_length ?? 20).optional(),
      receipt_next_number: z.number().int().min(constraints.min_receipt_next_number ?? 1).optional(),
      receipt_header: z.string().max(constraints.max_receipt_header_length ?? 2000).nullable().optional(),
      receipt_footer: z.string().max(constraints.max_receipt_footer_length ?? 2000).nullable().optional(),
    });

    const body = patchSchema.parse(await request.json());
    
    // Validate each field against constraints
    if (body.receipt_prefix !== undefined) {
      const validation = validateAgainstConstraints("receipt_prefix", body.receipt_prefix, constraints);
      if (!validation.valid) {
        return errorResponse(validation.error || "Invalid receipt prefix", "VALIDATION_ERROR", 400);
      }
    }
    
    if (body.receipt_next_number !== undefined) {
      const validation = validateAgainstConstraints("receipt_next_number", body.receipt_next_number, constraints);
      if (!validation.valid) {
        return errorResponse(validation.error || "Invalid receipt next number", "VALIDATION_ERROR", 400);
      }
    }
    
    if (body.receipt_header !== undefined) {
      const validation = validateAgainstConstraints("receipt_header", body.receipt_header, constraints);
      if (!validation.valid) {
        return errorResponse(validation.error || "Invalid receipt header", "VALIDATION_ERROR", 400);
      }
    }
    
    if (body.receipt_footer !== undefined) {
      const validation = validateAgainstConstraints("receipt_footer", body.receipt_footer, constraints);
      if (!validation.valid) {
        return errorResponse(validation.error || "Invalid receipt footer", "VALIDATION_ERROR", 400);
      }
    }

    const update: any = { ...body, updated_at: new Date().toISOString() };

    const { data, error } = await (supabase.from("providers") as any)
      .update(update)
      .eq("id", providerId)
      .select("receipt_prefix, receipt_next_number, receipt_header, receipt_footer")
      .single();
    if (error) throw error;

    return successResponse({
      receipt_prefix: (data as any)?.receipt_prefix || "REC",
      receipt_next_number: Number((data as any)?.receipt_next_number || 1),
      receipt_header: (data as any)?.receipt_header ?? null,
      receipt_footer: (data as any)?.receipt_footer ?? null,
      isUsingPlatformDefault: false,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Invalid request data", "VALIDATION_ERROR", 400, error.issues);
    }
    return handleApiError(error, "Failed to update receipt settings");
  }
}

