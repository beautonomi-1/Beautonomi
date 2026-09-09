import type { SupabaseClient } from "@supabase/supabase-js";
import {
  checkMarketingFeatureAccess,
  canUseMarketingChannel,
} from "./feature-access";
import { getUpgradeMessage } from "./subscription-upgrade-copy";

export type AutomationActionType = "email" | "sms" | "whatsapp" | "notification";

export async function assertAutomationChannelAllowed(
  providerId: string,
  actionType: AutomationActionType,
  supabase: SupabaseClient,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (actionType === "notification") {
    return { ok: true };
  }

  const marketingAccess = await checkMarketingFeatureAccess(providerId, supabase);
  if (!marketingAccess.enabled) {
    return {
      ok: false,
      message: getUpgradeMessage("marketing.automations_channel"),
    };
  }

  const channelAllowed = await canUseMarketingChannel(providerId, actionType, supabase);
  if (!channelAllowed) {
    return {
      ok: false,
      message:
        actionType === "whatsapp"
          ? getUpgradeMessage("marketing.whatsapp")
          : getUpgradeMessage("marketing.automations_channel"),
    };
  }

  return { ok: true };
}
