/**
 * Thin wrapper around sendTemplateNotification with must-deliver failure logging.
 */
import {
  sendTemplateNotification,
  type NotificationChannel,
  type SendNotificationResult,
  type SendTemplateOptions,
} from "./onesignal";
import { isMustDeliverPushTemplate } from "./must-deliver-push";

export async function dispatchTemplateNotification(
  templateKey: string,
  userIds: string[],
  variables: Record<string, string> = {},
  channels: readonly (string | NotificationChannel)[] = ["push", "email", "sms"],
  options?: SendTemplateOptions,
): Promise<SendNotificationResult> {
  const result = await sendTemplateNotification(templateKey, userIds, variables, channels, options);
  if (!result.success && isMustDeliverPushTemplate(templateKey)) {
    console.warn("[notification-service] must-deliver notification failed to send", {
      templateKey,
      error: result.error,
      recipientCount: userIds.length,
      appType: options?.appType,
    });
  }
  return result;
}

/** Attach tenant_id for template resolution (tenant override before global fallback). */
export function withTenantVariable(
  tenantId: string | null | undefined,
  variables: Record<string, string>,
): Record<string, string> {
  if (tenantId) return { ...variables, tenant_id: String(tenantId) };
  return variables;
}
