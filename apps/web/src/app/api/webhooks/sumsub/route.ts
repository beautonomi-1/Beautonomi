/**
 * POST /api/webhooks/sumsub
 *
 * Handles SumSub review-result webhooks for both providers and customers.
 *
 * Applicant routing:
 *   externalUserId = "user:{uuid}"     → customer (updates users.identity_verified)
 *   externalUserId = "{uuid}"          → provider (updates provider_verification_status)
 *
 * The "user:" prefix is set in /api/me/verification/sumsub/token.
 * Provider token (/api/provider/verification/sumsub/token) uses plain UUIDs
 * for backward compatibility.
 */

import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signature =
      request.headers.get("x-payload-digest") ||
      request.headers.get("x-sumsub-signature") ||
      "";
    const env = request.headers.get("x-sumsub-env") || "production";

    const supabase = getSupabaseAdmin();

    // Verify webhook signature when secret is configured
    const { data: config } = await supabase
      .from("sumsub_integration_config")
      .select("webhook_secret_secret")
      .eq("environment", env)
      .maybeSingle();

    const secret = config?.webhook_secret_secret as string | undefined;
    if (!secret) {
      console.error("Sumsub webhook secret not configured — rejecting request");
      return NextResponse.json({ error: "Webhook secret not configured" }, { status: 503 });
    }
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    const sigToCheck = signature.startsWith("sha256=") ? signature.slice(7) : signature;
    const sigBuf = Buffer.from(sigToCheck, "hex");
    const expectedBuf = Buffer.from(expected, "hex");
    if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const payload = JSON.parse(rawBody) as {
      applicantId?: string;
      externalUserId?: string;
      reviewStatus?: string;
      reviewResult?: { reviewAnswer?: string };
    };

    const applicantId = payload.applicantId;
    const externalUserId = payload.externalUserId ?? "";
    const reviewAnswer = payload.reviewResult?.reviewAnswer ?? payload.reviewStatus;

    // Map SumSub review answer to internal status
    let status = "in_progress";
    if (reviewAnswer === "GREEN" || reviewAnswer === "approved") status = "approved";
    else if (reviewAnswer === "RED" || reviewAnswer === "rejected") status = "rejected";
    else if (reviewAnswer === "YELLOW" || payload.reviewStatus === "pending") status = "in_progress";

    const now = new Date().toISOString();

    if (externalUserId.startsWith("user:")) {
      // ── Customer / end-user ─────────────────────────────────────────────
      const userId = externalUserId.slice("user:".length);
      if (!userId) {
        console.warn("Sumsub webhook: user: prefix present but no userId");
        return NextResponse.json({ ok: true });
      }

      const isApproved = status === "approved";
      const isRejected = status === "rejected";

      // Update the users table (primary source of truth for customer KYC)
      await supabase
        .from("users")
        .update({
          identity_verified: isApproved,
          identity_verification_status: status,
          ...(isApproved || isRejected ? { identity_verification_reviewed_at: now } : {}),
        })
        .eq("id", userId);

      // Upsert into user_verifications so it shows up in the admin queue
      await supabase.from("user_verifications").upsert(
        {
          user_id: userId,
          document_type: "sumsub",
          country: "auto",
          status,
          document_url: null,
          submitted_at: now,
          reviewed_at: isApproved || isRejected ? now : null,
        },
        { onConflict: "user_id,document_type" }
      );
    } else if (externalUserId) {
      // ── Provider ────────────────────────────────────────────────────────
      const providerId = externalUserId;
      await supabase.from("provider_verification_status").upsert(
        {
          provider_id: providerId,
          status,
          sumsub_applicant_id: applicantId ?? null,
          last_reviewed_at: now,
          metadata: { webhook: payload },
          updated_at: now,
        },
        { onConflict: "provider_id" }
      );
    } else {
      console.warn("Sumsub webhook: no externalUserId — ignoring");
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Sumsub webhook error:", e);
    return NextResponse.json({ error: "Webhook failed" }, { status: 500 });
  }
}
