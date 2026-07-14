import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  errorResponse,
  handleApiError,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDER_OPS } from "@beautonomi/admin-access";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";
import { sendOnboardingInvite } from "@/lib/provider-ops/send-onboarding-invite";
import { leadIsDoNotContact } from "@/lib/provider-ops/do-not-contact";
import crypto from "crypto";

function getPublicSiteBaseUrl(request: NextRequest): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  const u = new URL(request.url);
  return `${u.protocol}//${u.host}`;
}

/**
 * POST /api/admin/provider-ops/leads/[id]/invite
 *
 * Generates or reuses an onboarding invite token, stores it on the lead,
 * and returns the invite link for the admin to send via email or SMS.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: adminUser } = await requireAdminSection(
      ADMIN_SECTION_PROVIDER_OPS,
      request
    );
    const { id } = await params;
    const tenantId = await resolveAdminApiTenantId(request);
    const body = await request.json().catch(() => ({}));
    const channel = (body.channel as string) || "email";

    if (channel !== "email" && channel !== "sms") {
      return errorResponse(
        'channel must be "email" or "sms"',
        "VALIDATION_ERROR",
        400
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: lead, error: leadErr } = await supabase
      .from("provider_leads")
      .select("*")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .single();

    if (leadErr || !lead) return notFoundResponse("Lead not found");

    if (leadIsDoNotContact(lead as { do_not_contact?: boolean })) {
      return errorResponse("Lead is marked do-not-contact", "DO_NOT_CONTACT", 403);
    }

    const email = lead.email as string | null | undefined;
    const phone = lead.phone_e164 as string | null | undefined;

    if (channel === "email" && !email?.trim()) {
      return errorResponse(
        "Lead has no email address",
        "VALIDATION_ERROR",
        400
      );
    }
    if (channel === "sms" && !phone?.trim()) {
      return errorResponse(
        "Lead has no phone number",
        "VALIDATION_ERROR",
        400
      );
    }

    const existingToken =
      typeof lead.invite_token === "string" && lead.invite_token.length > 0
        ? lead.invite_token
        : null;
    const inviteToken = existingToken ?? crypto.randomUUID();

    const { error: upErr } = await supabase
      .from("provider_leads")
      .update({
        invite_token: inviteToken,
        invite_sent_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("tenant_id", tenantId);
    if (upErr) throw upErr;

    const baseUrl = getPublicSiteBaseUrl(request);
    const inviteLink = `${baseUrl}/provider/onboarding?invite=${inviteToken}`;

    const delivery = await sendOnboardingInvite({
      supabase,
      tenantId,
      lead: {
        id,
        email: lead.email as string | null,
        phone_e164: lead.phone_e164 as string | null,
        contact_person_name: lead.contact_person_name as string | null,
        business_name: lead.business_name as string | null,
      },
      inviteLink,
      channel,
      performedBy: adminUser.id,
    });

    void writeAuditLog({
      actor_user_id: adminUser.id,
      actor_role: adminUser.role,
      action: "admin.lead.send_invite",
      entity_type: "provider_lead",
      entity_id: id,
      module: "provider_ops",
      risk_level: "medium",
      retention_tier: "operational",
      metadata: {
        channel,
        sent_to: delivery.sent_to,
        reused_token: Boolean(existingToken),
        delivered: delivery.delivered,
      },
      ...extractRequestMeta(request),
    });

    return successResponse({
      data: {
        invite_link: inviteLink,
        sent_to: delivery.sent_to,
        channel: delivery.channel,
        delivered: delivery.delivered,
        delivery_error: delivery.delivery_error,
        app_links: delivery.app_links,
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to send invite");
  }
}
