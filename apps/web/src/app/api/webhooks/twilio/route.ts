import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  handleWhatsAppStatusCallback,
  updateWhatsAppDeliveryLog,
} from "@/lib/whatsapp/fallback-waterfall";
import {
  normalizeWhatsAppPhone,
  revokeWhatsAppOptIn,
  upsertWhatsAppInboundSession,
} from "@/lib/whatsapp/sessions";

const OPT_OUT_KEYWORDS = new Set(["stop", "unsubscribe", "cancel", "optout", "opt out"]);

/**
 * POST /api/webhooks/twilio
 *
 * Receives Twilio status callbacks and inbound WhatsApp/SMS messages.
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

    const url = `${process.env.NEXT_PUBLIC_APP_URL || "https://beautonomi.com"}/api/webhooks/twilio`;
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
    const from = params.get("From") || "";
    const bodyText = (params.get("Body") || "").trim().toLowerCase();

    const supabase = getSupabaseAdmin();

    // Inbound WhatsApp (no MessageStatus on some inbound events)
    if (from.startsWith("whatsapp:") && bodyText && !messageStatus) {
      const phone = normalizeWhatsAppPhone(from);
      let userId: string | null = null;
      const { data: userRow } = await supabase
        .from("users")
        .select("id")
        .or(`phone.eq.${phone},phone.eq.${from.replace("whatsapp:", "")}`)
        .limit(1)
        .maybeSingle();
      userId = userRow?.id ?? null;

      await upsertWhatsAppInboundSession({ phone, userId });

      if (OPT_OUT_KEYWORDS.has(bodyText) && userId) {
        await revokeWhatsAppOptIn(userId);
      }

      return new NextResponse(
        '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        { status: 200, headers: { "Content-Type": "text/xml" } },
      );
    }

    if (messageSid && messageStatus) {
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

      const { data: waLog } = await supabase
        .from("whatsapp_delivery_log")
        .select("id")
        .eq("message_sid", messageSid)
        .maybeSingle();

      if (waLog) {
        await handleWhatsAppStatusCallback({
          messageSid,
          messageStatus,
          errorCode,
        });
      } else if (from.startsWith("whatsapp:")) {
        await updateWhatsAppDeliveryLog({
          messageSid,
          status: messageStatus,
          errorCode,
        });
      }
    }

    return new NextResponse(null, { status: 204 });
  } catch (e) {
    console.error("Twilio webhook error:", e);
    return NextResponse.json({ error: "Webhook failed" }, { status: 500 });
  }
}
