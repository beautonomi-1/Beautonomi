/**
 * POST /api/webhooks/sumsub
 * Sumsub webhook: verify signature and update provider_verification_status.
 */

import { NextRequest } from "next/server";
import { createHmac } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("x-payload-digest") || request.headers.get("x-sumsub-signature") || "";
    const env = request.headers.get("x-sumsub-env") || "production";

    const supabase = getSupabaseAdmin();
    const { data: config } = await supabase
      .from("sumsub_integration_config")
      .select("webhook_secret_secret")
      .eq("environment", env)
      .maybeSingle();

    const secret = config?.webhook_secret_secret as string | undefined;
    if (secret) {
      const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
      if (signature !== expected && signature !== `sha256=${expected}`) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    }

    const payload = JSON.parse(rawBody) as {
      applicantId?: string;
      externalUserId?: string;
      reviewStatus?: string;
      reviewResult?: { reviewAnswer?: string };
    };

    const applicantId = payload.applicantId;
    const externalUserId = payload.externalUserId;
    const reviewAnswer = payload.reviewResult?.reviewAnswer ?? payload.reviewStatus;

    let status = "pending";
    if (reviewAnswer === "GREEN" || reviewAnswer === "approved") status = "approved";
    else if (reviewAnswer === "RED" || reviewAnswer === "rejected") status = "rejected";
    else if (reviewAnswer === "YELLOW" || payload.reviewStatus === "pending") status = "in_progress";

    const providerId = externalUserId;
    if (providerId) {
      await supabase.from("provider_verification_status").upsert(
        {
          provider_id: providerId,
          status,
          sumsub_applicant_id: applicantId ?? null,
          last_reviewed_at: new Date().toISOString(),
          metadata: { webhook: payload },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "provider_id" }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Sumsub webhook error:", e);
    return NextResponse.json({ error: "Webhook failed" }, { status: 500 });
  }
}
