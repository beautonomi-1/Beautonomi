import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, handleApiError, notFoundResponse, errorResponse } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDERS_OPERATIONS } from "@/lib/admin-sections";
import { z } from "zod";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  is_active: z.boolean().optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_PROVIDERS_OPERATIONS, request);
    const supabase = getSupabaseAdmin();
    const { id } = await params;
    const body = patchSchema.parse(await request.json());

    const { data: src, error: srcErr } = await supabase
      .from("referral_sources")
      .select("id, provider_id")
      .eq("id", id)
      .maybeSingle();
    if (srcErr) throw srcErr;
    if (!src?.provider_id) return notFoundResponse("Referral source not found");

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) update.name = body.name.trim();
    if (body.description !== undefined) update.description = body.description?.trim() || null;
    if (body.is_active !== undefined) update.is_active = body.is_active;

    const { data, error } = await supabase
      .from("referral_sources")
      .update(update)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "superadmin",
      action: "admin.referral_source.update",
      entity_type: "referral_source",
      entity_id: id,
      module: "providers_operations",
      risk_level: "medium",
      retention_tier: "routine",
      metadata: update,
      ...extractRequestMeta(request),
    });

    return successResponse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(error.issues.map((i) => i.message).join(", "), "VALIDATION_ERROR", 400);
    }
    return handleApiError(error, "Failed to update referral source");
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_PROVIDERS_OPERATIONS, request);
    const supabase = getSupabaseAdmin();
    const { id } = await params;

    const { data: src, error: srcErr } = await supabase
      .from("referral_sources")
      .select("id, provider_id")
      .eq("id", id)
      .maybeSingle();
    if (srcErr) throw srcErr;
    if (!src?.provider_id) return notFoundResponse("Referral source not found");

    const { error } = await supabase.from("referral_sources").delete().eq("id", id);
    if (error) throw error;

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "superadmin",
      action: "admin.referral_source.delete",
      entity_type: "referral_source",
      entity_id: id,
      module: "providers_operations",
      risk_level: "medium",
      retention_tier: "routine",
      ...extractRequestMeta(request),
    });

    return successResponse({ ok: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete referral source");
  }
}
