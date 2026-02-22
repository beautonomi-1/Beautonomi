import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

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
  try {
    const { provider } = await params;
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const _state = searchParams.get("state");
    const error = searchParams.get("error");

    if (error) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/provider/settings/calendar-integration?error=${encodeURIComponent(error)}`
      );
    }

    if (!code) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/provider/settings/calendar-integration?error=no_code`
      );
    }

    const _supabase = await getSupabaseServer(request);

    // Exchange code for tokens
    let _tokens: any = {};

    if (provider === "google") {
      const credentials = await getCalendarOAuthCredentials("google");
      if (!credentials) {
        throw new Error("Google Calendar OAuth credentials not configured");
      }
      
      const clientId = credentials.clientId;
      const clientSecret = credentials.clientSecret;
      const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/provider/calendar/callback/${provider}`;

      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          code,
          client_id: clientId || "",
          client_secret: clientSecret || "",
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });

      if (!tokenResponse.ok) {
        throw new Error("Failed to exchange code for tokens");
      }

      _tokens = await tokenResponse.json();
    } else if (provider === "outlook") {
      const credentials = await getCalendarOAuthCredentials("outlook");
      if (!credentials) {
        throw new Error("Outlook OAuth credentials not configured");
      }
      
      const clientId = credentials.clientId;
      const clientSecret = credentials.clientSecret;
      const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/provider/calendar/callback/${provider}`;

      const tokenResponse = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          code,
          client_id: clientId || "",
          client_secret: clientSecret || "",
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });

      if (!tokenResponse.ok) {
        throw new Error("Failed to exchange code for tokens");
      }

      _tokens = await tokenResponse.json();
    }

    // Get user info to get calendar ID
    // In production, store tokens securely (encrypted) and calendar sync settings
    // For now, redirect back to settings page with success

    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/provider/settings/calendar-integration?success=true&provider=${provider}`
    );
  } catch (error) {
    console.error("Error handling calendar callback:", error);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/provider/settings/calendar-integration?error=callback_failed`
    );
  }
}
