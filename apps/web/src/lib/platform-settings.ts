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
}

/**
 * Get verification settings from platform settings
 */
export async function getVerificationSettings(): Promise<VerificationSettings> {
  try {
    const supabase = await getSupabaseServer();
    
    const { data: platformSettings, error } = await supabase
      .from("platform_settings")
      .select("settings")
      .eq("is_active", true)
      .single();

    if (error || !platformSettings) {
      // Return defaults if settings not found
      return {
        otp_enabled: true,
        qr_code_enabled: true,
        require_verification: true,
      };
    }

    const settings = (platformSettings as any).settings;
    const verification = settings?.verification;

    return {
      otp_enabled: verification?.otp_enabled !== false, // Default to true
      qr_code_enabled: verification?.qr_code_enabled !== false, // Default to true
      require_verification: verification?.require_verification !== false, // Default to true
    };
  } catch (error) {
    console.error("Error fetching verification settings:", error);
    // Return defaults on error
    return {
      otp_enabled: true,
      qr_code_enabled: true,
      require_verification: true,
    };
  }
}
