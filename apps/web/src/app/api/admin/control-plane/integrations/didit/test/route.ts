/**
 * POST /api/admin/control-plane/integrations/didit/test
 *
 * Sends a synthetic webhook to validate the Didit webhook endpoint
 * is reachable and signature verification works.
 */
import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { createHmac } from "crypto";
import { canonicaliseDiditWebhookBody } from "@/lib/identity-verification/provider/didit-provider";

export async function POST(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);

    const webhookSecret = process.env.DIDIT_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return errorResponse("DIDIT_WEBHOOK_SECRET not configured", "WEBHOOK_SECRET_MISSING", 400);
    }

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
    if (!appUrl) {
      return errorResponse(
        "NEXT_PUBLIC_APP_URL is not set — cannot reach webhook endpoint. Set it to https://www.beautonomi.com (or your public app origin) and redeploy.",
        "APP_URL_MISSING",
        400,
      );
    }
    const webhookUrl = `${appUrl}/api/webhooks/didit`;

    const ts = Math.floor(Date.now() / 1000);
    const payload = {
      event_id:     `test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      webhook_type: "status.updated",
      session_id:   `test-session-${Date.now()}`,
      status:       "Not Started",
      timestamp:    ts,
    };

    const body = JSON.stringify(payload);
    const canonical = canonicaliseDiditWebhookBody(payload);
    const timestamp = String(ts);
    const signature = createHmac("sha256", webhookSecret)
      .update(canonical, "utf8")
      .digest("hex");

    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-signature-v2": signature,
          "x-timestamp": timestamp,
          "User-Agent": "BeautonomiAdminDiditTest/1.0",
        },
        body,
      });

      let responseBody: string | null = null;
      try {
        responseBody = await res.text();
      } catch {
        responseBody = null;
      }

      return successResponse({
        ok: res.ok,
        status: res.status,
        webhook_url: webhookUrl,
        message: res.ok
          ? "Test webhook sent and accepted"
          : `Webhook endpoint returned ${res.status}${responseBody ? `: ${responseBody.slice(0, 200)}` : ""}`,
        response_body: responseBody,
      });
    } catch (fetchErr) {
      return successResponse({
        ok: false,
        status: 0,
        webhook_url: webhookUrl,
        message: `Failed to reach webhook endpoint: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`,
        response_body: null,
      });
    }
  } catch (err) {
    return handleApiError(err);
  }
}
