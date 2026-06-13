import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_MARKETING_COMMS } from "@/lib/admin-sections";
import { writeAuditLog } from "@/lib/audit/audit";

const patchSchema = z.object({
  redemption_rate: z.number().positive().optional(),
  min_redemption_points: z.number().int().nonnegative().optional(),
  max_redemption_percentage: z.number().min(0).max(100).optional(),
  is_active: z.boolean().optional(),
});

export type LoyaltyPointConfigRow = {
  id: string;
  name: string;
  redemption_rate: number;
  min_redemption_points: number | null;
  max_redemption_percentage: number | null;
  is_active: boolean | null;
  updated_at?: string;
};

async function fetchActiveConfig(): Promise<LoyaltyPointConfigRow | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("loyalty_point_config")
    .select("id, name, redemption_rate, min_redemption_points, max_redemption_percentage, is_active, updated_at")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as LoyaltyPointConfigRow | null;
}

/**
 * GET /api/admin/loyalty/config
 * Active checkout redemption settings (loyalty_point_config).
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_MARKETING_COMMS, request);
    const config = await fetchActiveConfig();
    return successResponse({ config });
  } catch (error) {
    return handleApiError(error, "Failed to fetch loyalty config");
  }
}

/**
 * PATCH /api/admin/loyalty/config
 * Update the active loyalty_point_config row used at checkout redemption.
 */
export async function PATCH(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_MARKETING_COMMS, request);
    const parsed = patchSchema.parse(await request.json());
    const supabase = getSupabaseAdmin();

    const existing = await fetchActiveConfig();
    if (!existing?.id) {
      return errorResponse("No active loyalty point config found", "NOT_FOUND", 404);
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (parsed.redemption_rate !== undefined) updates.redemption_rate = parsed.redemption_rate;
    if (parsed.min_redemption_points !== undefined) {
      updates.min_redemption_points = parsed.min_redemption_points;
    }
    if (parsed.max_redemption_percentage !== undefined) {
      updates.max_redemption_percentage = parsed.max_redemption_percentage;
    }
    if (parsed.is_active !== undefined) updates.is_active = parsed.is_active;

    const { data: row, error } = await supabase
      .from("loyalty_point_config")
      .update(updates)
      .eq("id", existing.id)
      .select("id, name, redemption_rate, min_redemption_points, max_redemption_percentage, is_active, updated_at")
      .single();

    if (error) throw error;

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "update",
      entity_type: "loyalty_point_config",
      entity_id: existing.id,
      metadata: parsed,
    });

    return successResponse({ config: row });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(error, "Invalid request", "VALIDATION_ERROR", 400);
    }
    return handleApiError(error, "Failed to update loyalty config");
  }
}
