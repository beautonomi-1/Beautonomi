import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { z } from "zod";

const createTemplateSchema = z.object({
  name: z.string().min(1),
  content: z.string().min(1),
  type: z.enum(["internal", "client_visible", "system"]).optional(),
  category: z.string().optional().nullable(),
  is_active: z.boolean().optional(),
});

/**
 * GET /api/provider/note-templates
 * 
 * Get provider's note templates
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);

    const supabase = await getSupabaseServer(request);
    const { searchParams } = new URL(request.url);
    const providerIdParam = searchParams.get("provider_id"); // For superadmin to view specific provider

    // For superadmin, allow viewing any provider's templates
    let providerId: string | null = null;
    if (user.role === "superadmin" && providerIdParam) {
      providerId = providerIdParam;
    } else {
      // For providers, get their own provider ID
      providerId = await getProviderIdForUser(user.id, supabase);
      if (!providerId) {
        return notFoundResponse("Provider not found");
      }
    }

    let query = supabase
      .from("note_templates")
      .select("*")
      .order("name", { ascending: true });

    if (providerId) {
      query = query.eq("provider_id", providerId);
    }

    const { data: templates, error } = await query;

    if (error) {
      throw error;
    }

    // Transform to match UI expectations (ensure type field exists)
    const transformedTemplates = (templates || []).map((t: any) => ({
      ...t,
      type: t.type || 'internal', // Default to internal if type is null
      category: t.category || null,
    }));

    return successResponse(transformedTemplates);
  } catch (error) {
    return handleApiError(error, "Failed to fetch note templates");
  }
}

/**
 * POST /api/provider/note-templates
 * 
 * Create a new note template
 */
export async function POST(request: NextRequest) {
  try {
    // Check permission to edit settings
    const permissionCheck = await requirePermission('edit_settings', request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;

    const supabase = await getSupabaseServer(request);
    const body = await request.json();

    // Validate input
    const validationResult = createTemplateSchema.safeParse(body);
    if (!validationResult.success) {
      return errorResponse(
        "Validation failed",
        "VALIDATION_ERROR",
        400,
        validationResult.error.issues
      );
    }

    const data = validationResult.data;

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Create template
    const insertData: any = {
      provider_id: providerId,
      name: data.name.trim(),
      content: data.content.trim(),
      type: data.type || 'internal',
      is_active: data.is_active ?? true,
    };

    if (data.category !== undefined) {
      insertData.category = data.category?.trim() || null;
    }

    const { data: newTemplate, error: insertError } = await (supabase
      .from("note_templates") as any)
      .insert(insertData)
      .select()
      .single();

    if (insertError || !newTemplate) {
      throw insertError || new Error("Failed to create note template");
    }

    // Ensure type is set
    const transformedTemplate = {
      ...newTemplate,
      type: newTemplate.type || 'internal',
      category: newTemplate.category || null,
    };

    return successResponse(transformedTemplate);
  } catch (error) {
    return handleApiError(error, "Failed to create note template");
  }
}
