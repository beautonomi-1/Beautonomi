/**
 * User-facing copy when a capability is gated by `subscription_plans.features`.
 * Use keyed messages — never dead SKU names (Professional / Enterprise).
 */

import type { LimitCheckResult } from "./limit-checker";

/** @deprecated Prefer getUpgradeMessage() with a specific key. */
export const SUBSCRIPTION_UPGRADE_SHORT =
  "This feature requires a paid platform plan with the right add-ons. Upgrade under Subscription in provider settings.";

export const ADVANCED_RECURRENCE_UPGRADE =
  "This recurrence pattern needs a plan that includes advanced recurring schedules. Upgrade under Subscription.";

export type UpgradeMessageKey =
  | "reports.advanced"
  | "reports.scale_only"
  | "reports.basic"
  | "marketing.campaigns"
  | "marketing.whatsapp"
  | "marketing.segmentation"
  | "marketing.automations_channel"
  | "marketing.automations"
  | "limits.bookings"
  | "limits.chat"
  | "limits.campaigns"
  | "limits.campaign_recipients"
  | "limits.express_links"
  | "limits.staff"
  | "limits.locations"
  | "limits.automations"
  | "limits.yoco_devices"
  | "limits.paycloud_terminals"
  | "limits.paystack_terminals"
  | "staff.sms"
  | "integrations.custom"
  | "integrations.calendar"
  | "integrations.yoco"
  | "integrations.paycloud"
  | "integrations.paystack_terminal"
  | "express.feature"
  | "recurring.feature";

const UPGRADE_MESSAGES: Record<UpgradeMessageKey, string> = {
  "reports.advanced":
    "Staff, products, payments and memberships reports are included on Growth and Scale. Upgrade to unlock advanced analytics.",
  "reports.scale_only":
    "Gift card and package reports are included on Scale. Upgrade to unlock the full report suite.",
  "reports.basic":
    "This report is not included in your current plan. Upgrade under Subscription to unlock more reports.",
  "marketing.campaigns":
    "Email and SMS campaigns are included on Growth and Scale. Upgrade to reach clients with campaigns.",
  "marketing.whatsapp":
    "WhatsApp campaigns are included on Scale when your Twilio number is connected. Upgrade to unlock WhatsApp.",
  "marketing.segmentation":
    "Audience segments are included on Growth and Scale. Upgrade to send campaigns to a filtered audience.",
  "marketing.automations_channel":
    "Push and in-app automations are included on Starter. Email and SMS automations need Growth or Scale.",
  "marketing.automations":
    "Marketing automations require a plan that includes this feature. Upgrade under Subscription.",
  "limits.bookings":
    "You've reached your monthly online booking limit on your current plan. Upgrade for unlimited bookings.",
  "limits.chat":
    "You've reached your monthly client-chat message limit. Upgrade to Growth (8,000 messages) or Scale (unlimited) to keep messaging clients.",
  "limits.campaigns":
    "You've reached your monthly campaign limit on your current plan. Upgrade to send more campaigns.",
  "limits.campaign_recipients":
    "This campaign has more recipients than your current plan allows. Upgrade to reach more clients.",
  "limits.express_links":
    "You've reached your express booking link limit on your current plan. Upgrade for more links.",
  "limits.staff":
    "You've reached your team member limit on your current plan. Upgrade to add more staff.",
  "limits.locations":
    "You've reached your location limit on your current plan. Upgrade to add more locations.",
  "limits.automations":
    "You've reached your automation limit on your current plan. Upgrade to create more automations.",
  "limits.yoco_devices":
    "You've reached your Yoco device limit on your current plan. Upgrade to connect more devices.",
  "limits.paycloud_terminals":
    "You've reached your card machine limit on your current plan. Upgrade to add more terminals.",
  "limits.paystack_terminals":
    "You've reached your Paystack Terminal limit on your current plan. Upgrade to add more terminals.",
  "staff.sms":
    "Staff SMS notifications are included on Growth and Scale. Upgrade to enable SMS for your team.",
  "integrations.custom":
    "Bring-your-own SendGrid and Twilio is included on Scale. Upgrade to connect your accounts.",
  "integrations.calendar":
    "Calendar sync is not enabled on this account. Open Subscription to review your plan.",
  "integrations.yoco":
    "Yoco in-person payments require a plan that includes Yoco. Upgrade under Subscription.",
  "integrations.paycloud":
    "In-person card machines require a plan that includes PayCloud. Upgrade under Subscription.",
  "integrations.paystack_terminal":
    "Paystack Terminal requires a plan that includes virtual terminals. Upgrade under Subscription.",
  "express.feature":
    "Express booking links are not included on this plan. Upgrade under Subscription to unlock them.",
  "recurring.feature":
    "Recurring appointments require a plan that includes this feature. Upgrade under Subscription.",
};

