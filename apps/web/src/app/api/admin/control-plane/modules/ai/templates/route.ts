import { NextRequest, NextResponse } from "next/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/admin/control-plane/modules/ai/templates
 * List AI prompt templates (superadmin only).
 */
export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const { searchParams } = new URL(request.url);
    const key = searchParams.get("key") ?? undefined;

    const supabase = getSupabaseAdmin();
    let q = supabase
      .from("ai_prompt_templates")
      .select("id, key, version, enabled, platform_scopes, role_scopes, template, system_instructions, output_schema, updated_at")
      .order("key")
      .order("version", { ascending: false });

    if (key) q = q.eq("key", key);

    const { data, error } = await q;

    if (error) throw error;
    return successResponse(data ?? []);
  } catch (error) {
    return handleApiError(error as Error, "Failed to fetch templates");
  }
}

/**
 * POST /api/admin/control-plane/modules/ai/templates
 * Create template (superadmin only).
 */
export async function POST(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const body = await request.json();
    const {
      key,
      version = 1,
      enabled = true,
      platform_scopes,
      role_scopes,
      template = "",
      system_instructions = "",
      output_schema = {},
    } = body;

    if (!key) {
      return NextResponse.json({ data: null, error: { message: "key required", code: "VALIDATION_ERROR" } }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("ai_prompt_templates")
      .insert({
        key,
        version: Number(version),
        enabled: Boolean(enabled),
        platform_scopes: platform_scopes ?? null,
        role_scopes: role_scopes ?? null,
        template: String(template),
        system_instructions: String(system_instructions),
        output_schema: output_schema ?? {},
      })
      .select()
      .single();

    if (error) throw error;
    return successResponse(data);
  } catch (error) {
    return handleApiError(error as Error, "Failed to create template");
  }
}
