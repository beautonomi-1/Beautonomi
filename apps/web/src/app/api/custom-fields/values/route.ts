import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  successResponse,
  handleApiError,
  errorResponse,
  unauthorizedResponse,
} from "@/lib/supabase/api-helpers";
import { z } from "zod";

const putSchema = z.object({
  entity_type: z.enum(["user", "provider", "booking", "service"]),
  entity_id: z.string().uuid(),
  values: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
});

/**
 * GET /api/custom-fields/values?entity_type=provider&entity_id=uuid
 * Returns custom field values for the given entity. RLS ensures caller can only read their own.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await getSupabaseServer(request);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return unauthorizedResponse("Sign in to view custom field values");
    }

    const { searchParams } = new URL(request.url);
    const entityType = searchParams.get("entity_type");
    const entityId = searchParams.get("entity_id");

    if (!entityType || !entityId) {
      return errorResponse("entity_type and entity_id are required", "BAD_REQUEST", 400);
    }
    if (!["user", "provider", "booking", "service"].includes(entityType)) {
      return errorResponse("Invalid entity_type", "BAD_REQUEST", 400);
    }

    const { data: rows, error } = await supabase
      .from("custom_field_values")
      .select("custom_field_id, value")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId);

    if (error) throw error;

    const { data: fields } = await supabase
      .from("custom_fields")
      .select("id, name")
      .eq("entity_type", entityType)
      .eq("is_active", true);

    const idToName = new Map((fields || []).map((f) => [f.id, f.name]));
    const values: Record<string, string> = {};
    (rows || []).forEach((r) => {
      const name = idToName.get(r.custom_field_id);
      if (name != null) values[name] = r.value ?? "";
    });

    return successResponse({ values });
  } catch (error) {
    return handleApiError(error, "Failed to fetch custom field values");
  }
}

/**
 * PUT /api/custom-fields/values
 * Body: { entity_type, entity_id, values: { [field_name]: value } }
 * Upserts values by field name. RLS ensures caller can only write to entities they own.
 */
export async function PUT(request: NextRequest) {
  try {
    const supabase = await getSupabaseServer(request);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return unauthorizedResponse("Sign in to save custom field values");
    }

    const body = await request.json();
    const parsed = putSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.message || "Invalid body", "BAD_REQUEST", 400);
    }

    const { entity_type, entity_id, values: inputValues } = parsed.data;

    const { data: fields, error: fieldsError } = await supabase
      .from("custom_fields")
      .select("id, name")
      .eq("entity_type", entity_type)
      .eq("is_active", true);

    if (fieldsError) throw fieldsError;
    const nameToId = new Map((fields || []).map((f) => [f.name, f.id]));

    const toUpsert: { entity_type: string; entity_id: string; custom_field_id: string; value: string }[] = [];
    for (const [name, value] of Object.entries(inputValues)) {
      const fieldId = nameToId.get(name);
      if (!fieldId) continue;
      toUpsert.push({
        entity_type,
        entity_id,
        custom_field_id: fieldId,
        value: value == null ? "" : String(value),
      });
    }

    for (const row of toUpsert) {
      const { error: upsertError } = await supabase
        .from("custom_field_values")
        .upsert(row, {
          onConflict: "entity_type,entity_id,custom_field_id",
          ignoreDuplicates: false,
        });
      if (upsertError) throw upsertError;
    }

    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to save custom field values");
  }
}