export function getUpgradeMessage(key: UpgradeMessageKey): string {
  return UPGRADE_MESSAGES[key];
}

export function campaignChannelUpgradeMessage(type: "email" | "sms" | "whatsapp"): string {
  return type === "whatsapp"
    ? getUpgradeMessage("marketing.whatsapp")
    : getUpgradeMessage("marketing.campaigns");
}

/** Plan-gate API error codes that should show View plans in provider UI. */
export const PLAN_GATE_ERROR_CODES = [
  "SUBSCRIPTION_REQUIRED",
  "LIMIT_REACHED",
  "SUBSCRIPTION_LIMIT_EXCEEDED",
  "TERMINAL_LIMIT_REACHED",
] as const;

export type PlanGateErrorCode = (typeof PLAN_GATE_ERROR_CODES)[number];

export function isPlanGateErrorCode(code: string | null | undefined): code is PlanGateErrorCode {
  if (!code) return false;
  return (PLAN_GATE_ERROR_CODES as readonly string[]).includes(code);
}

function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

function chatUpgradeHint(limit: number): string {
  if (limit <= 2000) {
    return "Upgrade to Growth (8,000 messages) or Scale (unlimited) to keep messaging clients.";
  }
  if (limit <= 8000) {
    return "Upgrade to Scale for unlimited client chat.";
  }
  return "Upgrade under Subscription for a higher message allowance.";
}

/**
 * Build a specific chat limit message using counts from the limit check.
 */
export function formatChatLimitUpgradeMessage(limitCheck: LimitCheckResult): string {
  const limit = limitCheck.limitValue;
  const used = limitCheck.currentCount;
  const plan = limitCheck.planName?.trim();

  if (limit != null && used >= limit) {
    const base = `You've used ${formatCount(used)} of ${formatCount(limit)} client-chat messages this month`;
    const planPart = plan ? ` on ${plan}` : "";
    return `${base}${planPart}. ${chatUpgradeHint(limit)}`;
  }

  return getUpgradeMessage("limits.chat");
}

/**
 * Enrich generic limit RPC text with catalog hints when we know the limit type.
 */
export function formatLimitUpgradeMessage(
  limitCheck: LimitCheckResult,
  kind:
    | "bookings"
    | "chat"
    | "staff"
    | "locations"
    | "express_links"
    | "automations"
    | "yoco_devices"
    | "paycloud_terminals"
    | "paystack_terminals",
): string {
  if (kind === "chat") {
    return formatChatLimitUpgradeMessage(limitCheck);
  }

  const keyMap: Record<Exclude<typeof kind, "chat">, UpgradeMessageKey> = {
    bookings: "limits.bookings",
    staff: "limits.staff",
    locations: "limits.locations",
    express_links: "limits.express_links",
    automations: "limits.automations",
    yoco_devices: "limits.yoco_devices",
    paycloud_terminals: "limits.paycloud_terminals",
    paystack_terminals: "limits.paystack_terminals",
  };

  const catalog = getUpgradeMessage(keyMap[kind]);
  const plan = limitCheck.planName?.trim();
  const limit = limitCheck.limitValue;

  if (limit != null && limitCheck.currentCount >= limit) {
    const countPart = ` (${formatCount(limitCheck.currentCount)} of ${formatCount(limit)} used)`;
    return plan ? `${catalog}${countPart} Current plan: ${plan}.` : `${catalog}${countPart}`;
  }

  return plan ? `${catalog} Current plan: ${plan}.` : catalog;
}
