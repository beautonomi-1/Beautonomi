import { requireProviderOpsSales } from "@/lib/provider-ops/ops-route-auth";
import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  errorResponse,
  handleApiError,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";
import { resolveResendCredentials, sendResendEmail } from "@/lib/integrations/resend";
import { leadIsDoNotContact } from "@/lib/provider-ops/do-not-contact";
import { stampFirstContactedAtForLead } from "@/lib/provider-ops/ops-case";

/**
 * POST /api/admin/provider-ops/leads/[id]/comms/email
 * Send a one-off outbound email to a lead via Resend (not a full inbox).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireProviderOpsSales(request);
    const { id: leadId } = await params;
    const tenantId = await resolveAdminApiTenantId(request);
    const body = await request.json();
    const subject = typeof body.subject === "string" ? body.subject.trim() : "";
    const messageBody = typeof body.body === "string" ? body.body.trim() : "";

    if (!subject || !messageBody) {
      return errorResponse("subject and body are required", "VALIDATION_ERROR", 400);
    }

    const supabase = getSupabaseAdmin();
    const { data: lead, error: leadErr } = await supabase
      .from("provider_leads")
      .select("id, email, contact_person_name, business_name, do_not_contact")
      .eq("id", leadId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (leadErr) throw leadErr;
    if (!lead) return notFoundResponse("Lead not found");
    if (leadIsDoNotContact(lead as { do_not_contact?: boolean })) {
      return errorResponse("Lead is marked do-not-contact", "DO_NOT_CONTACT", 403);
    }

    const to = (lead.email as string | null)?.trim();
    if (!to) {
      return errorResponse("Lead has no email address", "VALIDATION_ERROR", 400);
    }

    const creds = await resolveResendCredentials(supabase, tenantId);
    if (!creds) {
      return errorResponse(
        "Email provider not configured (add a Resend API key in Admin Settings → Integrations).",
        "CONFIGURATION_ERROR",
        503,
      );
    }

    const html = messageBody.includes("<")
      ? messageBody
      : `<p style="white-space:pre-wrap;font-family:sans-serif;">${messageBody.replace(/</g, "&lt;")}</p>`;

    await sendResendEmail({
      supabase,
      tenantId,
      to,
      subject,
      html,
      text: messageBody,
    });

    await supabase.from("provider_lead_communications").insert({
      tenant_id: tenantId,
      lead_id: leadId,
      channel: "email",
      direction: "outbound",
      from_number: creds.fromAddress,
      to_number: to,
      subject,
      body: messageBody,
      status: "sent",
      metadata: { kind: "manual_compose" },
      sent_by: user.id,
    });

    await supabase.from("provider_lead_activities").insert({
      lead_id: leadId,
      activity_type: "email_sent",
      description: `Email sent to ${to}`,
      metadata: { subject },
      performed_by: user.id,
    });

    await stampFirstContactedAtForLead(supabase, tenantId, leadId);

    void writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "admin.provider_ops.email_sent",
      entity_type: "provider_lead",
      entity_id: leadId,
      module: "provider_ops",
      risk_level: "medium",
      retention_tier: "routine",
      metadata: { to, subject },
      ...extractRequestMeta(request),
    });

    return successResponse({ sent_to: to, subject });
  } catch (error) {
    return handleApiError(error, "Failed to send email");
  }
}
