import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, handleApiError, errorResponse, getPaginationParams } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDER_OPS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";
import { resolveTemplatePlaceholders, normalizePhoneForWasender } from "@/lib/whatsapp/wasender-client";
import { leadIsDoNotContact } from "@/lib/provider-ops/do-not-contact";

const ABSOLUTE_MAX_BATCH = 100;

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_PROVIDER_OPS, request);
    if (!["superadmin", "admin_operations"].includes(user.role ?? "")) {
      return errorResponse("Bulk send requires superadmin or admin_operations role", "FORBIDDEN", 403);
    }

    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const body = await request.json();

    const { lead_ids, template_id, session_id, message_override } = body;

    if (!Array.isArray(lead_ids) || lead_ids.length === 0) {
      return errorResponse("lead_ids array is required", "VALIDATION_ERROR", 400);
    }
    if (!session_id) return errorResponse("session_id is required", "VALIDATION_ERROR", 400);
    if (!template_id && !message_override) {
      return errorResponse("template_id or message_override is required", "VALIDATION_ERROR", 400);
    }

    // Load config for limits
    const { data: configRow } = await supabase
      .from("wasender_integration_config")
      .select("*")
      .eq("enabled", true)
      .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const cfg = configRow as Record<string, any> | null;
    const batchLimit = Math.min(cfg?.bulk_batch_size_limit ?? 50, ABSOLUTE_MAX_BATCH);
    const pacingMs = Math.max(cfg?.bulk_pacing_ms ?? 5000, 3000);
    const dailyLimit = cfg?.daily_send_limit_per_session ?? 200;
    const hourlyLimit = cfg?.hourly_send_limit_per_session ?? 30;

    if (lead_ids.length > batchLimit) {
      return errorResponse(
        `Maximum ${batchLimit} leads per batch. You selected ${lead_ids.length}.`,
        "BATCH_TOO_LARGE",
        400,
      );
    }

    // Verify session
    const { data: session } = await supabase
      .from("whatsapp_sessions")
      .select("id, status, is_paused, daily_send_count, hourly_send_count")
      .eq("id", session_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    const sessionRow = session as Record<string, any> | null;
    if (!sessionRow) return errorResponse("Session not found", "NOT_FOUND", 404);
    if (sessionRow.status !== "connected") return errorResponse("Session not connected", "SESSION_NOT_CONNECTED", 400);
    if (sessionRow.is_paused) return errorResponse("Session is paused", "SESSION_PAUSED", 400);

    const dailyRemaining = dailyLimit - (sessionRow.daily_send_count || 0);
    const hourlyRemaining = hourlyLimit - (sessionRow.hourly_send_count || 0);

    // Load template
    let templateBody = message_override?.trim() || "";
    if (template_id && !templateBody) {
      const { data: tpl } = await supabase
        .from("whatsapp_templates")
        .select("body")
        .eq("id", template_id)
        .maybeSingle();
      templateBody = (tpl as any)?.body || "";
    }
    if (!templateBody) return errorResponse("Message body is empty", "VALIDATION_ERROR", 400);

    const siteBaseUrl =
      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
      new URL(request.url).origin;

    // Load leads
    const { data: leads } = await supabase
      .from("provider_leads")
      .select("id, phone_e164, contact_person_name, lead_name, business_name, email, whatsapp_status, do_not_contact, deleted_at")
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .in("id", lead_ids);

    const leadMap = new Map((leads as any[] || []).map((l: any) => [l.id, l]));

    // 24h dedup: find leads already messaged within 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentComms } = await supabase
      .from("provider_lead_communications")
      .select("lead_id")
      .eq("tenant_id", tenantId)
      .eq("channel", "whatsapp")
      .eq("direction", "outbound")
      .gte("created_at", oneDayAgo)
      .in("lead_id", lead_ids);

    const recentlyMessaged = new Set((recentComms as any[] || []).map((c: any) => c.lead_id));

    const skipped: { lead_id: string; reason: string }[] = [];
    const eligible: { lead_id: string; to_number: string; message_body: string }[] = [];

    for (const lid of lead_ids) {
      const lead = leadMap.get(lid);
      if (!lead) { skipped.push({ lead_id: lid, reason: "not_found" }); continue; }
      if (lead.deleted_at) { skipped.push({ lead_id: lid, reason: "deleted" }); continue; }
      if (leadIsDoNotContact(lead)) { skipped.push({ lead_id: lid, reason: "do_not_contact" }); continue; }
      if (!lead.phone_e164) { skipped.push({ lead_id: lid, reason: "no_phone" }); continue; }
      if (recentlyMessaged.has(lid)) { skipped.push({ lead_id: lid, reason: "messaged_within_24h" }); continue; }
      if (lead.whatsapp_status === "not_found") { skipped.push({ lead_id: lid, reason: "not_on_whatsapp" }); continue; }

      eligible.push({
        lead_id: lid,
        to_number: normalizePhoneForWasender(lead.phone_e164),
        message_body: await resolveTemplatePlaceholders(templateBody, lead, {
          supabase,
          tenantId,
          baseUrl: siteBaseUrl,
        }),
      });
    }

    if (eligible.length === 0) {
      return successResponse({
        batch_id: null,
        queued_count: 0,
        skipped_count: skipped.length,
        skipped_reasons: skipped,
        daily_remaining: dailyRemaining,
        hourly_remaining: hourlyRemaining,
      });
    }

    if (eligible.length > dailyRemaining) {
      return errorResponse(
        `Would exceed daily limit. ${dailyRemaining} sends remaining today for this session.`,
        "DAILY_LIMIT",
        400,
      );
    }

    // Create batch
    const { data: batch, error: batchErr } = await supabase
      .from("whatsapp_bulk_batches")
      .insert({
        tenant_id: tenantId,
        session_id,
        template_id: template_id || null,
        total_count: eligible.length,
        queued_count: eligible.length,
        status: "queued",
        created_by: user.id,
      })
      .select()
      .single();

    if (batchErr) throw batchErr;
    const batchId = (batch as any).id;

    // Insert queue rows with staggered scheduled_at
    const now = Date.now();
    const queueRows = eligible.map((e, i) => ({
      tenant_id: tenantId,
      lead_id: e.lead_id,
      session_id,
      template_id: template_id || null,
      bulk_batch_id: batchId,
      to_number: e.to_number,
      message_body: e.message_body,
      status: "queued",
      scheduled_at: new Date(now + i * pacingMs).toISOString(),
      created_by: user.id,
    }));

    const { error: queueErr } = await supabase.from("whatsapp_message_queue").insert(queueRows);
    if (queueErr) throw queueErr;

    void writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "admin.whatsapp.bulk.queued",
      entity_type: "whatsapp_bulk_batch",
      entity_id: batchId,
      module: "whatsapp",
      risk_level: "high",
      metadata: {
        total: eligible.length,
        skipped: skipped.length,
        session_id,
        template_id,
      },
      ...extractRequestMeta(request),
    });

    return successResponse({
      batch_id: batchId,
      queued_count: eligible.length,
      skipped_count: skipped.length,
      skipped_reasons: skipped,
      daily_remaining: dailyRemaining - eligible.length,
      hourly_remaining: Math.max(0, hourlyRemaining - eligible.length),
    });
  } catch (error) {
    return handleApiError(error, "Failed to queue bulk send");
  }
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_PROVIDER_OPS, request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const { searchParams } = new URL(request.url);
    const batchId = searchParams.get("batch_id");

    if (batchId) {
      const { data: batch } = await supabase
        .from("whatsapp_bulk_batches")
        .select("*")
        .eq("id", batchId)
        .eq("tenant_id", tenantId)
        .maybeSingle();

      if (!batch) return errorResponse("Batch not found", "NOT_FOUND", 404);

      const { page, limit, offset } = getPaginationParams(request);
      const { data: messages, count } = await supabase
        .from("whatsapp_message_queue")
        .select("id, lead_id, to_number, status, sent_at, failed_at, failure_reason, created_at", { count: "exact" })
        .eq("bulk_batch_id", batchId)
        .order("created_at", { ascending: true })
        .range(offset, offset + limit - 1);

      return successResponse({
        batch,
        messages: messages || [],
        meta: { page, limit, total: count || 0, has_more: (count || 0) > page * limit },
      });
    }

    const { data: batches } = await supabase
      .from("whatsapp_bulk_batches")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(20);

    return successResponse(batches || []);
  } catch (error) {
    return handleApiError(error, "Failed to fetch bulk batches");
  }
}
