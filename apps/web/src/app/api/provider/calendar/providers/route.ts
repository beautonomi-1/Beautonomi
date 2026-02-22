import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * GET /api/provider/calendar/providers
 * 
 * Get list of enabled calendar providers
 */
export async function GET() {
  try {
    const supabaseAdmin = await getSupabaseAdmin();
    
    // Get calendar integration settings from platform_settings
    const { data: settings } = await supabaseAdmin
      .from("platform_settings")
      .select("settings")
      .limit(1)
      .maybeSingle();

    const calendarSettings = (settings?.settings as any)?.calendar_integrations || {};
    
    // Return enabled providers
    const enabledProviders: string[] = [];
    
    if (calendarSettings.google?.enabled) {
      enabledProviders.push("google");
    }
    
    if (calendarSettings.outlook?.enabled) {
      enabledProviders.push("outlook");
    }
    
    if (calendarSettings.apple?.enabled) {
      enabledProviders.push("apple");
    }
    
    return successResponse({
      providers: enabledProviders,
    });
  } catch (error) {
    return handleApiError(error, "Failed to load calendar providers");
  }
}
