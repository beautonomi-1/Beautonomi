/**
 * Proxy sign-in API route
 *
 * Handles email/password sign-in on the server to avoid CORS and 502 issues
 * when the browser calls Supabase directly. Session cookies are set by the
 * Supabase server client and returned in the response.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { checkSignInRateLimit, incrementSignInAttempts } from "@/lib/rate-limit/sign-in";

export async function POST(request: NextRequest) {
  const rateLimit = await checkSignInRateLimit(request);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many sign-in attempts. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds ?? 60),
          "X-RateLimit-Remaining": "0",
        },
      }
    );
  }

  try {
    const body = await request.json();
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const supabase = await getSupabaseServer();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      incrementSignInAttempts(request);
      const code = (error as { code?: string }).code;
      if (
        code === "email_not_confirmed" ||
        error.message.toLowerCase().includes("email not confirmed")
      ) {
        return NextResponse.json(
          {
            error:
              "Please verify your email address before logging in. Check your inbox for the verification email.",
          },
          { status: 403 }
        );
      }
      if (
        error.message.toLowerCase().includes("invalid login credentials") ||
        error.message.toLowerCase().includes("invalid credentials")
      ) {
        return NextResponse.json(
          { error: "Invalid login credentials. Please check your email and password." },
          { status: 401 }
        );
      }
      return NextResponse.json(
        { error: error.message },
        { status: 401 }
      );
    }

    return NextResponse.json({
      data: {
        user: data.user,
        session: data.session
          ? {
              access_token: data.session.access_token,
              refresh_token: data.session.refresh_token,
              expires_in: data.session.expires_in,
              expires_at: data.session.expires_at,
            }
          : null,
      },
    });
  } catch (e) {
    console.error("Sign-in proxy error:", e);
    return NextResponse.json(
      { error: "Sign-in failed. Please try again." },
      { status: 500 }
    );
  }
}
