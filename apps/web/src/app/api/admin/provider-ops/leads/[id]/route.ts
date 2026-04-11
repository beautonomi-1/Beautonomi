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
    await requireAdminSection(ADMIN_SECTION_PROVIDER_OPS, request);
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

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error, "Failed to delete lead");
  }
}
