import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAdminSection, successResponse, handleApiError, notFoundResponse } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_MARKETING_COMMS } from "@/lib/admin-sections";
import { writeAuditLog } from "@/lib/audit/audit";

const patchSchema = z.object({
  points_per_currency_unit: z.number().positive().optional(),
  redemption_rate: z.number().positive().optional(),
  currency: z.string().min(1).optional(),
  is_active: z.boolean().optional(),
  /** ISO-8601 timestamp or null to clear */
  effective_until: z.union([z.string().min(1), z.null()]).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_MARKETING_COMMS, request);
    const supabase = await getSupabaseServer(request);
    const { id } = await params;
    const parsed = patchSchema.parse(await request.json());

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (parsed.points_per_currency_unit !== undefined) {
      updates.points_per_currency_unit = parsed.points_per_currency_unit;
    }
    if (parsed.redemption_rate !== undefined) {
      updates.redemption_rate = parsed.redemption_rate;
    }
    if (parsed.currency !== undefined) {
      updates.currency = parsed.currency;
    }
    if (parsed.is_active !== undefined) {
      updates.is_active = parsed.is_active;
    }
    if (parsed.effective_until !== undefined) {
      updates.effective_until = parsed.effective_until;
    }

    const { data: row, error } = await supabase
      .from("loyalty_rules")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error || !row) {
      return notFoundResponse("Loyalty rule not found");
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "update",
      entity_type: "loyalty_rule",
      entity_id: id,
      metadata: parsed,
    });

    return successResponse(row);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(error, "Invalid request", "VALIDATION_ERROR", 400);
    }
    return handleApiError(error, "Failed to update loyalty rule");
  }
}
