import { NextRequest, NextResponse } from "next/server";
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminSection(ADMIN_SECTION_PROVIDER_OPS, request);
    const { id } = await params;
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    const { data: lead, error } = await supabase
      .from("provider_leads")
      .select(
        `
        *,
        provider_lead_categories (
          global_category_id,
          global_service_categories:global_category_id (id, name, slug, icon)
        ),
        provider_lead_activities (
          id, activity_type, description, metadata, performed_by, created_at
        )
      `
      )
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .single();

    if (error) throw error;
    if (!lead) {
      return notFoundResponse("Lead not found");
    }

    return successResponse(lead);
  } catch (error) {
    return handleApiError(error, "Failed to fetch lead");
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAdminSection(
      ADMIN_SECTION_PROVIDER_OPS,
      request
    );
    const { id } = await params;
    const supabase = getSupabaseAdmin();
    const body = await request.json();
    const { expected_updated_at } = body;

    const allowedFields = [
      "lead_name",
      "business_name",
      "contact_person_name",
      "email",
      "phone_country_code",
      "phone_national",
      "phone_e164",
      "suggested_location_text",
      "resolved_location",
      "location_confidence",
      "country",
      "description",
      "notes",
      "tags",
      "is_dormant",
      "lost_reason",
      "onboarding_data",
    ];

    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }
    if (body.email !== undefined) {
      updates.email = body.email?.toLowerCase()?.trim() || null;
    }

    if (Object.keys(updates).length === 0 && !body.category_ids) {
      return errorResponse("No valid fields to update", "VALIDATION_ERROR", 400);
    }

    const tenantId = await resolveAdminApiTenantId(request);

    const { data: beforeRow } = await supabase
      .from("provider_leads")
      .select("updated_at")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (
      expected_updated_at != null &&
      typeof expected_updated_at === "string" &&
      beforeRow &&
      typeof beforeRow.updated_at === "string" &&
      beforeRow.updated_at !== expected_updated_at
    ) {
      return errorResponse(
        "This lead was updated by another teammate. Refresh and try again.",
        "CONCURRENT_UPDATE",
        409
      );
    }

    if (Object.keys(updates).length > 0) {
      const { error } = await supabase
        .from("provider_leads")
        .update(updates)
        .eq("id", id)
        .eq("tenant_id", tenantId);
      if (error) throw error;
    }

    if (body.category_ids !== undefined) {
      const { error: delErr } = await supabase
        .from("provider_lead_categories")
        .delete()
        .eq("lead_id", id);
      if (delErr) throw delErr;
      if (body.category_ids.length > 0) {
        const rows = body.category_ids.map((catId: string) => ({
          lead_id: id,
          global_category_id: catId,
        }));
        const { error: insErr } = await supabase
          .from("provider_lead_categories")
          .insert(rows);
        if (insErr) throw insErr;
      }
    }

    const { error: actErr } = await supabase
      .from("provider_lead_activities")
      .insert({
        lead_id: id,
        activity_type: "lead_updated",
        description: "Lead updated",
        metadata: { updated_fields: Object.keys(updates) },
        performed_by: user.id,
      });
    if (actErr) throw actErr;

    const { data: updated, error: fetchErr } = await supabase
      .from("provider_leads")
      .select("*")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .single();
    if (fetchErr) throw fetchErr;

    void writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "admin.lead.update",
      entity_type: "provider_lead",
      entity_id: id,
      module: "provider_ops",
      risk_level: "medium",
      retention_tier: "operational",
      changed_fields: Object.keys(updates),
      ...extractRequestMeta(request),
    });

    return successResponse(updated);
  } catch (error) {
    return handleApiError(error, "Failed to update lead");
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_PROVIDER_OPS, request);
    const { id } = await params;
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    const { data: lead } = await supabase
      .from("provider_leads")
      .select("id, matched_provider_id")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (!lead) return notFoundResponse("Lead not found");

    if (lead.matched_provider_id) {
      return errorResponse(
        "Cannot delete a lead that is matched to a provider. Unlink it first.",
        "LEAD_MATCHED",
        400
      );
    }

    await supabase.from("provider_lead_activities").delete().eq("lead_id", id);
    await supabase.from("provider_lead_categories").delete().eq("lead_id", id);
    await supabase.from("provider_lead_communications").delete().eq("lead_id", id);
    await supabase.from("provider_lead_tasks").delete().eq("lead_id", id);

    const { error } = await supabase
      .from("provider_leads")
      .delete()
      .eq("id", id)
      .eq("tenant_id", tenantId);
    if (error) throw error;

    void writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "admin.lead.delete",
      entity_type: "provider_lead",
      entity_id: id,
      module: "provider_ops",
      risk_level: "medium",
      retention_tier: "operational",
      ...extractRequestMeta(request),
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error, "Failed to delete lead");
  }
}
