import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { z } from "zod";

const updateTemplateSchema = z.object({
  name: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  type: z.enum(["internal", "client_visible", "system"]).optional(),
  category: z.string().optional().nullable(),
  is_active: z.boolean().optional(),
});

/**
 * GET /api/provider/note-templates/[id]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);

    const supabase = await getSupabaseServer(request);
    const { id } = await params;

    // For superadmin, allow viewing any template; for providers, only their own
    let providerId: string | null = null;
    if (user.role === "superadmin") {
      // Get provider_id from the template itself
      const { data: templateCheck } = await supabase
        .from("note_templates")
        .select("provider_id")
        .eq("id", id)
        .single();
      if (templateCheck) {
        providerId = templateCheck.provider_id;
      }
    } else {
      providerId = await getProviderIdForUser(user.id, supabase);
      if (!providerId) {
        return notFoundResponse("Provider not found");
      }
    }

    let query = supabase
      .from("note_templates")
      .select("*")
      .eq("id", id);

    if (providerId) {
      query = query.eq("provider_id", providerId);
    }

    const { data: template, error } = await query.single();

    if (error || !template) {
      return notFoundResponse("Note template not found");
    }

    // Ensure type is set
    const transformedTemplate = {
      ...template,
      type: template.type || 'internal',
      category: template.category || null,
    };

    return successResponse(transformedTemplate);
  } catch (error) {
    return handleApiError(error, "Failed to fetch note template");
  }
}

/**
 * PATCH /api/provider/note-templates/[id]
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Check permission to edit settings
    const permissionCheck = await requirePermission('edit_settings', request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;

    const supabase = await getSupabaseServer(request);
    const { id } = await params;
    const body = await request.json();

    const validationResult = updateTemplateSchema.safeParse(body);
    if (!validationResult.success) {
      return errorResponse(
        "Validation failed",
        "VALIDATION_ERROR",
        400,
        validationResult.error.issues
      );
    }

    // For superadmin, allow updating any template; for providers, only their own
    let providerId: string | null = null;
    if (user.role === "superadmin") {
      // Get provider_id from the template itself
      const { data: templateCheck } = await supabase
        .from("note_templates")
        .select("provider_id")
        .eq("id", id)
        .single();
      if (templateCheck) {
        providerId = templateCheck.provider_id;
      }
    } else {
      providerId = await getProviderIdForUser(user.id, supabase);
      if (!providerId) {
        return notFoundResponse("Provider not found");
      }
    }

    // Verify template exists
    let verifyQuery = supabase
      .from("note_templates")
      .select("id")
      .eq("id", id);

    if (providerId) {
      verifyQuery = verifyQuery.eq("provider_id", providerId);
    }

    const { data: existingTemplate } = await verifyQuery.single();

    if (!existingTemplate) {
      return notFoundResponse("Note template not found");
    }

    // Prepare update data
    const updateData: any = {};
    if (validationResult.data.name !== undefined) {
      updateData.name = validationResult.data.name.trim();
    }
    if (validationResult.data.content !== undefined) {
      updateData.content = validationResult.data.content.trim();
    }
    if (validationResult.data.type !== undefined) {
      updateData.type = validationResult.data.type;
    }
    if (validationResult.data.category !== undefined) {
      updateData.category = validationResult.data.category?.trim() || null;
    }
    if (validationResult.data.is_active !== undefined) {
      updateData.is_active = validationResult.data.is_active;
    }
    updateData.updated_at = new Date().toISOString();

    // Update template
    const { data: updatedTemplate, error: updateError } = await (supabase
      .from("note_templates") as any)
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (updateError || !updatedTemplate) {
      throw updateError || new Error("Failed to update note template");
    }

    // Ensure type is set
    const transformedTemplate = {
      ...updatedTemplate,
      type: updatedTemplate.type || 'internal',
      category: updatedTemplate.category || null,
    };

    return successResponse(transformedTemplate);
  } catch (error) {
    return handleApiError(error, "Failed to update note template");
  }
}

/**
 * DELETE /api/provider/note-templates/[id]
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Check permission to edit settings
    const permissionCheck = await requirePermission('edit_settings', request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;

    const supabase = await getSupabaseServer(request);
    const { id } = await params;

    // For superadmin, allow deleting any template; for providers, only their own
    let providerId: string | null = null;
    if (user.role === "superadmin") {
      // Get provider_id from the template itself
      const { data: templateCheck } = await supabase
        .from("note_templates")
        .select("provider_id")
        .eq("id", id)
        .single();
      if (templateCheck) {
        providerId = templateCheck.provider_id;
      }
    } else {
      providerId = await getProviderIdForUser(user.id, supabase);
      if (!providerId) {
        return notFoundResponse("Provider not found");
      }
    }

    // Verify template exists
    let verifyQuery = supabase
      .from("note_templates")
      .select("id")
      .eq("id", id);

    if (providerId) {
      verifyQuery = verifyQuery.eq("provider_id", providerId);
    }

    const { data: existingTemplate } = await verifyQuery.single();

    if (!existingTemplate) {
      return notFoundResponse("Note template not found");
    }

    const { error: deleteError } = await supabase
      .from("note_templates")
      .delete()
      .eq("id", id);

    if (deleteError) {
      throw deleteError;
    }

    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete note template");
  }
}
