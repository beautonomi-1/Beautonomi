import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { decodeCalendarOAuthState } from "@/lib/calendar/oauth-state";

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
 * GET /api/provider/calendar/callback/[provider]
 * 
 * Handle OAuth callback from calendar provider
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://beautonomi.com";
  const redirectSuccess = `${baseUrl}/provider/settings/calendar-integration?success=true&provider=`;
  const redirectError = `${baseUrl}/provider/settings/calendar-integration?error=`;

  try {
    const { provider } = await params;
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const stateParam = searchParams.get("state");
    const error = searchParams.get("error");

    if (error) {
      return NextResponse.redirect(redirectError + encodeURIComponent(error));
    }

    if (!code) {
      return NextResponse.redirect(redirectError + "no_code");
    }

    if (provider !== "google" && provider !== "outlook") {
      return NextResponse.redirect(redirectError + "invalid_provider");
    }

    const providerId = decodeCalendarOAuthState(stateParam);
    if (!providerId) {
      return NextResponse.redirect(redirectError + "invalid_state");
    }

    const redirectUri = `${baseUrl}/api/provider/calendar/callback/${provider}`;
    let accessToken: string;
    let refreshToken: string | null = null;
    let calendarId: string | null = "primary"; // Google primary calendar
    let expiresIn: number | null = null;

    if (provider === "google") {
      const credentials = await getCalendarOAuthCredentials("google");
      if (!credentials) {
        throw new Error("Google Calendar OAuth credentials not configured");
      }

      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: credentials.clientId,
          client_secret: credentials.clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });

      if (!tokenResponse.ok) {
        const errBody = await tokenResponse.text();
        console.error("Google token exchange failed:", errBody);
        throw new Error("Failed to exchange code for tokens");
      }

      const tokens = (await tokenResponse.json()) as {
        access_token: string;
        refresh_token?: string;
        expires_in?: number;
      };
      accessToken = tokens.access_token;
      refreshToken = tokens.refresh_token ?? null;
      expiresIn = tokens.expires_in ?? null;
    } else {
      const credentials = await getCalendarOAuthCredentials("outlook");
      if (!credentials) {
        throw new Error("Outlook OAuth credentials not configured");
      }

      const tokenResponse = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: credentials.clientId,
          client_secret: credentials.clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });

      if (!tokenResponse.ok) {
        const errBody = await tokenResponse.text();
        console.error("Outlook token exchange failed:", errBody);
        throw new Error("Failed to exchange code for tokens");
      }

      const tokens = (await tokenResponse.json()) as {
        access_token: string;
        refresh_token?: string;
        expires_in?: number;
      };
      accessToken = tokens.access_token;
      refreshToken = tokens.refresh_token ?? null;
      expiresIn = tokens.expires_in ?? null;
      calendarId = null; // Outlook calendar id can be resolved when syncing
    }

    const supabaseAdmin = await getSupabaseAdmin();

    const metadata: Record<string, unknown> = {};
    if (expiresIn != null) metadata.expires_in = expiresIn;

    const { data: existing } = await supabaseAdmin
      .from("calendar_syncs")
      .select("id")
      .eq("provider_id", providerId)
      .eq("provider", provider)
      .maybeSingle();

    const row = {
      provider_id: providerId,
      provider,
      calendar_id: calendarId,
      calendar_name: provider === "google" ? "Google Calendar" : "Outlook Calendar",
      access_token: accessToken,
      refresh_token: refreshToken,
      sync_direction: "app_to_calendar",
      is_active: true,
      sync_error: null,
      metadata,
      updated_at: new Date().toISOString(),
    };

    if (existing) {
      await supabaseAdmin
        .from("calendar_syncs")
        .update(row)
        .eq("id", existing.id);
    } else {
      await supabaseAdmin.from("calendar_syncs").insert(row);
    }

    return NextResponse.redirect(redirectSuccess + provider);
  } catch (error) {
    console.error("Error handling calendar callback:", error);
    return NextResponse.redirect(redirectError + "callback_failed");
  }
}
