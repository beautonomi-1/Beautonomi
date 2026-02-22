import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, getProviderIdForUser } from "@/lib/supabase/api-helpers";
import { checkCalendarSyncFeatureAccess } from "@/lib/subscriptions/feature-access";

/**
 * Get OAuth credentials from database (with environment variable fallback)
 */
async function getCalendarOAuthCredentials(provider: "google" | "outlook"): Promise<{ clientId: string; clientSecret: string } | null> {
  const supabaseAdmin = await getSupabaseAdmin();
  
  try {
    // Try to get from database first
    const { data: secretRow } = await supabaseAdmin
      .from("platform_secrets")
      .select(provider === "google" 
        ? "google_calendar_client_id, google_calendar_client_secret"
        : "outlook_client_id, outlook_client_secret"
      )
      .limit(1)
      .maybeSingle();

    if (provider === "google") {
      const secret = secretRow as { google_calendar_client_id?: string; google_calendar_client_secret?: string } | null;
      const clientId = secret?.google_calendar_client_id || process.env.GOOGLE_CALENDAR_CLIENT_ID;
      const clientSecret = secret?.google_calendar_client_secret || process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
      
      if (clientId && clientSecret) {
        return { clientId, clientSecret };
      }
    } else if (provider === "outlook") {
      const secret = secretRow as { outlook_client_id?: string; outlook_client_secret?: string } | null;
      const clientId = secret?.outlook_client_id || process.env.OUTLOOK_CLIENT_ID;
      const clientSecret = secret?.outlook_client_secret || process.env.OUTLOOK_CLIENT_SECRET;
      
      if (clientId && clientSecret) {
        return { clientId, clientSecret };
      }
    }
  } catch (error) {
    console.warn("Failed to load OAuth credentials from database, trying environment variables:", error);
  }

  // Fallback to environment variables
  if (provider === "google") {
    const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
    if (clientId && clientSecret) {
      return { clientId, clientSecret };
    }
  } else if (provider === "outlook") {
    const clientId = process.env.OUTLOOK_CLIENT_ID;
    const clientSecret = process.env.OUTLOOK_CLIENT_SECRET;
    if (clientId && clientSecret) {
      return { clientId, clientSecret };
    }
  }

  return null;
}

/**
 * GET /api/provider/calendar/auth/[provider]
 * 
 * Get OAuth authorization URL for calendar provider
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    const { provider } = await params;
    const supabase = await getSupabaseServer(request);
    
    // Get user and provider ID
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    
    if (!providerId) {
      return NextResponse.json(
        {
          error: {
            message: "Provider not found",
            code: "NOT_FOUND",
          },
        },
        { status: 404 }
      );
    }

    // Check subscription allows calendar sync
    const calendarAccess = await checkCalendarSyncFeatureAccess(providerId);
    if (!calendarAccess.enabled) {
      return NextResponse.json(
        {
          error: {
            message: "Calendar sync requires a subscription upgrade. Please upgrade to Starter plan or higher.",
            code: "SUBSCRIPTION_REQUIRED",
          },
        },
        { status: 403 }
      );
    }

    // Check if calendar integration is enabled in platform settings
    const supabaseAdmin = await getSupabaseAdmin();
    try {
      const { data: settings } = await supabaseAdmin
        .from("platform_settings")
        .select("settings")
        .limit(1)
        .maybeSingle();

      if (settings?.settings) {
        const calendarSettings = (settings.settings as any).calendar_integrations;
        
        if (provider === "google" && !calendarSettings?.google?.enabled) {
          return NextResponse.json(
            {
              error: {
                message: "Google Calendar integration is not enabled. Please contact your administrator.",
                code: "INTEGRATION_DISABLED",
              },
            },
            { status: 403 }
          );
        }
        
        if (provider === "outlook" && !calendarSettings?.outlook?.enabled) {
          return NextResponse.json(
            {
              error: {
                message: "Microsoft Outlook integration is not enabled. Please contact your administrator.",
                code: "INTEGRATION_DISABLED",
              },
            },
            { status: 403 }
          );
        }
        
        if (provider === "apple" && !calendarSettings?.apple?.enabled) {
          return NextResponse.json(
            {
              error: {
                message: "Apple Calendar (iCal) integration is not enabled. Please contact your administrator.",
                code: "INTEGRATION_DISABLED",
              },
            },
            { status: 403 }
          );
        }
      }
    } catch (error) {
      console.warn("Failed to check calendar integration settings:", error);
      // Continue anyway - allow connection if settings check fails
    }

    // Check if specific provider is allowed
    if (calendarAccess.providers && calendarAccess.providers.length > 0) {
      if (!calendarAccess.providers.includes(provider)) {
        return NextResponse.json(
          {
            error: {
              message: `${provider.charAt(0).toUpperCase() + provider.slice(1)} calendar sync is not available on your plan. Please upgrade to access this calendar provider.`,
              code: "SUBSCRIPTION_REQUIRED",
            },
          },
          { status: 403 }
        );
      }
    }
    
    // Validate provider
    if (!["google", "apple", "outlook"].includes(provider)) {
      return NextResponse.json(
        {
          error: {
            message: "Invalid calendar provider",
            code: "INVALID_PROVIDER",
          },
        },
        { status: 400 }
      );
    }

    // Generate OAuth URL based on provider
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/provider/calendar/callback/${provider}`;
    const state = Math.random().toString(36).substring(7);

    let authUrl = "";

    if (provider === "google") {
      const credentials = await getCalendarOAuthCredentials("google");
      if (!credentials) {
        console.error("Google Calendar OAuth credentials not configured");
        return NextResponse.json(
          {
            error: {
              message: "Google Calendar integration is not configured. Please contact your administrator to set up Google OAuth credentials in the admin portal.",
              code: "CONFIG_ERROR",
              details: "Missing Google Calendar OAuth credentials. Configure them in Admin Settings > Calendar Integrations.",
            },
          },
          { status: 500 }
        );
      }
      
      const clientId = credentials.clientId;

      const scopes = [
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/calendar.events",
      ].join(" ");

      authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(
        redirectUri
      )}&response_type=code&scope=${encodeURIComponent(scopes)}&access_type=offline&prompt=consent&state=${state}`;
    } else if (provider === "apple") {
      // Apple Calendar uses iCal subscription (no OAuth)
      return NextResponse.json(
        {
          error: {
            message: "Apple Calendar uses iCal subscription. Please use the iCal URL method.",
            code: "ICAL_METHOD",
          },
        },
        { status: 400 }
      );
    } else if (provider === "outlook") {
      const credentials = await getCalendarOAuthCredentials("outlook");
      if (!credentials) {
        console.error("Outlook OAuth credentials not configured");
        return NextResponse.json(
          {
            error: {
              message: "Microsoft Outlook integration is not configured. Please contact your administrator to set up Outlook OAuth credentials in the admin portal.",
              code: "CONFIG_ERROR",
              details: "Missing Outlook OAuth credentials. Configure them in Admin Settings > Calendar Integrations.",
            },
          },
          { status: 500 }
        );
      }
      
      const clientId = credentials.clientId;

      authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(
        redirectUri
      )}&response_mode=query&scope=${encodeURIComponent(
        "https://graph.microsoft.com/Calendars.ReadWrite offline_access"
      )}&state=${state}`;
    }

    // Store state in session/database for verification
    // In production, store this securely

    return NextResponse.json({
      url: authUrl,
      state,
    });
  } catch (error) {
    console.error("Error generating calendar auth URL:", error);
    return NextResponse.json(
      {
        error: {
          message: "Failed to generate authorization URL",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
