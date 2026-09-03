import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { noteAuthAttemptAndShouldChallenge, authCaptchaConfigured } from "@/lib/auth/auth-risk";
import { verifyAuthCaptcha } from "@/lib/auth/verify-auth-captcha";

const GENERIC_SEND_ERROR = "Unable to send a verification code. Please try again.";

/**
 * POST /api/auth/otp/send
 * Send email or SMS OTP. Requires Turnstile when the IP looks repeat-risky.
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    const parsed = await request.json();
    if (parsed && typeof parsed === "object") body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: GENERIC_SEND_ERROR }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  if ((email && phone) || (!email && !phone)) {
    return NextResponse.json({ error: GENERIC_SEND_ERROR }, { status: 400 });
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
  } else if (requireCaptcha && authCaptchaConfigured() === false) {
    // Risk window hit but captcha is not configured — still allow (dev/preview).
  }

  try {
    const supabase = await getSupabaseServer(request);
    if (email) {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true },
      });
      if (error) {
        return NextResponse.json({ error: GENERIC_SEND_ERROR }, { status: 400 });
      }
    } else {
      const { error } = await supabase.auth.signInWithOtp({
        phone,
        options: { channel: "sms", shouldCreateUser: true },
      });
      if (error) {
        return NextResponse.json({ error: GENERIC_SEND_ERROR }, { status: 400 });
      }
    }

    return NextResponse.json({ data: { sent: true } });
  } catch {
    return NextResponse.json({ error: GENERIC_SEND_ERROR }, { status: 500 });
  }
}
