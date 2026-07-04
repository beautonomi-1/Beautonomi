/**
 * GET  /api/admin/commercial/terminal-collection-locations — list pickup hubs
 * POST /api/admin/commercial/terminal-collection-locations — create pickup hub
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

const addressSchema = z
  .object({
    line1: z.string().optional(),
    line2: z.string().optional(),
    city: z.string().optional(),
    province: z.string().optional(),
    postal_code: z.string().optional(),
    country: z.string().optional(),
    contact_phone: z.string().optional(),
    hours: z.string().optional(),
  })
  .passthrough()
  .default({});

const locationSchema = z.object({
  name: z.string().min(1).max(200),
  address: addressSchema,
  active: z.boolean().default(true),
  display_order: z.number().int().default(0),
});

export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_COMMERCIAL, request);
    const tenantId = await resolveAdminApiTenantId(request);
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("terminal_collection_locations")
      .select("*")
      .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      return errorResponse("Failed to load collection locations", "LOAD_ERROR", 500, error);
    }

    return successResponse({ items: data ?? [] });
  } catch (error) {
    return handleApiError(error, "Failed to load collection locations");
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user: adminUser } = await requireAdminSection(ADMIN_SECTION_COMMERCIAL, request);
    const tenantId = await resolveAdminApiTenantId(request);
    const supabase = getSupabaseAdmin();

    const body = await request.json();
    const validation = locationSchema.safeParse(body);
    if (!validation.success) {
      return errorResponse("Validation failed", "VALIDATION_ERROR", 400, validation.error.issues);
    }

    const { data, error } = await supabase
      .from("terminal_collection_locations")
      .insert({
        tenant_id: tenantId,
        ...validation.data,
      })
      .select("*")
      .single();

    if (error) {
      return errorResponse("Failed to create collection location", "SAVE_ERROR", 500, error);
    }

    const reqMeta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: adminUser.id,
      actor_role: adminUser.role ?? "superadmin",
      action: "admin.terminal_collection_location.created",
      entity_type: "terminal_collection_locations",
      entity_id: (data as { id: string }).id,
      module: "terminal_commerce",
      after_json: data,
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
    });

    return successResponse({ location: data });
  } catch (error) {
    return handleApiError(error, "Failed to create collection location");
  }
}
