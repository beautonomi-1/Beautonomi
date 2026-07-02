import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAdminSection } from "@/lib/supabase/api-helpers";
import { unauthorizedResponse } from "@/lib/auth/requireRole";
import { writeAuditLog } from "@/lib/audit/audit";
import { ADMIN_SECTION_INTEGRATIONS_DEV } from "@/lib/admin-sections";

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
    const { user } = await requireAdminSection(ADMIN_SECTION_INTEGRATIONS_DEV, request);
    if (!user) {
      return unauthorizedResponse("Authentication required");
    }

    const { id } = await params;
    const supabase = await getSupabaseServer(request);

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

    type WebhookEventRow = { attempt_count?: number };
    const eventData = webhookEvent as WebhookEventRow;

    const { data: updated, error: updateError } = await supabase
      .from("webhook_events")
      .update({
        status: "processing",
        attempt_count: (eventData.attempt_count ?? 0) + 1,
        error_message: null,
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

    type EventPayloadRow = { endpoint_id?: string; payload?: unknown };
    const eventPayload = webhookEventData as EventPayloadRow;

    const { data: endpoint } = await supabase
      .from("webhook_endpoints")
      .select("url, secret, headers")
      .eq("id", eventPayload.endpoint_id ?? "")
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

    type EndpointRow = { url: string; secret?: string; headers?: Record<string, string> };
    const endpointData = endpoint as EndpointRow;

    const response = await fetch(endpointData.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Secret": endpointData.secret ?? "",
        ...(endpointData.headers ?? {}),
      },
      body: JSON.stringify(eventPayload.payload),
    });

    // attempt_count was already incremented above; here we only record the
    // delivery outcome. status must satisfy the webhook_events CHECK
    // constraint ('processing','processed','failed') — 'delivered' is invalid.
    await supabase
      .from("webhook_events")
      .update({
        status: response.ok ? "processed" : "failed",
        response_status: response.status,
        sent_at: new Date().toISOString(),
      })
      .eq("id", id);

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "superadmin",
      action: "admin.webhook.retry",
      entity_type: "webhook_event",
      entity_id: id,
      metadata: { endpoint_id: eventPayload.endpoint_id, delivered: response.ok, response_code: response.status },
    });

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
