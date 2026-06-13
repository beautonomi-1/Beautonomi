/**
 * Platform Settings Helper
 *
 * Utility functions to get platform-wide settings
 */

import { getSupabaseServer } from "@/lib/supabase/server";

export interface VerificationSettings {
  otp_enabled: boolean;
  qr_code_enabled: boolean;
  require_verification: boolean;
  allow_provider_override: boolean;
  guest_link_email_enabled: boolean;
  guest_link_sms_enabled: boolean;
}

export interface GuestLinkDeliverySettings {
  guest_link_email_enabled: boolean;
  guest_link_sms_enabled: boolean;
}

async function loadActivePlatformSettings(): Promise<Record<string, unknown> | null> {
  try {
    const supabase = await getSupabaseServer();
    const { data: platformSettings, error } = await supabase
      .from("platform_settings")
      .select("settings")
      .eq("is_active", true)
      .single();

    if (error || !platformSettings) return null;
    return (platformSettings as { settings?: Record<string, unknown> }).settings ?? null;
  } catch (error) {
    console.error("Error fetching platform settings:", error);
    return null;
  }
}

/**
 * Get verification settings from platform settings
 */
export async function getVerificationSettings(): Promise<VerificationSettings> {
  const settings = await loadActivePlatformSettings();
  const verification = (settings?.verification as Record<string, unknown> | undefined) ?? {};

  return {
    otp_enabled: verification.otp_enabled !== false,
    qr_code_enabled: verification.qr_code_enabled !== false,
    require_verification: verification.require_verification !== false,
    allow_provider_override: verification.allow_provider_override !== false,
    guest_link_email_enabled: verification.guest_link_email_enabled !== false,
    guest_link_sms_enabled: verification.guest_link_sms_enabled !== false,
  };
}

export async function getGuestLinkDeliverySettings(): Promise<GuestLinkDeliverySettings> {
  const verification = await getVerificationSettings();
  return {
    guest_link_email_enabled: verification.guest_link_email_enabled,
    guest_link_sms_enabled: verification.guest_link_sms_enabled,
  };
}
