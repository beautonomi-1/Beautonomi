import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * PATCH /api/admin/control-plane/modules/ai/templates/[id]
 * Update an AI prompt template (superadmin only).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const { id } = await params;
    const body = await request.json();
    const {
      enabled,
      platform_scopes,
      role_scopes,
      template,
      system_instructions,
      output_schema,
    } = body;

    const supabase = getSupabaseAdmin();
    const updates: Record<string, unknown> = {};

    if (enabled !== undefined) updates.enabled = Boolean(enabled);
    if (platform_scopes !== undefined) updates.platform_scopes = platform_scopes ?? null;
    if (role_scopes !== undefined) updates.role_scopes = role_scopes ?? null;
    if (template !== undefined) updates.template = String(template);
    if (system_instructions !== undefined) updates.system_instructions = String(system_instructions);
    if (output_schema !== undefined) updates.output_schema = output_schema ?? {};

    const { data, error } = await supabase
      .from("ai_prompt_templates")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return successResponse(data);
  } catch (error) {
    return handleApiError(error as Error, "Failed to update template");
  }
}
