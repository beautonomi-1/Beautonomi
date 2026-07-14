import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
  notFoundResponse,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDER_OPS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";
import {
  isPhoneLookupCacheFresh,
  lookupPhone,
  resolveTwilioCredentials,
} from "@/lib/integrations/twilio";

/**
 * POST /api/admin/provider-ops/leads/[id]/lookup
 * Validate lead phone via Twilio Lookup v2; cache result on the lead row.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_PROVIDER_OPS, request);
    const { id } = await params;
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    const { data: lead } = await supabase
      .from("provider_leads")
      .select(
        "id, phone_e164, phone_lookup_status, phone_line_type, phone_lookup_at, deleted_at",
      )
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (!lead || lead.deleted_at) {
      return notFoundResponse("Lead not found");
    }

    if (!lead.phone_e164?.trim()) {
      return errorResponse("Lead has no phone number to validate", "VALIDATION_ERROR", 400);
    }

    if (
      isPhoneLookupCacheFresh(lead.phone_lookup_at) &&
      lead.phone_lookup_status
    ) {
      return successResponse({
        cached: true,
        phone_e164: lead.phone_e164,
        phone_lookup_status: lead.phone_lookup_status,
        phone_line_type: lead.phone_line_type,
        phone_lookup_at: lead.phone_lookup_at,
      });
    }

    const creds = await resolveTwilioCredentials(supabase, tenantId);
    if (!creds) {
      return errorResponse(
        "Twilio not configured. Add Twilio credentials in Admin Settings → Integrations → Twilio.",
        "CONFIGURATION_ERROR",
        503,
      );
    }

    let lookup;
    try {
      lookup = await lookupPhone(creds, lead.phone_e164);
    } catch (lookupErr) {
      console.error("[leads/lookup] Twilio Lookup error:", lookupErr);
      const now = new Date().toISOString();
      const { data: updated, error } = await supabase
        .from("provider_leads")
        .update({
          phone_lookup_status: "unknown",
          phone_line_type: null,
          phone_lookup_at: now,
        })
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .select("phone_e164, phone_lookup_status, phone_line_type, phone_lookup_at")
        .single();
      if (error) throw error;

      return successResponse({
        cached: false,
        phone_e164: updated.phone_e164,
        phone_lookup_status: updated.phone_lookup_status,
        phone_line_type: updated.phone_line_type,
        phone_lookup_at: updated.phone_lookup_at,
      });
    }

    const now = new Date().toISOString();
    const { data: updated, error } = await supabase
      .from("provider_leads")
      .update({
        phone_lookup_status: lookup.status,
        phone_line_type: lookup.lineType,
        phone_lookup_at: now,
      })
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select("phone_e164, phone_lookup_status, phone_line_type, phone_lookup_at")
      .single();
    if (error) throw error;

    void writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "admin.lead.phone_lookup",
      entity_type: "provider_lead",
      entity_id: id,
      module: "provider_ops",
      risk_level: "low",
      retention_tier: "routine",
      metadata: {
        phone_lookup_status: lookup.status,
        phone_line_type: lookup.lineType,
      },
      ...extractRequestMeta(request),
    });

    return successResponse({
      cached: false,
      phone_e164: updated.phone_e164,
      phone_lookup_status: updated.phone_lookup_status,
      phone_line_type: updated.phone_line_type,
      phone_lookup_at: updated.phone_lookup_at,
    });
  } catch (error) {
    return handleApiError(error, "Failed to validate phone number");
  }
}
