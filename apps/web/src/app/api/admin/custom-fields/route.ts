import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, requireRoleInApi } from "@/lib/supabase/api-helpers";
import { z } from "zod";

const customFieldSchema = z.object({
  name: z.string().min(1, "Name is required"),
  label: z.string().min(1, "Label is required"),
  field_type: z.enum(["text", "textarea", "number", "email", "phone", "date", "select", "checkbox", "radio"]),
  entity_type: z.enum(["user", "provider", "booking", "service"]),
  is_required: z.boolean().default(false),
  is_active: z.boolean().default(true),
  placeholder: z.string().optional().nullable(),
  help_text: z.string().optional().nullable(),
  default_value: z.string().optional().nullable(),
  display_order: z.number().default(0),
  validation_rules: z.record(z.string(), z.any()).optional().nullable(),
});

/**
 * GET /api/admin/custom-fields
 * 
 * Get all custom fields
 */
export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const adminSupabase = getSupabaseAdmin();

    const { searchParams } = new URL(request.url);
    const entity_type = searchParams.get("entity_type");
    const is_active = searchParams.get("is_active");

    let query = adminSupabase
      .from("custom_fields")
      .select("*")
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: false });

    if (entity_type) {
      query = query.eq("entity_type", entity_type);
    }

    if (is_active !== null) {
      query = query.eq("is_active", is_active === "true");
    }

    const { data: fields, error } = await query;

    if (error) {
      throw error;
    }

    return successResponse({ fields: fields || [] });
  } catch (error) {
    return handleApiError(error, "Failed to fetch custom fields");
  }
}

/**
 * POST /api/admin/custom-fields
 * 
 * Create a new custom field
 */
export async function POST(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const body = await request.json();
    const validated = customFieldSchema.parse(body);

    const adminSupabase = getSupabaseAdmin();

    // Check if field name already exists for this entity type
    const { data: existing } = await adminSupabase
      .from("custom_fields")
      .select("id")
      .eq("name", validated.name)
      .eq("entity_type", validated.entity_type)
      .maybeSingle();

    if (existing) {
      return handleApiError(
        new Error("Field name already exists"),
        "A custom field with this name already exists for this entity type",
        "DUPLICATE_FIELD",
        400
      );
    }

    const { data: field, error } = await adminSupabase
      .from("custom_fields")
      .insert({
        name: validated.name,
        label: validated.label,
        field_type: validated.field_type,
        entity_type: validated.entity_type,
        is_required: validated.is_required,
        is_active: validated.is_active,
        placeholder: validated.placeholder || null,
        help_text: validated.help_text || null,
        default_value: validated.default_value || null,
        display_order: validated.display_order,
        validation_rules: validated.validation_rules || null,
      })
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
    return handleApiError(error, "Failed to create custom field");
  }
}
