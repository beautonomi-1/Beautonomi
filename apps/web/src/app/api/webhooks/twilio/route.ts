import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * POST /api/webhooks/twilio
 *
 * Receives Twilio status callbacks for SMS and WhatsApp delivery receipts.
 * Validates the request using Twilio's X-Twilio-Signature HMAC.
 */
export async function POST(request: NextRequest) {
  try {
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!authToken) {
      console.error("TWILIO_AUTH_TOKEN not configured — rejecting webhook");
      return NextResponse.json({ error: "Not configured" }, { status: 503 });
    }

    const twilioSignature = request.headers.get("x-twilio-signature") || "";
    const body = await request.text();
    const params = new URLSearchParams(body);

    const url = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/twilio`;
    const sortedParams = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}${v}`)
      .join("");
    const expected = createHmac("sha1", authToken)
      .update(url + sortedParams)
      .digest("base64");

    const sigBuf = Buffer.from(twilioSignature, "base64");
    const expectedBuf = Buffer.from(expected, "base64");
    if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const messageSid = params.get("MessageSid") || params.get("SmsSid") || "";
    const messageStatus = params.get("MessageStatus") || params.get("SmsStatus") || "";
    const errorCode = params.get("ErrorCode");

    if (messageSid && messageStatus) {
      const supabase = getSupabaseAdmin();
      await supabase
        .from("sms_delivery_log")
        .upsert(
          {
            message_sid: messageSid,
            status: messageStatus,
            error_code: errorCode || null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "message_sid" },
        )
        .then(({ error }) => {
          if (error) console.warn("Failed to log Twilio delivery:", error.message);
        });
    }

    return new NextResponse(null, { status: 204 });
  } catch (e) {
    console.error("Twilio webhook error:", e);
    return NextResponse.json({ error: "Webhook failed" }, { status: 500 });
  }
}
