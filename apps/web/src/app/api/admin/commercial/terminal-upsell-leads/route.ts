/**
 * POST /api/admin/commercial/terminal-upsell-leads
 * PATCH /api/admin/commercial/terminal-upsell-leads/[id]
 * GET  /api/admin/commercial/terminal-upsell-leads/[id]/activities
 */

import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
  errorResponse,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_COMMERCIAL } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";
import {
  TERMINAL_UPSELL_PIPELINE_STATUSES,
  type TerminalUpsellPipelineStatus,
} from "@/lib/terminal/terminal-upsell-segment";

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_COMMERCIAL, request);
    const tenantId = await resolveAdminApiTenantId(request);
    const body = (await request.json()) as {
      provider_id?: string;
      source?: "auto_segment" | "manual";
    };

    const providerId = body.provider_id?.trim();
    if (!providerId) {
      return errorResponse("provider_id is required", "VALIDATION_ERROR", 400);
    }

    const supabase = getSupabaseAdmin();

    const { data: provider } = await supabase
      .from("providers")
      .select("id, business_name")
      .eq("id", providerId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!provider) return notFoundResponse("Provider not found");

    const { data: existing } = await supabase
      .from("terminal_upsell_leads")
      .select("id, status")
      .eq("tenant_id", tenantId)
      .eq("provider_id", providerId)
      .maybeSingle();

    if (existing) {
      return successResponse({ lead: existing, created: false });
    }

    const source = body.source === "auto_segment" ? "auto_segment" : "manual";

    const { data: lead, error } = await supabase
      .from("terminal_upsell_leads")
      .insert({
        tenant_id: tenantId,
        provider_id: providerId,
        status: "new",
        source,
        created_by: user.id,
      })
      .select("*")
      .single();

    if (error) throw error;

    await supabase.from("terminal_upsell_lead_activities").insert({
      lead_id: lead.id,
      activity_type: "created",
      description: `Upsell lead created (${source})`,
      metadata: { provider_id: providerId },
      performed_by: user.id,
    });

    void writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "admin.terminal_upsell_lead.create",
      entity_type: "terminal_upsell_lead",
      entity_id: lead.id,
      module: "commercial",
      risk_level: "low",
      retention_tier: "routine",
      metadata: { provider_id: providerId, source },
      ...extractRequestMeta(request),
    });

    return successResponse({ lead, created: true });
  } catch (error) {
    return handleApiError(error, "Failed to create terminal upsell lead");
  }
}
