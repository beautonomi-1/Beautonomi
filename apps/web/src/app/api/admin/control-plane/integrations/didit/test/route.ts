/**
 * POST /api/admin/control-plane/integrations/didit/test
 *
 * Sends a synthetic webhook to validate the Didit webhook endpoint
 * is reachable and signature verification works.
 */
import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { createHmac } from "crypto";

export async function POST(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);

    const webhookSecret = process.env.DIDIT_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return errorResponse("DIDIT_WEBHOOK_SECRET not configured", "WEBHOOK_SECRET_MISSING", 400);
    }

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
    const webhookUrl = `${appUrl}/api/webhooks/didit`;

    const ts = Math.floor(Date.now() / 1000);
    const payload = {
      event_id:     `test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      webhook_type: "status.updated",
      session_id:   `test-session-${Date.now()}`,
      status:       "Not Started",
      timestamp:    ts,
    };

    // Reproduce Didit's X-Signature-V2 canonical form: sorted keys, compact JSON.
    const sortKeys = (obj: unknown): unknown => {
      if (Array.isArray(obj)) return obj.map(sortKeys);
      if (obj !== null && typeof obj === "object") {
        return Object.keys(obj as Record<string, unknown>).sort().reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = sortKeys((obj as Record<string, unknown>)[k]);
          return acc;
        }, {});
      }
      return obj;
    };
    const body = JSON.stringify(payload);
    const canonical = JSON.stringify(sortKeys(payload));
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
        },
        body,
      });

      return successResponse({
        ok: res.ok,
        status: res.status,
        message: res.ok
          ? "Test webhook sent and accepted"
          : `Webhook endpoint returned ${res.status}`,
      });
    } catch (fetchErr) {
      return successResponse({
        ok: false,
        message: `Failed to reach webhook endpoint: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`,
      });
    }
  } catch (err) {
    return handleApiError(err);
  }
}
