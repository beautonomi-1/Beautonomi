import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { writeAuditLog } from "@/lib/audit/audit";

const upsertSchema = z.object({
  points_per_currency_unit: z.number().positive(),
  currency: z.string().min(1).default("ZAR"),
  redemption_rate: z.number().positive(), // points per currency unit (e.g. 100 points == 10 ZAR -> store 100)
  is_active: z.boolean().optional().default(true),
});

export async function GET(_request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"]);
    const supabase = await getSupabaseServer();

    const { data, error } = await supabase
      .from("loyalty_rules")
      .select("*")
      .order("effective_from", { ascending: false })
      .limit(20);
    if (error) throw error;

    return successResponse(data || []);
  } catch (error) {
    return handleApiError(error, "Failed to fetch loyalty rules");
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["superadmin"]);
    const supabase = await getSupabaseServer();

    const body = upsertSchema.parse(await request.json());

    const { data: row, error } = await (supabase.from("loyalty_rules") as any)
      .insert({
        points_per_currency_unit: body.points_per_currency_unit,
        currency: body.currency,
        redemption_rate: body.redemption_rate,
        is_active: body.is_active ?? true,
        effective_from: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw error;

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "create",
      entity_type: "loyalty_rule",
      entity_id: row.id,
      metadata: { currency: body.currency },
    });

    return successResponse(row);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(error, "Invalid request", "VALIDATION_ERROR", 400);
    }
    return handleApiError(error, "Failed to create loyalty rule");
  }
}

