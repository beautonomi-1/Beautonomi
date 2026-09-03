/**
 * Opt-out enforcement for marketing automations (`marketing_automations` ->
 * `/api/provider/automations/execute`). Reuses the customer notification
 * preference resolver so a customer who turned off marketing email/SMS/push in
 * account settings (or unsubscribed from marketing) is skipped, with the reason
 * recorded by the caller.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  resolveChannelsPerCustomerRecipient,
  type NotificationChannelName,
} from "@/lib/notifications/customer-notification-channels";

export type AutomationChannel = "email" | "sms" | "whatsapp" | "notification";

/** Trigger types whose messages are service reminders (transactional), not marketing. */
const REMINDER_TRIGGERS = new Set([
  "appointment_reminder",
  "appointment_rescheduled",
  "rescheduled",
  "package_expiring",
]);

/**
 * Map an automation trigger to a template key understood by
 * `templateKeyToPreferenceSection`: reminders fall under the customer's
 * "reminders" section, everything else (birthday, win-back, review requests,
 * seasonal, milestones, referrals, new leads) is marketing -> "inspiration_and_offers".
 */
export function automationTemplateKey(triggerType: string): string {
  return REMINDER_TRIGGERS.has(triggerType) ? "automation_appointment_reminder" : "automation_promo";
}

export function automationChannelToNotificationChannel(channel: AutomationChannel): NotificationChannelName {
  return channel === "notification" ? "push" : channel;
}

export interface OptOutFilterResult<T extends { id: string }> {
  allowed: T[];
  skipped: Array<{ customerId: string; reason: string }>;
}

/**
 * Split recipients into those who allow the automation's channel and those who
 * opted out. Fails open per recipient only when preference lookup throws, so a
 * transient DB error does not silently drop a whole batch.
 */
export async function filterAutomationRecipientsByOptOut<T extends { id: string }>(
  supabase: SupabaseClient,
  recipients: T[],
  params: { triggerType: string; channel: AutomationChannel },
): Promise<OptOutFilterResult<T>> {
  if (recipients.length === 0) return { allowed: [], skipped: [] };

  const notificationChannel = automationChannelToNotificationChannel(params.channel);
  const templateKey = automationTemplateKey(params.triggerType);
  const userIds = recipients.map((r) => r.id);

  let perUser: Map<string, NotificationChannelName[]>;
  try {
    perUser = await resolveChannelsPerCustomerRecipient(supabase, userIds, templateKey, [notificationChannel]);
  } catch (err) {
    console.warn("[automations] preference lookup failed; sending without opt-out filter", err);
    return { allowed: recipients, skipped: [] };
  }

  const allowed: T[] = [];
  const skipped: Array<{ customerId: string; reason: string }> = [];
  for (const recipient of recipients) {
    const channels = perUser.get(recipient.id) ?? [];
    if (channels.includes(notificationChannel)) {
      allowed.push(recipient);
    } else {
      skipped.push({ customerId: recipient.id, reason: `opted_out:${notificationChannel}` });
    }
  }
  return { allowed, skipped };
}
