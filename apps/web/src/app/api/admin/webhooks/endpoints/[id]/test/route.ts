import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError, notFoundResponse, errorResponse } from "@/lib/supabase/api-helpers";
import crypto from "crypto";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRoleInApi(["superadmin"], request);

    const supabase = await getSupabaseServer(request);

    const { id } = await params;

    const body = await request.json();
    const { test_payload } = body;

    // Get endpoint
    const { data: endpoint, error: endpointError } = await supabase
      .from("webhook_endpoints")
      .select("*")
      .eq("id", id)
      .single();

    if (endpointError || !endpoint) {
      return notFoundResponse("Webhook endpoint not found");
    }

    if (!endpoint.is_active) {
      return errorResponse("Webhook endpoint is not active", "VALIDATION_ERROR", 400);
    }

    // Create signature
    const timestamp = Math.floor(Date.now() / 1000);
    const payload = JSON.stringify(test_payload || { test: true, timestamp });
    const signature = crypto
      .createHmac("sha256", endpoint.secret)
      .update(`${timestamp}.${payload}`)
      .digest("hex");

    // Send test webhook
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), (endpoint.timeout_seconds || 30) * 1000);

    try {
      const response = await fetch(endpoint.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Signature": signature,
          "X-Webhook-Timestamp": timestamp.toString(),
          ...(endpoint.headers || {}),
        },
        body: payload,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const responseText = await response.text();

      // Log the test event
      await supabase.from("webhook_events").insert({
        endpoint_id: endpoint.id,
        event_type: "test",
        payload: test_payload || { test: true },
        status: response.ok ? "success" : "failed",
        response_status: response.status,
        response_body: responseText,
        attempt_count: 1,
        source: "admin_test",
        sent_at: new Date().toISOString(),
      });

      return successResponse({
        success: response.ok,
        status: response.status,
        response: responseText,
        timestamp,
        signature,
      });
    } catch (fetchError: any) {
      clearTimeout(timeout);

      // Log failed test
      await supabase.from("webhook_events").insert({
        endpoint_id: endpoint.id,
        event_type: "test",
        payload: test_payload || { test: true },
        status: "failed",
        error_message: fetchError.message || "Request failed",
        attempt_count: 1,
        source: "admin_test",
      });

      throw fetchError;
    }
  } catch (error: any) {
    return handleApiError(error, "Failed to test webhook");
  }
}
