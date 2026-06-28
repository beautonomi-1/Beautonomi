import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveResendCredentials, sendResendEmail } from "@/lib/integrations/resend";
import { resolveTwilioCredentials, sendTwilioSMS } from "@/lib/integrations/twilio";
import { resolveProviderAppLinks, type ProviderAppLinks } from "./resolve-provider-app-links";

export type InviteChannel = "email" | "sms";

export interface OnboardingInviteLead {
  id: string;
  email?: string | null;
  phone_e164?: string | null;
  contact_person_name?: string | null;
  business_name?: string | null;
}

export interface OnboardingInviteResult {
  channel: InviteChannel;
  sent_to: string;
  invite_link: string;
  app_links: ProviderAppLinks;
  /** Whether the message was actually dispatched to the provider. */
  delivered: boolean;
  /** Human-readable reason when `delivered` is false (e.g. provider not configured). */
  delivery_error: string | null;
  external_message_id: string | null;
}

function firstName(lead: OnboardingInviteLead): string {
  const full = (lead.contact_person_name || lead.business_name || "").trim();
  if (!full) return "there";
  return full.split(/\s+/)[0];
}

function appLinkLines(links: ProviderAppLinks): string[] {
  const lines: string[] = [];
  if (links.ios) lines.push(`• iPhone (App Store): ${links.ios}`);
  if (links.android) lines.push(`• Android (Google Play): ${links.android}`);
  if (links.huawei) lines.push(`• Huawei (AppGallery): ${links.huawei}`);
  return lines;
}

function buildSmsBody(lead: OnboardingInviteLead, inviteLink: string, links: ProviderAppLinks): string {
  const parts = [
    `Hi ${firstName(lead)}, welcome to Beautonomi! Finish setting up your business here: ${inviteLink}`,
  ];
  if (links.ios || links.android) {
    const store = links.android || links.ios;
    parts.push(`Then get the Provider app: ${store}`);
  }
  return parts.join("\n\n");
}

