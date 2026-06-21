/**
 * Resolves whether marketing sends use provider integrations vs platform credentials,
 * and whether platform marketing credits should be debited.
 *
 * Own integrations always take precedence when configured for a channel.
 * Platform path requires plan (or admin override) `use_platform_credentials`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  checkMarketingFeatureAccess,
  type MarketingFeatureAccess,
} from "@/lib/subscriptions/feature-access";

export type MarketingChannel = "email" | "sms" | "whatsapp";

export type ProviderMarketingIntegrations = {
  hasOwnEmail: boolean;
  hasOwnTwilioSms: boolean;
  hasOwnTwilioWhatsapp: boolean;
};

export type MarketingSendingMode = "platform" | "own_integrations" | "configure_integrations";

export async function getProviderMarketingIntegrations(
  supabase: SupabaseClient,
  providerId: string,
): Promise<ProviderMarketingIntegrations> {
  const [{ data: emailRow }, { data: twilioRow }] = await Promise.all([
    supabase
      .from("provider_email_integrations")
      .select("is_enabled")
      .eq("provider_id", providerId)
      .maybeSingle(),
    supabase
      .from("provider_twilio_integrations")
      .select("is_sms_enabled, sms_from_number, is_whatsapp_enabled, whatsapp_from_number")
      .eq("provider_id", providerId)
      .maybeSingle(),
  ]);

  const twilio = twilioRow as {
    is_sms_enabled?: boolean;
    sms_from_number?: string | null;
    is_whatsapp_enabled?: boolean;
    whatsapp_from_number?: string | null;
  } | null;

  return {
    hasOwnEmail: !!(emailRow as { is_enabled?: boolean } | null)?.is_enabled,
    hasOwnTwilioSms: !!(twilio?.is_sms_enabled && twilio.sms_from_number),
    hasOwnTwilioWhatsapp: !!(twilio?.is_whatsapp_enabled && twilio.whatsapp_from_number),
  };
}

export function hasOwnIntegrationForChannel(
  integrations: ProviderMarketingIntegrations,
  channel: MarketingChannel,
): boolean {
  if (channel === "email") return integrations.hasOwnEmail;
  if (channel === "sms") return integrations.hasOwnTwilioSms;
  return integrations.hasOwnTwilioWhatsapp;
}

export function willUsePlatformForChannel(
  access: Pick<MarketingFeatureAccess, "usePlatformCredentials">,
  integrations: ProviderMarketingIntegrations,
  channel: MarketingChannel,
): boolean {
  return access.usePlatformCredentials && !hasOwnIntegrationForChannel(integrations, channel);
}

export function shouldDebitPlatformCredits(
  access: Pick<MarketingFeatureAccess, "usePlatformCredentials">,
  integrations: ProviderMarketingIntegrations,
  channel: MarketingChannel,
): boolean {
  return willUsePlatformForChannel(access, integrations, channel);
}

export function resolveMarketingSendingMode(
  access: Pick<MarketingFeatureAccess, "usePlatformCredentials">,
  integrations: ProviderMarketingIntegrations,
): MarketingSendingMode {
  const hasOwn =
    integrations.hasOwnEmail || integrations.hasOwnTwilioSms || integrations.hasOwnTwilioWhatsapp;

  if (hasOwn) return "own_integrations";
  if (access.usePlatformCredentials) return "platform";
  return "configure_integrations";
}

export async function resolveMarketingSendingContext(
  providerId: string,
  channel: MarketingChannel | null,
  supabase: SupabaseClient,
): Promise<{
  access: MarketingFeatureAccess;
  integrations: ProviderMarketingIntegrations;
  sendingMode: MarketingSendingMode;
  debitsCredits: boolean;
  usesPlatformForChannel: boolean;
}> {
  const access = await checkMarketingFeatureAccess(providerId, supabase);
  const integrations = await getProviderMarketingIntegrations(supabase, providerId);
  const sendingMode = resolveMarketingSendingMode(access, integrations);

  return {
    access,
    integrations,
    sendingMode,
    debitsCredits: channel ? shouldDebitPlatformCredits(access, integrations, channel) : false,
    usesPlatformForChannel: channel ? willUsePlatformForChannel(access, integrations, channel) : false,
  };
}
