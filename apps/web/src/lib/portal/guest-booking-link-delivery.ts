import type { SupabaseClient } from "@supabase/supabase-js";
import { enqueueNotification } from "@/lib/notifications/enqueue";
import { createPortalToken, getPortalUrl } from "@/lib/portal/token";
import { isRealCustomerEmail, isShadowEmail } from "@/lib/users/shadow-email";
import { isFeatureEnabledServer } from "@/lib/server/feature-flags";
import { FEATURE_FLAG_KEYS } from "@/lib/server/feature-flag-keys";
import { getGuestLinkDeliverySettings } from "@/lib/platform-settings";

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function mintGuestPortalTokenForBooking(
  supabaseAdmin: SupabaseClient,
  bookingId: string,
  scheduledAt: string,
): Promise<{ token: string; portalUrl: string }> {
  const scheduled = new Date(scheduledAt);
  const expiresAt = new Date(scheduled);
  expiresAt.setDate(expiresAt.getDate() + 30);

  const expiresInDays = Math.max(
    1,
    Math.ceil((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
  );

  const { token } = await createPortalToken(supabaseAdmin, bookingId, {
    expiresInDays,
    maxUses: -1,
  });

  const appBase = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  return { token, portalUrl: getPortalUrl(token, appBase) };
}

export async function deliverGuestBookingLink(params: {
  supabaseAdmin: SupabaseClient;
  bookingId: string;
  bookingNumber: string;
  scheduledAt: string;
  customerId: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  providerName: string;
  tenantId: string | null;
  templateKey?: "guest_booking_link" | "guest_arrival_verification";
}): Promise<void> {
  const {
    supabaseAdmin,
    bookingId,
    bookingNumber,
    scheduledAt,
    customerId,
    customerName,
    customerEmail,
    customerPhone,
    providerName,
    tenantId,
    templateKey = "guest_booking_link",
  } = params;

  if (!(await isFeatureEnabledServer(FEATURE_FLAG_KEYS.GUEST_BOOKING_PORTAL, tenantId))) {
    return;
  }

  const deliverySettings = await getGuestLinkDeliverySettings();
  const { portalUrl } = await mintGuestPortalTokenForBooking(
    supabaseAdmin,
    bookingId,
    scheduledAt,
  );

  const scheduledLabel = new Date(scheduledAt).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const smsBody =
    templateKey === "guest_arrival_verification"
      ? `${providerName} has arrived for booking ${bookingNumber}. View your verification code: ${portalUrl}`
      : `${providerName} booked an appointment for you (${bookingNumber}). View details: ${portalUrl}`;

  const emailSubject =
    templateKey === "guest_arrival_verification"
      ? `${providerName} has arrived – view your verification code`
      : `Your appointment with ${providerName} – ${bookingNumber}`;

  const emailHtml =
    templateKey === "guest_arrival_verification"
      ? `<h2>Your provider has arrived</h2><p><strong>${escapeHtml(providerName)}</strong> has arrived for booking <strong>${escapeHtml(bookingNumber)}</strong>.</p><p><a href="${portalUrl}">View verification code</a></p>`
      : `<h2>Your appointment is confirmed</h2><p>Hi ${escapeHtml(customerName)},</p><p><strong>${escapeHtml(providerName)}</strong> has booked an appointment for you on <strong>${escapeHtml(scheduledLabel)}</strong>.</p><p><a href="${portalUrl}">View booking</a></p>`;

  const dedupeSuffix = templateKey === "guest_arrival_verification" ? ":arrival" : ":create";

  if (
    deliverySettings.guest_link_email_enabled &&
    customerEmail &&
    isRealCustomerEmail(customerEmail)
  ) {
    await enqueueNotification(
      {
        channel: "email",
        templateKey,
        recipientUserId: customerId,
        bookingId,
        payload: {
          to: customerEmail.trim().toLowerCase(),
          subject: emailSubject,
          html: emailHtml,
          body: smsBody,
        },
        dedupeKey: `guest_portal:${templateKey}:email:${bookingId}${dedupeSuffix}`,
        tenantId,
      },
      supabaseAdmin,
    );
  }

  const phone = customerPhone?.trim();
  const emailIsSynthetic = !customerEmail || isShadowEmail(customerEmail);
  if (deliverySettings.guest_link_sms_enabled && phone && (emailIsSynthetic || !deliverySettings.guest_link_email_enabled)) {
    await enqueueNotification(
      {
        channel: "sms",
        templateKey,
        recipientUserId: customerId,
        bookingId,
        payload: {
          to: phone,
          body: smsBody,
          message: smsBody,
        },
        dedupeKey: `guest_portal:${templateKey}:sms:${bookingId}${dedupeSuffix}`,
        tenantId,
      },
      supabaseAdmin,
    );
  }
}

export async function shouldDeliverGuestLinkForCustomer(
  supabaseAdmin: SupabaseClient,
  customerId: string,
): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("users")
    .select("is_shadow, email")
    .eq("id", customerId)
    .maybeSingle();
  if (!data) return false;
  if (data.is_shadow === true) return true;
  return isShadowEmail(data.email as string);
}
