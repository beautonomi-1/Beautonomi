import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getNotificationTemplate,
  sendTemplateNotification,
} from "@/lib/notifications/onesignal";
import type { OneSignalAppType } from "@/lib/platform/secrets";
import {
  getTemplateTranslationRows,
  resolveLocalizedTemplateCopy,
} from "@/lib/notifications/template-translations";
import { finalizeTemplateEmailHtml } from "@/lib/email/beautonomi-transactional-layout";
import { sendResendEmail } from "@/lib/integrations/resend";
import {
  SECURITY_NOTIFICATION_FALLBACKS,
  type SecurityNotificationTemplateKey,
} from "@/lib/notifications/security-notification-copy";

export {
  SECURITY_NOTIFICATION_TEMPLATE_KEYS,
  SECURITY_NOTIFICATION_FALLBACKS,
  isSecurityNotificationTemplateKey,
  type SecurityNotificationTemplateKey,
} from "@/lib/notifications/security-notification-copy";

export type SecurityAlertInput = {
  key: SecurityNotificationTemplateKey;
  userId: string;
  tenantId?: string | null;
  variables?: Record<string, string>;
  /** Idempotency key; a second send with the same id is skipped. */
  eventId?: string;
  appType?: OneSignalAppType;
  channels?: readonly ("push" | "email")[];
};

export type SecurityAlertResult = {
  sent: boolean;
  deduped?: boolean;
  error?: string;
};

function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://beautonomi.com").replace(/\/$/, "");
}

function withDefaultVariables(variables: Record<string, string> | undefined): Record<string, string> {
  return { app_url: appBaseUrl(), ...(variables ?? {}) };
}

function fallbackFor(key: string) {
  return (
    SECURITY_NOTIFICATION_FALLBACKS[key] ?? {
      title: "Security alert",
      body: "There was a security update on your Beautonomi account.",
      url: "/account-settings/login-and-security",
    }
  );
}

/** Returns false when this event id was already recorded (duplicate send). */
async function claimSecurityEvent(userId: string, key: string, eventId: string): Promise<boolean> {
  const { error } = await getSupabaseAdmin()
    .from("user_security_events" as never)
    .insert({ user_id: userId, event_type: key, event_id: eventId } as never);
  if (!error) return true;
  if ((error as { code?: string }).code === "23505") return false;
  // Table missing / transient: prefer delivering a possible duplicate over dropping an alert.
  return true;
}

/**
 * Must-deliver security alert (push + email by default). Never throws: security alerts
 * must not break the business action that triggered them.
 */
export async function sendSecurityAlert(input: SecurityAlertInput): Promise<SecurityAlertResult> {
  try {
    if (input.eventId) {
      const claimed = await claimSecurityEvent(input.userId, input.key, input.eventId);
      if (!claimed) return { sent: false, deduped: true };
    }
    const fallback = fallbackFor(input.key);
    const result = await sendTemplateNotification(
      input.key,
      [input.userId],
      withDefaultVariables(input.variables),
      input.channels ?? ["push", "email"],
      {
        appType: input.appType ?? "provider",
        tenantId: input.tenantId ?? undefined,
        fallbackTitle: fallback.title,
        fallbackBody: fallback.body,
        fallbackUrl: fallback.url,
      },
    );
    return { sent: result.success, error: result.success ? undefined : result.error ?? result.message };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[security-notifications] alert failed", { key: input.key, message });
    return { sent: false, error: message };
  }
}

/**
 * Immediate transactional email (verification codes). Bypasses the notification queue so the
 * code arrives within seconds. Throws when the email can't be sent so the caller can tell the user.
 */
export async function sendSecurityMessageNow(input: {
  key: SecurityNotificationTemplateKey;
  userId: string;
  tenantId?: string | null;
  variables?: Record<string, string>;
}): Promise<{ sent: true; email: string }> {
  const admin = getSupabaseAdmin();
  const variables = withDefaultVariables(input.variables);

  const { data: userRow } = await admin
    .from("users")
    .select("email, preferred_language")
    .eq("id", input.userId)
    .maybeSingle();
  let email = deliverableEmail((userRow as { email?: string | null } | null)?.email);
  if (!email) {
    const { data } = await admin.auth.admin.getUserById(input.userId);
    email = deliverableEmail(data.user?.email);
  }
  if (!email) {
    throw Object.assign(new Error("No email address on file for this account."), {
      status: 422,
      code: "NO_EMAIL_ON_FILE",
    });
  }

  const fallback = fallbackFor(input.key);
  const template = await getNotificationTemplate(input.key, admin, input.tenantId ?? null);
  const base = {
    title: String(template?.title ?? fallback.title),
    body: String(template?.body ?? fallback.body),
    emailSubject: String(template?.email_subject ?? template?.title ?? fallback.title),
    emailBody: String(template?.email_body ?? `<p>${template?.body ?? fallback.body}</p>`),
    smsBody: String(template?.sms_body ?? ""),
  };
  const language =
    (userRow as { preferred_language?: string | null } | null)?.preferred_language || "en";
  const translations = await getTemplateTranslationRows(admin, input.key, [language]).catch(
    () => new Map(),
  );
  const copy = resolveLocalizedTemplateCopy(base, translations, language, variables);
  const { html, text } = finalizeTemplateEmailHtml({
    emailBody: copy.emailBody,
    emailSubject: copy.emailSubject,
  });

  await sendResendEmail({
    supabase: admin,
    tenantId: input.tenantId ?? null,
    to: email,
    subject: copy.emailSubject,
    html,
    text,
  });
  return { sent: true, email };
}

/** Real inbox address, or "" for missing / phone-signup placeholder (`<id>@phone.local`) emails. */
export function deliverableEmail(email: string | null | undefined): string {
  const e = email?.trim() ?? "";
  if (!e || e.toLowerCase().endsWith("@phone.local")) return "";
  return e;
}

/** "j***@example.com" for showing where a code was sent. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "your email";
  const head = local.slice(0, 1);
  return `${head}${"*".repeat(Math.max(2, Math.min(local.length - 1, 6)))}@${domain}`;
}
