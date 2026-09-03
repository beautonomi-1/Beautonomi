import { NextRequest } from "next/server";
import { requireAdminSectionAny, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_FINANCE, ADMIN_SECTION_INTEGRATIONS_DEV, ADMIN_SECTION_OPERATIONS } from "@/lib/admin-sections";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sanitizeWebhookPayload } from "@/lib/payment/webhook-payload-sanitizer";

const STATUSES = new Set(["processing", "processed", "failed"]);
const INBOUND_WEBHOOK_SECTIONS = [
  ADMIN_SECTION_INTEGRATIONS_DEV,
  ADMIN_SECTION_FINANCE,
  ADMIN_SECTION_OPERATIONS,
];

/**
 * GET /api/admin/webhooks/inbound
 * Inbound PSP webhook events (`webhook_events`) for forensics.
 * Query: source, status, event_type, signature_failures=1, q (event_id/error contains),
 *        since (ISO), limit (<=200), offset
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSectionAny(INBOUND_WEBHOOK_SECTIONS, request);
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(request.url);

    const source = searchParams.get("source");
    const status = searchParams.get("status");
    const eventType = searchParams.get("event_type");
    const signatureFailures = searchParams.get("signature_failures") === "1";
    const q = searchParams.get("q")?.trim();
    const since = searchParams.get("since");
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
    const offset = Math.max(0, parseInt(searchParams.get("offset") || "0", 10));

    let query = supabase
      .from("webhook_events")
      .select(
        "id, event_id, source, event_type, status, attempt_count, error_message, payload, processed_at, created_at, updated_at",
        { count: "exact" },
      );

    if (source) query = query.eq("source", source);
    if (status && STATUSES.has(status)) query = query.eq("status", status);
    if (signatureFailures) query = query.eq("event_type", "signature_rejected");
    else if (eventType) query = query.eq("event_type", eventType);
    if (since) query = query.gte("created_at", since);
    if (q) query = query.or(`event_id.ilike.%${q.replace(/[%,()]/g, "")}%,error_message.ilike.%${q.replace(/[%,()]/g, "")}%`);

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;

    const events = ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      ...row,
      // Payload was sanitized at ingest; sanitize again defensively for legacy rows.
      payload: sanitizeWebhookPayload((row.payload as Record<string, unknown>) ?? {}),
      replayable:
        ["paystack", "stripe", "flutterwave"].includes(String(row.source)) &&
        row.event_type !== "signature_rejected" &&
        row.status !== "processed",
    }));

    // Signature-failure panel: counts by source for 24h / 7d
    const now = Date.now();
    const [sig24, sig7] = await Promise.all([
      supabase
        .from("webhook_events")
        .select("source, attempt_count")
        .eq("event_type", "signature_rejected")
        .gte("created_at", new Date(now - 24 * 3600_000).toISOString())
        .limit(5000),
      supabase
        .from("webhook_events")
        .select("source, attempt_count")
        .eq("event_type", "signature_rejected")
        .gte("created_at", new Date(now - 7 * 24 * 3600_000).toISOString())
        .limit(5000),
    ]);
    const group = (rows: Array<{ source: string; attempt_count?: number | null }> | null) => {
      const out: Record<string, { events: number; attempts: number }> = {};
      for (const r of rows ?? []) {
        const cur = out[r.source] ?? { events: 0, attempts: 0 };
        cur.events += 1;
        cur.attempts += Math.max(1, Number(r.attempt_count ?? 1));
        out[r.source] = cur;
      }
      return out;
    };

    return successResponse({
      events,
      total: count ?? events.length,
      limit,
      offset,
      signature_failures: {
        last_24h: group(sig24.data as Array<{ source: string; attempt_count?: number | null }> | null),
        last_7d: group(sig7.data as Array<{ source: string; attempt_count?: number | null }> | null),
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to list inbound webhook events");
  }
}