function buildEmail(
  lead: OnboardingInviteLead,
  inviteLink: string,
  links: ProviderAppLinks,
): { subject: string; html: string; text: string } {
  const name = firstName(lead);
  const appButtons = appLinkLines(links);

  const subject = "Finish setting up your Beautonomi business";

  const text = [
    `Hi ${name},`,
    "",
    "Welcome to Beautonomi! You're almost ready to start taking bookings.",
    "",
    `1. Complete your onboarding: ${inviteLink}`,
    "",
    ...(appButtons.length
      ? ["2. Download the Provider app to manage bookings on the go:", ...appButtons]
      : []),
    "",
    "If you have any questions, just reply to this email and our team will help.",
    "",
    "— The Beautonomi Team",
  ].join("\n");

  const appButtonsHtml = appButtons.length
    ? `<p style="margin:24px 0 8px;font-weight:600;color:#111827;">2. Download the Provider app</p>
       <p style="margin:0 0 4px;color:#4b5563;">Manage bookings, clients and payments on the go.</p>
       <ul style="margin:8px 0;padding-left:18px;color:#2563eb;">
         ${links.ios ? `<li><a href="${links.ios}" style="color:#2563eb;">iPhone — App Store</a></li>` : ""}
         ${links.android ? `<li><a href="${links.android}" style="color:#2563eb;">Android — Google Play</a></li>` : ""}
         ${links.huawei ? `<li><a href="${links.huawei}" style="color:#2563eb;">Huawei — AppGallery</a></li>` : ""}
       </ul>`
    : "";

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111827;">
    <h1 style="font-size:20px;margin:0 0 16px;">Welcome to Beautonomi, ${name}!</h1>
    <p style="margin:0 0 16px;color:#4b5563;">You're almost ready to start taking bookings. Just two quick steps:</p>
    <p style="margin:0 0 8px;font-weight:600;">1. Complete your onboarding</p>
    <p style="margin:0 0 16px;">
      <a href="${inviteLink}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;">Finish setup</a>
    </p>
    <p style="margin:0 0 16px;font-size:12px;color:#6b7280;">Or paste this link into your browser:<br/><span style="word-break:break-all;">${inviteLink}</span></p>
    ${appButtonsHtml}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
    <p style="margin:0;color:#6b7280;font-size:13px;">Questions? Just reply to this email and our team will help.</p>
    <p style="margin:8px 0 0;color:#6b7280;font-size:13px;">— The Beautonomi Team</p>
  </div>`;

  return { subject, html, text };
}

/**
 * Deliver a provider onboarding invite (onboarding link + native-app download
 * links) over the requested channel, and log the communication + lead activity.
 *
 * Delivery is best-effort and never throws: when the email/SMS provider is not
 * configured (or a send fails), the function returns the link with
 * `delivered: false` and a `delivery_error` reason so the admin can copy and
 * send it manually. Either outcome is logged to the lead communication +
 * activity timelines.
 */
export async function sendOnboardingInvite(params: {
  supabase: SupabaseClient;
  tenantId: string;
  lead: OnboardingInviteLead;
  inviteLink: string;
  channel: InviteChannel;
  performedBy: string;
}): Promise<OnboardingInviteResult> {
  const { supabase, tenantId, lead, inviteLink, channel, performedBy } = params;

  const appLinks = await resolveProviderAppLinks(supabase, tenantId);

  const sentTo =
    channel === "email" ? (lead.email ?? "").trim() : (lead.phone_e164 ?? "").trim();

  const result: OnboardingInviteResult = {
    channel,
    sent_to: sentTo,
    invite_link: inviteLink,
    app_links: appLinks,
    delivered: false,
    delivery_error: null,
    external_message_id: null,
  };

  // Precompute the message content up front so it is always available for the
  // communication log, even if credential resolution or sending throws.
  const email = channel === "email" ? buildEmail(lead, inviteLink, appLinks) : null;
  const subject: string | null = email?.subject ?? null;
  const body = email ? email.text : buildSmsBody(lead, inviteLink, appLinks);

  let fromAddress: string | null = null;

  try {
    if (channel === "email" && email) {
      const creds = await resolveResendCredentials(supabase, tenantId);
      if (!creds) {
        result.delivery_error =
          "Email provider not configured (add a Resend API key in Admin Settings → Integrations).";
      } else {
        await sendResendEmail({
          supabase,
          tenantId,
          to: sentTo,
          subject: email.subject,
          html: email.html,
          text: email.text,
        });
        fromAddress = creds.fromAddress;
        result.delivered = true;
      }
    } else {
      const creds = await resolveTwilioCredentials(supabase, tenantId);
      if (!creds || !creds.smsFrom) {
        result.delivery_error =
          "SMS provider not configured (add Twilio credentials in Admin Settings → Integrations).";
      } else {
        const twilioData = await sendTwilioSMS(creds, sentTo, body);
        fromAddress = creds.smsFrom;
        result.external_message_id = (twilioData.sid as string) || null;
        result.delivered = true;
      }
    }
  } catch (err) {
    result.delivery_error = err instanceof Error ? err.message : "Failed to deliver invite";
  }

  // Log communication (attempted or delivered) so it shows in the lead timeline.
  await supabase.from("provider_lead_communications").insert({
    tenant_id: tenantId,
    lead_id: lead.id,
    channel,
    direction: "outbound",
    from_number: fromAddress,
    to_number: sentTo,
    subject,
    body,
    external_message_id: result.external_message_id,
    status: result.delivered ? "sent" : "failed",
    metadata: {
      kind: "onboarding_invite",
      invite_link: inviteLink,
      app_links: appLinks,
      delivered: result.delivered,
      delivery_error: result.delivery_error,
    },
    sent_by: performedBy,
  });

  await supabase.from("provider_lead_activities").insert({
    lead_id: lead.id,
    activity_type: result.delivered
      ? channel === "email"
        ? "email_sent"
        : "sms_sent"
      : "note",
    description: result.delivered
      ? `Onboarding invite sent via ${channel} to ${sentTo}`
      : `Onboarding invite link generated (auto-send via ${channel} unavailable)`,
    metadata: {
      kind: "onboarding_invite",
      channel,
      sent_to: sentTo,
      delivered: result.delivered,
      delivery_error: result.delivery_error,
    },
    performed_by: performedBy,
  });

  return result;
}
