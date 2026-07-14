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
import {
  LEADS_ASSIGNED_USER_EMBED,
  LEADS_REFERRER_PROVIDER_EMBED,
  LEADS_REFERRER_USER_EMBED,
} from "@/lib/provider-ops/lead-query-filters";

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
        ${LEADS_ASSIGNED_USER_EMBED},
        ${LEADS_REFERRER_USER_EMBED},
        ${LEADS_REFERRER_PROVIDER_EMBED},
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
      "source",
      "source_detail",
      "referrer_user_id",
      "referrer_provider_id",
    ];

    const updates: Record<string, unknown> = {};
    let dncToggle: boolean | undefined;
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }
    if (body.email !== undefined) {
      updates.email = body.email?.toLowerCase()?.trim() || null;
    }

    if (body.do_not_contact !== undefined) {
      if (typeof body.do_not_contact !== "boolean") {
        return errorResponse("do_not_contact must be a boolean", "VALIDATION_ERROR", 400);
      }
      dncToggle = body.do_not_contact;
      updates.do_not_contact = body.do_not_contact;
      if (body.do_not_contact) {
        updates.do_not_contact_at = new Date().toISOString();
        updates.do_not_contact_reason =
          typeof body.do_not_contact_reason === "string" && body.do_not_contact_reason.trim()
            ? body.do_not_contact_reason.trim()
            : "admin";
      } else {
        updates.do_not_contact_at = null;
        updates.do_not_contact_reason = null;
      }
    }

    if (Object.keys(updates).length === 0 && !body.category_ids) {
      return errorResponse("No valid fields to update", "VALIDATION_ERROR", 400);
    }

    const tenantId = await resolveAdminApiTenantId(request);

    const { data: beforeRow } = await supabase
      .from("provider_leads")
      .select("updated_at, deleted_at")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (beforeRow?.deleted_at) {
      return errorResponse("Cannot update a deleted lead. Restore it first.", "LEAD_DELETED", 400);
    }

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
        activity_type:
          dncToggle === true
            ? "do_not_contact_set"
            : dncToggle === false
              ? "do_not_contact_cleared"
              : "lead_updated",
        description:
          dncToggle === true
            ? "Do-not-contact enabled by admin"
            : dncToggle === false
              ? "Do-not-contact cleared by admin"
              : "Lead updated",
        metadata: { updated_fields: Object.keys(updates) },
        performed_by: user.id,
      });
    if (actErr) throw actErr;

    const { data: updated, error: fetchErr } = await supabase
      .from("provider_leads")
      .select(
        `
        *,
        ${LEADS_ASSIGNED_USER_EMBED},
        ${LEADS_REFERRER_USER_EMBED},
        ${LEADS_REFERRER_PROVIDER_EMBED},
        provider_lead_categories (
          global_category_id,
          global_service_categories:global_category_id (id, name, slug, icon)
        )
      `,
      )
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

    const now = new Date().toISOString();
    const { error } = await supabase
      .from("provider_leads")
      .update({ deleted_at: now, deleted_by: user.id })
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .is("deleted_at", null);
    if (error) throw error;

    await supabase.from("provider_lead_activities").insert({
      lead_id: id,
      activity_type: "lead_deleted",
      description: "Lead moved to trash",
      metadata: { soft_delete: true },
      performed_by: user.id,
    });

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
