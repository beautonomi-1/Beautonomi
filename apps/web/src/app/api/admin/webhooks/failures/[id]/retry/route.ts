import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";

/**
 * POST /api/admin/webhooks/failures/[id]/retry
 * 
 * Retry a failed webhook event
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const { id } = await params;
    const supabase = await getSupabaseServer();

    // Get the failed webhook event
    const { data: webhookEvent, error: fetchError } = await supabase
      .from("webhook_events")
      .select("*")
      .eq("id", id)
      .eq("status", "failed")
      .single();

    if (fetchError || !webhookEvent) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Webhook event not found or not in failed state",
            code: "NOT_FOUND",
          },
        },
        { status: 404 }
      );
    }

    const eventData = webhookEvent as any;

    // Reset status to processing and increment retry count
    const { data: updated, error: updateError } = await (supabase
      .from("webhook_events") as any)
      .update({
        status: "processing",
        retry_count: (eventData.retry_count || 0) + 1,
        error_message: null,
        error_stack: null,
      })
      .eq("id", id)
      .select()
      .single();

    if (updateError || !updated) {
      console.error("Error updating webhook event:", updateError);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to retry webhook",
            code: "UPDATE_ERROR",
          },
        },
        { status: 500 }
      );
    }

    // Re-deliver the webhook to its endpoint
    const { data: webhookEventData } = await supabase
      .from("webhook_events")
      .select("*")
      .eq("id", id)
      .single();

    if (!webhookEventData) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Webhook event not found",
            code: "NOT_FOUND",
          },
        },
        { status: 404 }
      );
    }

    const eventPayload = webhookEventData as any;

    const { data: endpoint } = await supabase
      .from("webhook_endpoints")
      .select("url, secret, headers")
      .eq("id", eventPayload.endpoint_id)
      .single();

    if (!endpoint) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Webhook endpoint not found",
            code: "NOT_FOUND",
          },
        },
        { status: 404 }
      );
    }

    const endpointData = endpoint as any;

    const response = await fetch(endpointData.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Secret": endpointData.secret || "",
        ...(endpointData.headers || {}),
      },
      body: JSON.stringify(eventPayload.payload),
    });

    await (supabase
      .from("webhook_events") as any)
      .update({
        status: response.ok ? "delivered" : "failed",
        response_code: response.status,
        last_attempt_at: new Date().toISOString(),
        retry_count: (eventPayload.retry_count || 0) + 1,
      })
      .eq("id", id);

    return NextResponse.json({
      data: { id, retry_initiated: true, delivered: response.ok },
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/webhooks/failures/[id]/retry:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to retry webhook",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
