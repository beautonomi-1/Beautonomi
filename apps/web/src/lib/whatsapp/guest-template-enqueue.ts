import type { SupabaseClient } from "@supabase/supabase-js";
import { enqueueTemplateEmailSmsChannels } from "@/lib/notifications/enqueue-template-channels";
import { buildOrdinalContentVariables, isWhatsAppNotificationsEnabled } from "@/lib/whatsapp/config";
import { isFirstTouchWhatsAppTemplate } from "@/lib/whatsapp/transactional-templates";
import { normalizePhoneToE164 } from "@/lib/phone";

export async function enqueueGuestWhatsAppTemplate(params: {
  supabaseAdmin: SupabaseClient;
  templateKey: string;
  customerId: string;
  bookingId: string;
  tenantId: string | null;
  phone: string;
  variables: Record<string, string>;
  dedupeKey: string;
}): Promise<boolean> {
  const phoneE164 = normalizePhoneToE164(params.phone);
  if (!phoneE164) return false;

  const waEnabled = await isWhatsAppNotificationsEnabled(params.supabaseAdmin, params.tenantId);
  if (!waEnabled) return false;

  let query = params.supabaseAdmin
    .from("notification_templates")
    .select(
      "key, channels, whatsapp_content_sid, whatsapp_template_status, whatsapp_category, whatsapp_body, sms_body, body, whatsapp_content_variables, channel_waterfall",
    )
    .eq("key", params.templateKey)
    .eq("enabled", true);

  if (params.tenantId) {
    query = query.or(`tenant_id.eq.${params.tenantId},tenant_id.is.null`);
  } else {
    query = query.is("tenant_id", null);
  }

  const { data: templates } = await query.limit(5);
  const tpl =
    (templates ?? []).find((t) => (t as { tenant_id?: string | null }).tenant_id === params.tenantId) ??
    (templates ?? []).find((t) => !(t as { tenant_id?: string | null }).tenant_id) ??
    null;
  if (!tpl) return false;

  const channels = (tpl.channels as string[] | null) ?? [];
  if (!channels.includes("whatsapp")) return false;

  const contentSid = String(tpl.whatsapp_content_sid ?? "").trim();
  const waStatus = String(tpl.whatsapp_template_status ?? "unknown");
  const firstTouch = isFirstTouchWhatsAppTemplate(params.templateKey);
  if (["paused", "disabled", "rejected"].includes(waStatus)) return false;
  if (firstTouch && waStatus !== "approved") return false;
  if (firstTouch && !contentSid.startsWith("HX")) return false;

  const waBodyRaw = String(tpl.whatsapp_body ?? tpl.sms_body ?? tpl.body ?? "");
  let waBody = waBodyRaw;
  for (const [key, value] of Object.entries(params.variables)) {
    waBody = waBody.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }

  const contentVars = buildOrdinalContentVariables(
    tpl.whatsapp_content_variables as Array<{ ordinal?: number; var?: string; sample?: string }>,
    params.variables,
  );

  await enqueueTemplateEmailSmsChannels(
    {
      templateKey: params.templateKey,
      recipients: [{ userId: params.customerId, channels: ["whatsapp"] }],
      bookingId: params.bookingId,
      tenantId: params.tenantId,
      title: params.templateKey,
      body: waBody,
      emailSubject: "",
      emailBody: "",
      smsBody: waBody,
      whatsappContentSid: contentSid,
      whatsappContentVariables: contentVars,
      whatsappCategory: String(tpl.whatsapp_category ?? "utility"),
      whatsappBody: waBody,
      whatsappTemplateStatus: waStatus,
      data: { template_key: params.templateKey, to: phoneE164, ...params.variables },
      dedupePrefix: "guest_portal",
    },
    params.supabaseAdmin,
  );

  return true;
}
