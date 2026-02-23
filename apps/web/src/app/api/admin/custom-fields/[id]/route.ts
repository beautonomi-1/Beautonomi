import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, requireRoleInApi } from "@/lib/supabase/api-helpers";
import { z } from "zod";

const updateCustomFieldSchema = z.object({
  name: z.string().min(1).optional(),
  label: z.string().min(1).optional(),
  field_type: z.enum(["text", "textarea", "number", "email", "phone", "date", "select", "checkbox", "radio"]).optional(),
  entity_type: z.enum(["user", "provider", "booking", "service"]).optional(),
  is_required: z.boolean().optional(),
  is_active: z.boolean().optional(),
  placeholder: z.string().optional().nullable(),
  help_text: z.string().optional().nullable(),
  default_value: z.string().optional().nullable(),
  display_order: z.number().optional(),
  validation_rules: z.record(z.string(), z.any()).optional().nullable(),
}).partial();

/**
 * GET /api/admin/custom-fields/[id]
 * 
 * Get a specific custom field
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const { id } = await params;
    const adminSupabase = getSupabaseAdmin();

    const { data: field, error } = await adminSupabase
      .from("custom_fields")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      throw error;
    }

    return successResponse({ field });
  } catch (error) {
    return handleApiError(error, "Failed to fetch custom field");
  }
}

/**
 * PUT /api/admin/custom-fields/[id]
 * 
 * Update a custom field
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const { id } = await params;
    const body = await request.json();
    const validated = updateCustomFieldSchema.parse(body);

    const adminSupabase = getSupabaseAdmin();

    // If name or entity_type is being updated, check for duplicates
    if (validated.name || validated.entity_type) {
      const { data: current } = await adminSupabase
        .from("custom_fields")
        .select("name, entity_type")
        .eq("id", id)
        .single();

      if (current) {
        const newName = validated.name || current.name;
        const newEntityType = validated.entity_type || current.entity_type;

        const { data: existing } = await adminSupabase
          .from("custom_fields")
          .select("id")
          .eq("name", newName)
          .eq("entity_type", newEntityType)
          .neq("id", id)
          .maybeSingle();

        if (existing) {
          return handleApiError(
            new Error("Field name already exists"),
            "A custom field with this name already exists for this entity type",
            "DUPLICATE_FIELD",
            400
          );
        }
      }
    }

    const { data: field, error } = await adminSupabase
      .from("custom_fields")
      .update(validated)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return successResponse({ field });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(
        new Error(error.issues.map((e: any) => e.message).join(", ")),
        "Validation failed",
        "VALIDATION_ERROR",
        400
      );
    }
    return handleApiError(error, "Failed to update custom field");
  }
}

/**
 * PATCH /api/admin/custom-fields/[id]
 * 
 * Partially update a custom field
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return PUT(request, { params });
}

/**
 * DELETE /api/admin/custom-fields/[id]
 * 
 * Delete a custom field
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const { id } = await params;
    const adminSupabase = getSupabaseAdmin();

    const { error } = await adminSupabase
      .from("custom_fields")
      .delete()
      .eq("id", id);

    if (error) {
      throw error;
    }

    return successResponse({ message: "Custom field deleted successfully" });
  } catch (error) {
    return handleApiError(error, "Failed to delete custom field");
  }
}
