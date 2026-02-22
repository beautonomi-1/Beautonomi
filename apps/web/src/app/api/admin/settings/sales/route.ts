import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { writeAuditLog } from "@/lib/audit/audit";
import { z } from "zod";
import type { PlatformSalesDefaults, PlatformSalesConstraints } from "@/lib/platform-sales-settings";

const salesDefaultsSchema = z.object({
  tax_rate_percent: z.number().min(0).max(100).optional(),
  receipt_prefix: z.string().max(20).optional(),
  receipt_next_number: z.number().int().min(1).optional(),
  receipt_header: z.string().max(2000).nullable().optional(),
  receipt_footer: z.string().max(2000).nullable().optional(),
  gift_cards_enabled: z.boolean().optional(),
  gift_card_terms: z.string().nullable().optional(),
  service_charge_name: z.string().optional(),
  service_charge_rate: z.number().min(0).optional(),
  upselling_enabled: z.boolean().optional(),
});

const salesConstraintsSchema = z.object({
  max_tax_rate_percent: z.number().min(0).max(100).optional(),
  required_receipt_fields: z.array(z.string()).optional(),
  max_receipt_prefix_length: z.number().int().min(1).max(50).optional(),
  min_receipt_next_number: z.number().int().min(1).optional(),
  max_receipt_header_length: z.number().int().min(1).optional(),
  max_receipt_footer_length: z.number().int().min(1).optional(),
});

const updateSalesSettingsSchema = z.object({
  defaults: salesDefaultsSchema.optional(),
  constraints: salesConstraintsSchema.optional(),
});

/**
 * GET /api/admin/settings/sales
 * 
 * Get platform sales defaults and constraints
 */
export async function GET(_request: NextRequest) {
  try {
    await requireRoleInApi(['superadmin']);

    const supabase = await getSupabaseServer();

    const { data: settings, error } = await supabase
      .from("platform_settings")
      .select("settings")
      .eq("is_active", true)
      .single();

    if (error || !settings) {
      // Return defaults if no settings exist
      return successResponse({
        defaults: {
          tax_rate_percent: 0,
          receipt_prefix: "REC",
          receipt_next_number: 1,
          receipt_header: null,
          receipt_footer: null,
          gift_cards_enabled: false,
          gift_card_terms: null,
          service_charge_name: "Service Charge",
          service_charge_rate: 0,
          upselling_enabled: false,
        },
        constraints: {
          max_tax_rate_percent: 30,
          required_receipt_fields: ["receipt_number", "date", "total"],
          max_receipt_prefix_length: 20,
          min_receipt_next_number: 1,
          max_receipt_header_length: 2000,
          max_receipt_footer_length: 2000,
        },
      });
    }

    const platformSettings = (settings as any).settings || {};
    const salesSettings = platformSettings.sales || {};

    // Merge with defaults
    const defaults: PlatformSalesDefaults = {
      tax_rate_percent: 0,
      receipt_prefix: "REC",
      receipt_next_number: 1,
      receipt_header: null,
      receipt_footer: null,
      gift_cards_enabled: false,
      gift_card_terms: null,
      service_charge_name: "Service Charge",
      service_charge_rate: 0,
      upselling_enabled: false,
      ...salesSettings.defaults,
    };

    const constraints: PlatformSalesConstraints = {
      max_tax_rate_percent: 30,
      required_receipt_fields: ["receipt_number", "date", "total"],
      max_receipt_prefix_length: 20,
      min_receipt_next_number: 1,
      max_receipt_header_length: 2000,
      max_receipt_footer_length: 2000,
      ...salesSettings.constraints,
    };

    return successResponse({ defaults, constraints });
  } catch (error) {
    return handleApiError(error, "Failed to load sales settings");
  }
}

/**
 * PATCH /api/admin/settings/sales
 * 
 * Update platform sales defaults and constraints
 */
export async function PATCH(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['superadmin']);

    const supabase = await getSupabaseServer();
    const body = await request.json();
    const validated = updateSalesSettingsSchema.parse(body);

    // Get existing settings
    const { data: existingSettings, error: fetchError } = await supabase
      .from("platform_settings")
      .select("id, settings")
      .eq("is_active", true)
      .single();

    let platformSettings: any = {};
    let settingsId: string | null = null;

    if (existingSettings && !fetchError) {
      platformSettings = (existingSettings as any).settings || {};
      settingsId = (existingSettings as any).id;
    }

    // Update sales settings
    if (!platformSettings.sales) {
      platformSettings.sales = {};
    }

    if (validated.defaults) {
      platformSettings.sales.defaults = {
        ...platformSettings.sales.defaults,
        ...validated.defaults,
      };
    }

    if (validated.constraints) {
      platformSettings.sales.constraints = {
        ...platformSettings.sales.constraints,
        ...validated.constraints,
      };
    }

    // Upsert settings
    if (settingsId) {
      const { data: updatedSettings, error: updateError } = await supabase
        .from("platform_settings")
        .update({
          settings: platformSettings,
          updated_at: new Date().toISOString(),
        })
        .eq("id", settingsId)
        .select("settings")
        .single();

      if (updateError || !updatedSettings) {
        throw updateError || new Error("Failed to update settings");
      }

      await writeAuditLog({
        actor_user_id: user.id,
        actor_role: (user as any).role || "superadmin",
        action: "admin.settings.sales.update",
        entity_type: "platform_settings",
        entity_id: settingsId,
        metadata: {
          updated_fields: Object.keys(validated),
          updated_at: new Date().toISOString(),
        },
      });

      const salesSettings = (updatedSettings as any).settings?.sales || {};
      return successResponse({
        defaults: salesSettings.defaults || {},
        constraints: salesSettings.constraints || {},
      });
    } else {
      // Create new settings
      const { data: newSettings, error: createError } = await supabase
        .from("platform_settings")
        .insert({
          settings: platformSettings,
        })
        .select("id, settings")
        .single();

      if (createError || !newSettings) {
        throw createError || new Error("Failed to create settings");
      }

      await writeAuditLog({
        actor_user_id: user.id,
        actor_role: (user as any).role || "superadmin",
        action: "admin.settings.sales.create",
        entity_type: "platform_settings",
        entity_id: (newSettings as any).id,
        metadata: {
          created_at: new Date().toISOString(),
        },
      });

      const salesSettings = (newSettings as any).settings?.sales || {};
      return successResponse({
        defaults: salesSettings.defaults || {},
        constraints: salesSettings.constraints || {},
      });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Invalid request data", "VALIDATION_ERROR", 400, error.issues);
    }
    return handleApiError(error, "Failed to update sales settings");
  }
}
