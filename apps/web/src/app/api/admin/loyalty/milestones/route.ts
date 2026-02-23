import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { writeAuditLog } from "@/lib/audit/audit";

const milestoneSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  points_threshold: z.number().int().positive(),
  reward_type: z.literal("wallet_credit").default("wallet_credit"),
  reward_amount: z.number().min(0),
  reward_currency: z.string().min(1).default("ZAR"),
  is_active: z.boolean().optional().default(true),
});

export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const supabase = await getSupabaseServer(request);

    const { data, error } = await supabase
      .from("loyalty_milestones")
      .select("*")
      .order("points_threshold", { ascending: true });
    
    if (error) {
      console.error("Error fetching loyalty milestones:", error);
      // Return empty array instead of throwing
      return successResponse([]);
    }

    return successResponse(data || []);
  } catch (error) {
    console.error("Unexpected error in /api/admin/loyalty/milestones:", error);
    // Return empty array instead of 500 error
    return successResponse([]);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const body = milestoneSchema.parse(await request.json());

    const { data: row, error } = await (supabase.from("loyalty_milestones") as any)
      .insert({
        name: body.name,
        description: body.description || null,
        points_threshold: body.points_threshold,
        reward_type: body.reward_type,
        reward_amount: body.reward_amount,
        reward_currency: body.reward_currency,
        is_active: body.is_active ?? true,
      })
      .select()
      .single();
    if (error) throw error;

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "create",
      entity_type: "loyalty_milestone",
      entity_id: row.id,
      metadata: { points_threshold: body.points_threshold, reward_amount: body.reward_amount },
    });

    return successResponse(row);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(error, "Invalid request", "VALIDATION_ERROR", 400);
    }
    return handleApiError(error, "Failed to create loyalty milestone");
  }
}

