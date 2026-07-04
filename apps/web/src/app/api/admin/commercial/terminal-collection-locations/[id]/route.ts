/**
 * PATCH /api/admin/commercial/terminal-collection-locations/[id]
 * DELETE /api/admin/commercial/terminal-collection-locations/[id]
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_COMMERCIAL } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  address: z.record(z.unknown()).optional(),
  active: z.boolean().optional(),
  display_order: z.number().int().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { user: adminUser } = await requireAdminSection(ADMIN_SECTION_COMMERCIAL, request);
    const tenantId = await resolveAdminApiTenantId(request);
    const supabase = getSupabaseAdmin();

    const { data: existing, error: loadErr } = await supabase
      .from("terminal_collection_locations")
      .select("*")
      .eq("id", id)
      .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
      .maybeSingle();

    if (loadErr) return errorResponse("Failed to load location", "LOAD_ERROR", 500, loadErr);
    if (!existing) return errorResponse("Location not found", "NOT_FOUND", 404);

    const body = await request.json();
    const validation = patchSchema.safeParse(body);
    if (!validation.success) {
      return errorResponse("Validation failed", "VALIDATION_ERROR", 400, validation.error.issues);
    }

    const { data, error } = await supabase
      .from("terminal_collection_locations")
      .update({ ...validation.data, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();

    if (error) return errorResponse("Failed to update location", "SAVE_ERROR", 500, error);

    const reqMeta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: adminUser.id,
      actor_role: adminUser.role ?? "superadmin",
      action: "admin.terminal_collection_location.updated",
      entity_type: "terminal_collection_locations",
      entity_id: id,
      module: "terminal_commerce",
      before_json: existing,
      after_json: data,
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
    });

    return successResponse({ location: data });
  } catch (error) {
    return handleApiError(error, "Failed to update collection location");
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { user: adminUser } = await requireAdminSection(ADMIN_SECTION_COMMERCIAL, request);
    const tenantId = await resolveAdminApiTenantId(request);
    const supabase = getSupabaseAdmin();

    const { data: existing, error: loadErr } = await supabase
      .from("terminal_collection_locations")
      .select("*")
      .eq("id", id)
      .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
      .maybeSingle();

    if (loadErr) return errorResponse("Failed to load location", "LOAD_ERROR", 500, loadErr);
    if (!existing) return errorResponse("Location not found", "NOT_FOUND", 404);

    const { error } = await supabase.from("terminal_collection_locations").delete().eq("id", id);
    if (error) return errorResponse("Failed to delete location", "DELETE_ERROR", 500, error);

    const reqMeta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: adminUser.id,
      actor_role: adminUser.role ?? "superadmin",
      action: "admin.terminal_collection_location.deleted",
      entity_type: "terminal_collection_locations",
      entity_id: id,
      module: "terminal_commerce",
      before_json: existing,
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
    });

    return successResponse({ deleted: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete collection location");
  }
}
