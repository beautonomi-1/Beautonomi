import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * GET /api/custom-fields/definitions?entity_type=provider
 * Returns active custom field definitions for the given entity type.
 * Used by provider app, customer app, and booking flows to render dynamic form fields.
 * Requires authenticated user (RLS on custom_fields allows SELECT for authenticated when is_active = true).
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await getSupabaseServer(request);
    const { searchParams } = new URL(request.url);
    const entityType = searchParams.get("entity_type");

    if (!entityType || !["user", "provider", "booking", "service"].includes(entityType)) {
      return successResponse({ definitions: [] });
    }

    const { data: definitions, error } = await supabase
      .from("custom_fields")
      .select("id, name, label, field_type, entity_type, is_required, placeholder, help_text, default_value, display_order, validation_rules")
      .eq("entity_type", entityType)
      .eq("is_active", true)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) throw error;

    return successResponse({ definitions: definitions || [] });
  } catch (error) {
    return handleApiError(error, "Failed to fetch custom field definitions");
  }
}
