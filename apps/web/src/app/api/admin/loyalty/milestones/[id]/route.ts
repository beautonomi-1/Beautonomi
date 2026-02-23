import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError, notFoundResponse } from "@/lib/supabase/api-helpers";
import { writeAuditLog } from "@/lib/audit/audit";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  points_threshold: z.number().int().positive().optional(),
  reward_amount: z.number().min(0).optional(),
  reward_currency: z.string().min(1).optional(),
  is_active: z.boolean().optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const { id } = await params;
    const body = updateSchema.parse(await request.json());

    const { data: row, error } = await (supabase.from("loyalty_milestones") as any)
      .update({
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.points_threshold !== undefined ? { points_threshold: body.points_threshold } : {}),
        ...(body.reward_amount !== undefined ? { reward_amount: body.reward_amount } : {}),
        ...(body.reward_currency !== undefined ? { reward_currency: body.reward_currency } : {}),
        ...(body.is_active !== undefined ? { is_active: body.is_active } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();
    if (error || !row) return notFoundResponse("Milestone not found");

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "update",
      entity_type: "loyalty_milestone",
      entity_id: id,
      metadata: body,
    });

    return successResponse(row);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(error, "Invalid request", "VALIDATION_ERROR", 400);
    }
    return handleApiError(error, "Failed to update loyalty milestone");
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const { id } = await params;

    const { data: existing } = await supabase.from("loyalty_milestones").select("id").eq("id", id).maybeSingle();
    if (!existing) return notFoundResponse("Milestone not found");

    const { error } = await (supabase.from("loyalty_milestones") as any).delete().eq("id", id);
    if (error) throw error;

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "delete",
      entity_type: "loyalty_milestone",
      entity_id: id,
      metadata: {},
    });

    return successResponse({ ok: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete loyalty milestone");
  }
}

