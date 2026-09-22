import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  handleApiError,
  requireAdminSection,
  successResponse,
  errorResponse,
  unauthorizedResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_MARKETING_COMMS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";
import {
  ensureProviderOpsCase,
  syncLeadOwnerFromSalesCase,
} from "@/lib/provider-ops/ops-case";
import { slackNotifyLeadCreatedForTenant } from "@/lib/integrations/slack/lead-triggers";
import { sendOnboardingInvite } from "@/lib/provider-ops/send-onboarding-invite";

/**
 * POST /api/admin/city-waitlist/[id]/promote-lead
 * Create a provider lead from a provider-persona waitlist row and send onboarding invite.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_MARKETING_COMMS, request);
    if (!user) return unauthorizedResponse("Authentication required");

    const { id } = await context.params;
    const tenantId = await resolveAdminApiTenantId(request);
    const supabase = getSupabaseAdmin();

    const { data: row, error: rowErr } = await supabase
      .from("city_waitlist")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (rowErr) throw rowErr;
    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (row.persona !== "provider") {
      return errorResponse("Only provider-persona waitlist rows can be promoted", "VALIDATION_ERROR", 400);
    }
    if (row.lead_id) {
      return errorResponse("Waitlist row already linked to a lead", "ALREADY_PROMOTED", 409);
    }

    const email = typeof row.email === "string" ? row.email.trim().toLowerCase() : null;
    const phone = typeof row.phone === "string" ? row.phone.trim() : null;
    if (!email && !phone) {
      return errorResponse("Waitlist row has no contact email or phone", "VALIDATION_ERROR", 400);
    }

    const businessName = row.name?.trim() || row.city_name?.trim() || "Waitlist provider";
    const locationText = [row.city_name, row.country_code].filter(Boolean).join(", ");

    const { data: lead, error: insertErr } = await supabase
      .from("provider_leads")
      .insert({
        tenant_id: tenantId,
        lead_name: businessName,
        business_name: businessName,
        contact_person_name: row.name?.trim() || null,
        email,
        phone_e164: phone,
        suggested_location_text: locationText || null,
        country: row.country_code?.trim() || null,
        notes: row.notes?.trim() || null,
        commercial_stage: "new",
        source: "form",
        source_detail: `city_waitlist:${row.id}`,
        created_by: user.id,
      })
      .select("*")
      .single();
    if (insertErr) throw insertErr;

    await ensureProviderOpsCase(supabase, {
      tenantId,
      leadId: lead.id as string,
      currentDesk: "sales",
      tryAutoAssign: true,
      actorUserId: user.id,
    });

    const assignedTo = await syncLeadOwnerFromSalesCase(supabase, tenantId, lead.id as string);

    const inviteToken = crypto.randomUUID();
    await supabase
      .from("provider_leads")
      .update({ invite_token: inviteToken, invite_sent_at: new Date().toISOString() })
      .eq("id", lead.id);

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || new URL(request.url).origin;
    const inviteLink = `${baseUrl}/provider/onboarding?invite=${inviteToken}`;

    const delivery = await sendOnboardingInvite({
      supabase,
      tenantId,
      lead: {
        id: lead.id as string,
        email,
        phone_e164: phone,
        contact_person_name: row.name,
        business_name: businessName,
      },
      inviteLink,
      channel: email ? "email" : "sms",
      performedBy: user.id,
    });

    await supabase
      .from("city_waitlist")
      .update({ lead_id: lead.id, updated_at: new Date().toISOString() })
      .eq("id", id);

    await supabase.from("provider_lead_activities").insert({
      lead_id: lead.id,
      activity_type: "lead_created",
      description: "Promoted from market expansion waitlist",
      metadata: { city_waitlist_id: id },
      performed_by: user.id,
    });

    void slackNotifyLeadCreatedForTenant(tenantId, {
      id: lead.id as string,
      business_name: businessName,
      assigned_to: assignedTo,
    });

    void writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "city_waitlist.promote_lead",
      entity_type: "city_waitlist",
      entity_id: id,
      metadata: { lead_id: lead.id, invite_delivered: delivery.delivered },
      ...extractRequestMeta(request),
    });

    return successResponse({
      lead_id: lead.id,
      invite_link: inviteLink,
      delivery,
    });
  } catch (error) {
    return handleApiError(error, "Failed to promote waitlist entry");
  }
}
