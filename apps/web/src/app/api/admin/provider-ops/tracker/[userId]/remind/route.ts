import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  errorResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDER_OPS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { getUserRowIfAccessibleToAdminTenant } from "@/lib/tenant/admin-user-tenant-access";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";
import {
  resolveTwilioCredentials,
  sendTwilioSMS,
  sendTwilioWhatsApp,
} from "@/lib/integrations/twilio";
import { leadIsDoNotContact, phoneIsDoNotContact } from "@/lib/provider-ops/do-not-contact";
import { appendTrackerAdminNote } from "@/lib/provider-ops/append-tracker-note";

type RemindChannel = "sms" | "whatsapp";

function defaultRemindMessage(name: string, stepName?: string | null): string {
  const stepHint = stepName ? ` (currently on ${stepName})` : "";
  return (
    `Hi ${name}, we noticed you haven't completed your Beautonomi provider onboarding${stepHint}. ` +
    `Our team is here to help — reply to this message or open the app to continue.`
  );
}

/**
 * POST /api/admin/provider-ops/tracker/[userId]/remind
 * Send an onboarding reminder via SMS or WhatsApp, respecting DNC, and log a tracker note.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_PROVIDER_OPS, request);
    const { userId } = await params;
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const body = await request.json();

    const channel = (body.channel as RemindChannel) || "sms";
    if (channel !== "sms" && channel !== "whatsapp") {
      return errorResponse("channel must be sms or whatsapp", "VALIDATION_ERROR", 400);
    }

    const targetUser = await getUserRowIfAccessibleToAdminTenant(supabase, tenantId, userId);
    if (!targetUser) {
      const { notFoundResponse } = await import("@/lib/supabase/api-helpers");
      return notFoundResponse("User not found in this tenant");
    }

    const phone = (targetUser.phone as string | null | undefined)?.trim();
    if (!phone) {
      return errorResponse("User has no phone number on file", "VALIDATION_ERROR", 400);
    }

    const [{ data: tracking }, { data: draft }] = await Promise.all([
      supabase
        .from("provider_onboarding_tracking")
        .select("lead_id")
        .eq("user_id", userId)
        .eq("tenant_id", tenantId)
        .maybeSingle(),
      supabase
        .from("provider_onboarding_drafts")
        .select("current_step")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

    if (tracking?.lead_id) {
      const { data: leadRow } = await supabase
        .from("provider_leads")
        .select("do_not_contact")
        .eq("id", tracking.lead_id)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (leadIsDoNotContact(leadRow as { do_not_contact?: boolean } | null)) {
        return errorResponse("Linked lead is marked do-not-contact", "DO_NOT_CONTACT", 403);
      }
    } else if (await phoneIsDoNotContact(supabase, tenantId, phone)) {
      return errorResponse("Phone number is marked do-not-contact", "DO_NOT_CONTACT", 403);
    }

    const creds = await resolveTwilioCredentials(supabase, tenantId);
    if (!creds) {
      return errorResponse(
        "Twilio not configured. Add Twilio credentials in Admin Settings → Integrations → Twilio.",
        "CONFIGURATION_ERROR",
        503
      );
    }
    if (channel === "sms" && !creds.smsFrom) {
      return errorResponse("Twilio SMS not configured", "CONFIGURATION_ERROR", 503);
    }
    if (channel === "whatsapp" && !creds.whatsappFrom) {
      return errorResponse("Twilio WhatsApp not configured", "CONFIGURATION_ERROR", 503);
    }

    const name =
      (targetUser.full_name as string | null | undefined)?.trim() ||
      (targetUser.email as string | null | undefined)?.split("@")[0] ||
      "Provider";
    const stepNames: Record<number, string> = {
      1: "Team Size",
      2: "Identity + Phone OTP",
      3: "Business Details",
      4: "Payment Setup",
      5: "Current Software",
      6: "Payroll",
      7: "Location",
      8: "Photos",
      9: "Service Zones",
      10: "Categories",
      11: "Services",
      12: "Operating Hours",
      13: "Review",
      14: "Plan Selection",
    };
    const currentStep = Number(draft?.current_step ?? 0);
    const stepName = currentStep > 0 ? stepNames[currentStep] ?? null : null;
    const messageBody =
      typeof body.body === "string" && body.body.trim()
        ? body.body.trim()
        : defaultRemindMessage(name, stepName);

    const twilioData =
      channel === "whatsapp"
        ? await sendTwilioWhatsApp(creds, phone, messageBody)
        : await sendTwilioSMS(creds, phone, messageBody);

    const whatsappTo = phone.startsWith("whatsapp:") ? phone : `whatsapp:${phone}`;
    const whatsappFrom = creds.whatsappFrom?.startsWith("whatsapp:")
      ? creds.whatsappFrom
      : creds.whatsappFrom
        ? `whatsapp:${creds.whatsappFrom}`
        : null;

    const { data: providerRow } = await supabase
      .from("providers")
      .select("id")
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    await supabase.from("provider_lead_communications").insert({
      tenant_id: tenantId,
      lead_id: tracking?.lead_id || null,
      provider_id: providerRow?.id || null,
      user_id: userId,
      channel,
      direction: "outbound",
      from_number: channel === "whatsapp" ? whatsappFrom : creds.smsFrom,
      to_number: channel === "whatsapp" ? whatsappTo : phone,
      body: messageBody,
      external_message_id: (twilioData.sid as string) || null,
      status: (twilioData.status as string) || "sent",
      metadata: { twilio_response: twilioData, trigger: "tracker_remind" },
      sent_by: user.id,
    });

    if (tracking?.lead_id) {
      await supabase.from("provider_lead_activities").insert({
        lead_id: tracking.lead_id,
        activity_type: channel === "whatsapp" ? "whatsapp_sent" : "sms_sent",
        description: `Onboarding reminder sent via ${channel} to ${phone}`,
        metadata: { message_sid: twilioData.sid, to: phone, trigger: "tracker_remind" },
        performed_by: user.id,
      });
    }

    const adminName = user.full_name || user.email || "Admin";
    const trackerNote = await appendTrackerAdminNote(supabase, {
      tenantId,
      userId,
      adminName,
      note: `Sent ${channel.toUpperCase()} onboarding reminder to ${phone}`,
    });

    void writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "admin.tracker.remind",
      entity_type: "provider_onboarding_tracking",
      entity_id: userId,
      module: "provider_ops",
      risk_level: "medium",
      retention_tier: "routine",
      metadata: { channel, to: phone, message_sid: twilioData.sid },
      ...extractRequestMeta(request),
    });

    return successResponse({
      channel,
      message_sid: twilioData.sid,
      status: twilioData.status,
      note: trackerNote,
    });
  } catch (error) {
    return handleApiError(error, "Failed to send reminder");
  }
}
