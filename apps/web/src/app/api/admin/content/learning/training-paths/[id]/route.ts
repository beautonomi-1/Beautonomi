/**
 * PATCH /api/admin/content/learning/training-paths/[id]
 * DELETE /api/admin/content/learning/training-paths/[id]
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, handleApiError } from "@/lib/supabase/api-helpers";
import { unauthorizedResponse } from "@/lib/auth/requireRole";
import { writeAuditLog } from "@/lib/audit/audit";
import { ADMIN_SECTION_CONTENT_CATALOG } from "@/lib/admin-sections";
import { trainingPathPatchSchema } from "@/lib/learning/training-paths-schema";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_CONTENT_CATALOG, request);
    if (!user) return unauthorizedResponse("Authentication required");

    const { id } = await params;
    const parsed = trainingPathPatchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Validation failed",
            code: "VALIDATION_ERROR",
            details: parsed.error.issues,
          },
        },
        { status: 400 },
      );
    }

    const admin = getSupabaseAdmin();
    const { data: row, error } = await admin
      .from("learning_training_paths")
      .update({ ...parsed.data, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error || !row) {
      return NextResponse.json(
        { data: null, error: { message: "Path not found", code: "NOT_FOUND" } },
        { status: 404 },
      );
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: (user as { role?: string }).role ?? "superadmin",
      action: "admin.content.learning.training_path.update",
      entity_type: "learning_training_path",
      entity_id: row.id,
      metadata: { slug: row.slug, fields: Object.keys(parsed.data) },
    });

    return NextResponse.json({ data: row, error: null });
  } catch (err) {
    return handleApiError(err, "Failed to update training path");
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_CONTENT_CATALOG, request);
    if (!user) return unauthorizedResponse("Authentication required");

    const { id } = await params;
    const admin = getSupabaseAdmin();

    const { data: existing } = await admin
      .from("learning_training_paths")
      .select("id, slug, title")
      .eq("id", id)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json(
        { data: null, error: { message: "Path not found", code: "NOT_FOUND" } },
        { status: 404 },
      );
    }

    const { error } = await admin.from("learning_training_paths").delete().eq("id", id);
    if (error) return handleApiError(error, "Failed to delete training path");

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: (user as { role?: string }).role ?? "superadmin",
      action: "admin.content.learning.training_path.delete",
      entity_type: "learning_training_path",
      entity_id: existing.id,
      metadata: { slug: existing.slug, title: existing.title },
    });

    return NextResponse.json({ data: { id }, error: null });
  } catch (err) {
    return handleApiError(err, "Failed to delete training path");
  }
}
