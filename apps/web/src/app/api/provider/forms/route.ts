import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  getProviderIdForUser,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";

/**
 * GET /api/provider/forms
 * Return intake/consent/waiver forms with their fields.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff"],
      request
    );
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { searchParams } = new URL(request.url);
    const formType = searchParams.get("form_type");

    let query = supabase
      .from("provider_forms")
      .select(`
        id, title, description, form_type, is_required, is_active, created_at, updated_at,
        fields:provider_form_fields(id, name, field_type, is_required, sort_order)
      `)
      .eq("provider_id", providerId);

    if (formType) {
      query = query.eq("form_type", formType);
    }

    const { data: forms, error } = await query
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    // Sort fields by sort_order within each form
    const sorted = (forms || []).map((f: any) => ({
      ...f,
      fields: (f.fields || []).sort((a: any, b: any) => a.sort_order - b.sort_order),
    }));

    return successResponse(sorted);
  } catch (error) {
    return handleApiError(error, "Failed to load forms");
  }
}

/**
 * POST /api/provider/forms
 * Create a new form.
 * Body: { title: string, description?: string, form_type?: string, is_required?: boolean }
 */
export async function POST(request: NextRequest) {
  try {
    const permissionCheck = await requirePermission("edit_settings", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const body = await request.json();
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { title, description, form_type, is_required } = body;

    if (!title || typeof title !== "string") {
      return handleApiError(
        new Error("title is required"),
        "title is required",
        "VALIDATION_ERROR",
        400
      );
    }

    const { data: form, error } = await supabase
      .from("provider_forms")
      .insert({
        provider_id: providerId,
        title,
        description: description || null,
        form_type: form_type || "intake",
        is_required: is_required ?? false,
        is_active: true,
      })
      .select(`
        id, title, description, form_type, is_required, is_active, created_at, updated_at,
        fields:provider_form_fields(id, name, field_type, is_required, sort_order)
      `)
      .single();

    if (error) {
      throw error;
    }

    return successResponse(form, 201);
  } catch (error) {
    return handleApiError(error, "Failed to create form");
  }
}
