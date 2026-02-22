import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { createPortalToken, getPortalUrl } from "@/lib/portal/token";
import { checkPortalRateLimit } from "@/lib/rate-limit/portal";

/**
 * POST /api/portal/request-link
 *
 * Request a new portal link for upcoming bookings. Requires email.
 * Rate limited - 5 requests per minute per IP.
 */
export async function POST(request: NextRequest) {
  const { allowed } = checkPortalRateLimit(request);
  if (!allowed) {
    return handleApiError(
      new Error("Rate limit exceeded"),
      "Too many requests. Please try again in a minute.",
      "RATE_LIMITED",
      429
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!email) {
      return handleApiError(
        new Error("Email required"),
        "Please provide your email address",
        "VALIDATION_ERROR",
        400
      );
    }

    const adminSupabase = getSupabaseAdmin();

    // customer_id in bookings references users(id)
    const { data: user, error: userError } = await adminSupabase
      .from("users")
      .select("id")
      .ilike("email", email)
      .limit(1)
      .maybeSingle();

    if (userError || !user) {
      return successResponse({
        success: true,
        message: "If an account exists with this email, you will receive a new link shortly.",
      });
    }

    const now = new Date().toISOString();
    const { data: bookings, error: bookingsError } = await adminSupabase
      .from("bookings")
      .select("id, booking_number, scheduled_at")
      .eq("customer_id", user.id)
      .in("status", ["confirmed", "pending"])
      .gte("scheduled_at", now)
      .order("scheduled_at", { ascending: true })
      .limit(1);

    if (bookingsError || !bookings?.length) {
      return successResponse({
        success: true,
        message: "If you have upcoming bookings, you will receive a new link shortly.",
      });
    }

    const booking = bookings[0];
    const { token } = await createPortalToken(adminSupabase, booking.id, {
      expiresInDays: 7,
      maxUses: 5,
    });

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
    const portalUrl = getPortalUrl(token, baseUrl);

    return successResponse({
      success: true,
      message: "A new link has been generated for your upcoming booking.",
      portalUrl,
      bookingNumber: booking.booking_number,
    });
  } catch (error) {
    return handleApiError(error, "Failed to generate link");
  }
}
