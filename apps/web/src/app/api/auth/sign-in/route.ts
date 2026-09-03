/**
 * Proxy sign-in API route
 *
 * Handles email/password sign-in on the server to avoid CORS and 502 issues
 * when the browser calls Supabase directly. Session cookies are set by the
 * Supabase server client and returned in the response.
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseServer } from "@/lib/supabase/server";
import { checkSignInRateLimit, incrementSignInAttempts } from "@/lib/rate-limit/sign-in";
import { noteAuthAttemptAndShouldChallenge, authCaptchaConfigured } from "@/lib/auth/auth-risk";
import { verifyAuthCaptcha } from "@/lib/auth/verify-auth-captcha";
import {
  REMEMBER_ME_COOKIE,
  REMEMBER_ME_MAX_AGE_SECONDS,
  rememberMeCookieOptions,
} from "@/lib/auth/remember-me";

export async function POST(request: NextRequest) {
  const rateLimit = await checkSignInRateLimit(request);
  if (rateLimit.allowed === false) {
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
    const rememberMe = body.remember_me === true;

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const { requireCaptcha } = await noteAuthAttemptAndShouldChallenge(request);
    if (requireCaptcha && authCaptchaConfigured()) {
      const captcha = await verifyAuthCaptcha(request, body);
      if (captcha.ok === false) {
        return NextResponse.json(
          { error: captcha.reason, captcha_required: true },
          { status: captcha.status },
        );
      }
    }

    const supabase = await getSupabaseServer(
      undefined,
      rememberMe ? { cookieMaxAgeSeconds: REMEMBER_ME_MAX_AGE_SECONDS } : undefined,
    );
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

    const cookieStore = await cookies();
    const secure = process.env.NODE_ENV === "production";
    if (rememberMe) {
      cookieStore.set(REMEMBER_ME_COOKIE, "1", rememberMeCookieOptions(secure));
    } else {
      cookieStore.set(REMEMBER_ME_COOKIE, "", { ...rememberMeCookieOptions(secure), maxAge: 0 });
    }

    return NextResponse.json({
      data: {
        user: data.user,
        identities: data.user?.identities ?? [],
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
