import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { checkOtpVerifyRateLimit } from "@/lib/rate-limit/otp-verify";

const GENERIC_VERIFY_ERROR = "Invalid or expired code.";
const GENERIC_RATE_LIMIT = "Too many attempts. Please try again later.";

type OtpType = "email" | "sms" | "signup";

/**
 * POST /api/auth/otp/verify
 * Server-side OTP verify with per-identity + IP rate limits. Generic errors only.
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    const parsed = await request.json();
    if (parsed && typeof parsed === "object") body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: GENERIC_VERIFY_ERROR }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const token = typeof body.token === "string" ? body.token.trim() : "";
  const typeRaw = typeof body.type === "string" ? body.type : "";
  const type: OtpType | null =
    typeRaw === "email" || typeRaw === "sms" || typeRaw === "signup" ? typeRaw : null;

  const identity = email || phone;
  if (!identity || !token || !type) {
    return NextResponse.json({ error: GENERIC_VERIFY_ERROR }, { status: 400 });
  }
  if (type === "sms" && !phone) {
    return NextResponse.json({ error: GENERIC_VERIFY_ERROR }, { status: 400 });
  }
  if ((type === "email" || type === "signup") && !email) {
    return NextResponse.json({ error: GENERIC_VERIFY_ERROR }, { status: 400 });
  }

  const rateLimit = await checkOtpVerifyRateLimit(request, identity);
  if (rateLimit.allowed === false) {
    return NextResponse.json(
      { error: GENERIC_RATE_LIMIT },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds ?? 60),
          "X-RateLimit-Remaining": "0",
        },
      },
    );
  }

  try {
    const supabase = await getSupabaseServer(request);
    const { data, error } =
      type === "sms"
        ? await supabase.auth.verifyOtp({ phone, token, type: "sms" })
        : await supabase.auth.verifyOtp({
            email,
            token,
            type: type === "signup" ? "signup" : "email",
          });

    if (error || !data.session) {
      return NextResponse.json({ error: GENERIC_VERIFY_ERROR }, { status: 401 });
    }

    return NextResponse.json({
      data: {
        user: data.user,
        identities: data.user?.identities ?? [],
        session: {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_in: data.session.expires_in,
          expires_at: data.session.expires_at,
        },
      },
    });
  } catch {
    return NextResponse.json({ error: GENERIC_VERIFY_ERROR }, { status: 500 });
  }
}
