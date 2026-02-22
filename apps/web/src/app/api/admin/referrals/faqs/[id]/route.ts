import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError, notFoundResponse } from "@/lib/supabase/api-helpers";
import { writeAuditLog } from "@/lib/audit/audit";

const updateSchema = z.object({
  question: z.string().min(1).optional(),
  answer: z.string().optional().nullable(),
  answer_type: z.enum(["text", "list"]).optional(),
  answer_list: z.array(z.string()).optional().nullable(),
  display_order: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["superadmin"]);
    const supabase = await getSupabaseServer();
    const { id } = await params;
    const body = updateSchema.parse(await request.json());

    const updateData: any = {};
    if (body.question !== undefined) updateData.question = body.question;
    if (body.answer !== undefined) updateData.answer = body.answer;
    if (body.answer_type !== undefined) updateData.answer_type = body.answer_type;
    if (body.answer_list !== undefined) updateData.answer_list = body.answer_list;
    if (body.display_order !== undefined) updateData.display_order = body.display_order;
    if (body.is_active !== undefined) updateData.is_active = body.is_active;
    updateData.updated_at = new Date().toISOString();

    const { data: row, error } = await (supabase.from("referral_faqs") as any)
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error || !row) {
      if (error?.code === "42P01") {
        return handleApiError(
          new Error("referral_faqs table does not exist. Please run the migration first."),
          "Database table not found",
          "TABLE_NOT_FOUND",
          500
        );
      }
      return notFoundResponse("FAQ not found");
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "update",
      entity_type: "referral_faq",
      entity_id: id,
      metadata: body,
    });

    return successResponse(row);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(error, "Invalid request", "VALIDATION_ERROR", 400);
    }
    return handleApiError(error, "Failed to update referral FAQ");
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["superadmin"]);
    const supabase = await getSupabaseServer();
    const { id } = await params;

    const { data: existing } = await supabase
      .from("referral_faqs")
      .select("id")
      .eq("id", id)
      .maybeSingle();

    if (!existing) {
      return notFoundResponse("FAQ not found");
    }

    const { error } = await (supabase.from("referral_faqs") as any).delete().eq("id", id);
    if (error) throw error;

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "delete",
      entity_type: "referral_faq",
      entity_id: id,
      metadata: {},
    });

    return successResponse({ ok: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete referral FAQ");
  }
}
