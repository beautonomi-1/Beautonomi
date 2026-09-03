import { NextRequest } from "next/server";
import {
  requireAdminSectionAny,
  successResponse,
  errorResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_FINANCE, ADMIN_SECTION_INTEGRATIONS_DEV } from "@/lib/admin-sections";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";
import {
  isReplayableSource,
  replayInboundWebhookEvent,
  type WebhookEventRow,
} from "@/lib/payment/replay-inbound-webhook";

/**
 * POST /api/admin/webhooks/inbound/[id]/replay
 * Body: { force?: boolean } — force re-dispatches an already-processed event
 * (handlers are idempotent on payment_transactions / booking_payments).
 * Finance or Integrations admins.
 */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireAdminSectionAny(
      [ADMIN_SECTION_FINANCE, ADMIN_SECTION_INTEGRATIONS_DEV],
      request,
    );
    const { id } = await ctx.params;
    const body = (await request.json().catch(() => ({}))) as { force?: boolean };
    const force = body.force === true;
    const supabase = getSupabaseAdmin();

    const { data: row, error } = await supabase
      .from("webhook_events")
      .select("id, event_id, source, event_type, payload, status, error_message, attempt_count, processed_at, created_at")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!row) return errorResponse("Webhook event not found", "NOT_FOUND", 404);
    const event = row as WebhookEventRow;

    if (!isReplayableSource(event.source)) {
      return errorResponse(`Source '${event.source}' cannot be replayed`, "NOT_REPLAYABLE", 400);
    }

    const result = await replayInboundWebhookEvent(supabase, event, { force });
    const reqMeta = extractRequestMeta(request);

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "admin.webhook.inbound.replay",
      entity_type: "webhook_event",
      entity_id: id,
      module: "integrations_dev",
      risk_level: "high",
      retention_tier: "financial",
      status: result.ok ? "succeeded" : "failed",
      reason:
        result.ok === false
          ? result.reason
          : result.replayed === false
            ? result.reason
            : null,
      metadata: {
        source: event.source,
        event_type: event.event_type,
        event_id: event.event_id,
        previous_status: event.status,
        force,
        result,
      },
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
    });

    if (result.ok === false) {
      const status = result.code === "HANDLER_FAILED" ? 502 : 400;
      return errorResponse(result.reason, result.code, status);
    }
    if (result.replayed === false) {
      return successResponse({ replayed: false, reason: result.reason, event_id: event.event_id }, 200);
    }
    return successResponse({ replayed: true, handler: result.handler, event_id: event.event_id });
  } catch (error) {
    return handleApiError(error, "Failed to replay webhook event");
  }
}
