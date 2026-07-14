import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDER_OPS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { writeAuditLog } from "@/lib/audit/audit";
import { chunkIds } from "@/lib/provider-ops/postgrest-unbounded";
import { phoneIsDoNotContact } from "@/lib/provider-ops/do-not-contact";

/**
 * POST /api/admin/provider-ops/run-stall-check
 *
 * Reads provider_ops settings from platform_settings and classifies onboarding drafts as:
 *   - stalled   (last_updated > stall_threshold_hours ago, still in progress)
 *   - dropped   (last_updated > dropoff_threshold_hours ago, or explicitly abandoned)
 *   - on_track  (recently active)
 *
 * Optionally sends SMS alerts if auto_sms_on_stall is enabled.
 * This endpoint is designed to be called by a cron job (e.g. Vercel Cron, external scheduler).
 *
 * Cron call example (vercel.json):
 *   { "path": "/api/admin/provider-ops/run-stall-check", "schedule": "0 * * * *" }
 *
 * For unauthenticated cron callers pass header: x-cron-secret = CRON_SECRET env var.
 */
export async function POST(request: NextRequest) {
  // Support both admin-authenticated calls and cron calls via shared secret
  const cronSecret = process.env.CRON_SECRET;
  const callerSecret = request.headers.get("x-cron-secret");
  const isCronCall = cronSecret && callerSecret === cronSecret;

  let tenantId: string | null = null;
  let actorUserId: string | undefined;

  if (isCronCall) {
    // Cron call: tenant must be provided in the query string for multi-tenant
    tenantId = new URL(request.url).searchParams.get("tenant_id");
    if (!tenantId) {
      return NextResponse.json(
        { data: null, error: { message: "tenant_id required for cron calls", code: "MISSING_TENANT" } },
        { status: 400 }
      );
    }
  } else {
    // Admin call: require section access and resolve tenant from session
    try {
      const { user } = await requireAdminSection(ADMIN_SECTION_PROVIDER_OPS, request);
      actorUserId = user?.id;
    } catch {
      return NextResponse.json(
        { data: null, error: { message: "Unauthorized", code: "UNAUTHORIZED" } },
        { status: 401 }
      );
    }
    tenantId = await resolveAdminApiTenantId(request);
  }

  try {
    const supabase = getSupabaseAdmin();

    // ── 1. Load ops settings ────────────────────────────────────────────────
    const { data: settingsRow } = await supabase
      .from("platform_settings")
      .select("settings")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const allSettings = (settingsRow?.settings as Record<string, unknown>) || {};
    const opsSettings = (allSettings.provider_ops as Record<string, unknown>) || {};

    const stallThresholdHours: number = Number(opsSettings.stall_threshold_hours ?? 24);
    const dropoffThresholdHours: number = Number(opsSettings.dropoff_threshold_hours ?? 168);
    const autoSmsOnStall: boolean = Boolean(opsSettings.auto_sms_on_stall ?? false);
    const slaContactStalledHours: number = Number(opsSettings.sla_contact_stalled_hours ?? 4);

    const now = new Date();
    const stallCutoff = new Date(now.getTime() - stallThresholdHours * 60 * 60 * 1000).toISOString();
    const dropoffCutoff = new Date(now.getTime() - dropoffThresholdHours * 60 * 60 * 1000).toISOString();
    const slaCutoff = new Date(now.getTime() - slaContactStalledHours * 60 * 60 * 1000).toISOString();

    // ── 2. Fetch active onboarding drafts for tenant-scoped provider owners ─
    const { data: ownerScopeRows, error: ownerScopeErr } = await supabase.rpc(
      "admin_user_ids_in_tenant_scope_for_role",
      {
        p_tenant_id: tenantId,
        p_role: "provider_owner",
        p_limit: 50000,
      }
    );
    if (ownerScopeErr) throw ownerScopeErr;

    const tenantUserIds = ((ownerScopeRows ?? []) as { id: string }[])
      .map((r) => r.id)
      .filter(Boolean);

    if (tenantUserIds.length === 0) {
      return successResponse({
        tenant_id: tenantId,
        processed: 0,
        stalled: 0,
        dropped: 0,
        on_track: 0,
        sms_sent: 0,
        settings_used: { stallThresholdHours, dropoffThresholdHours, autoSmsOnStall, slaContactStalledHours },
      });
    }

    const drafts: Record<string, unknown>[] = [];
    for (const chunk of chunkIds(tenantUserIds, 400)) {
      const { data: draftChunk, error: draftErr } = await supabase
        .from("provider_onboarding_drafts")
        .select("id, user_id, step, status, updated_at, metadata")
        .in("user_id", chunk)
        .in("status", ["in_progress", "stalled"]);
      if (draftErr) throw draftErr;
      drafts.push(...((draftChunk ?? []) as Record<string, unknown>[]));
    }

    const results = { stalled: 0, dropped: 0, on_track: 0, sms_sent: 0 };
    const toUpdateStalled: string[] = [];
    const toUpdateDropped: string[] = [];

    for (const raw of drafts) {
      const draft = raw as { id: string; user_id: string; updated_at?: string | null; created_at?: string | null };
      const lastUpdated = draft.updated_at ? new Date(draft.updated_at) : null;
      if (!lastUpdated) continue;

      const updatedStr = lastUpdated.toISOString();

      if (updatedStr < dropoffCutoff) {
        // Beyond drop-off threshold → mark as dropped
        toUpdateDropped.push(draft.id);
        results.dropped++;
      } else if (updatedStr < stallCutoff) {
        // Beyond stall threshold but not yet dropped → mark as stalled
        toUpdateStalled.push(draft.id);
        results.stalled++;

        // Send SMS alert if enabled and SLA window exceeded
        if (autoSmsOnStall && updatedStr < slaCutoff) {
          try {
            const { data: userRow } = await supabase
              .from("users")
              .select("phone, full_name")
              .eq("id", draft.user_id)
              .maybeSingle();

            const phone = (userRow as { phone?: string } | null)?.phone;
            const name = (userRow as { full_name?: string } | null)?.full_name ?? "Provider";

            if (phone) {
              if (await phoneIsDoNotContact(supabase, tenantId, phone)) {
                continue;
              }
              // Dynamic import — graceful fallback when Twilio env vars are not set
              const { sendTwilioSMS } = await import("@/lib/integrations/twilio").catch(() => ({ sendTwilioSMS: null }));
              if (sendTwilioSMS) {
                await sendTwilioSMS(
                  phone,
                  `Hi ${name}, we noticed you haven't completed your onboarding on Beautonomi. ` +
                    `Our team is here to help — reply or visit the app to continue.`
                );
                results.sms_sent++;
              }
            }
          } catch (smsErr) {
            console.error(`[provider-ops-stall-check] SMS failed for draft ${draft.id}:`, smsErr);
          }
        }
      } else {
        results.on_track++;
      }
    }

    // ── 3. Batch-update statuses ────────────────────────────────────────────
    if (toUpdateStalled.length > 0) {
      await supabase
        .from("provider_onboarding_drafts")
        .update({ status: "stalled", updated_at: now.toISOString() })
        .in("id", toUpdateStalled);
    }
    if (toUpdateDropped.length > 0) {
      await supabase
        .from("provider_onboarding_drafts")
        .update({ status: "dropped", updated_at: now.toISOString() })
        .in("id", toUpdateDropped);
    }

    // ── 4. Audit log ────────────────────────────────────────────────────────
    await writeAuditLog({
      actor_user_id: actorUserId,
      actor_role: isCronCall ? "system" : "admin",
      action: "provider_ops.stall_check.run",
      entity_type: "provider_onboarding_drafts",
      entity_id: tenantId,
      metadata: {
        ...results,
        settings_used: { stallThresholdHours, dropoffThresholdHours, autoSmsOnStall, slaContactStalledHours },
      },
    });

    return successResponse({
      tenant_id: tenantId,
      processed: (drafts ?? []).length,
      ...results,
      settings_used: { stallThresholdHours, dropoffThresholdHours, autoSmsOnStall, slaContactStalledHours },
    });
  } catch (error) {
    return handleApiError(error, "Failed to run stall check");
  }
}
