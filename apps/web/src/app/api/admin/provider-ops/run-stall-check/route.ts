import { requireProviderOpsManagersOnly } from "@/lib/provider-ops/ops-route-auth";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { writeAuditLog } from "@/lib/audit/audit";
import { chunkIds } from "@/lib/provider-ops/postgrest-unbounded";
import { phoneIsDoNotContact } from "@/lib/provider-ops/do-not-contact";
import { loadProviderOpsStallSettings } from "@/lib/provider-ops/stall-thresholds";
import { autoAssignOnboardingTrackingOwners } from "@/lib/provider-ops/ops-case";
import { resolveTwilioCredentials, sendTwilioSMS } from "@/lib/integrations/twilio";

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
      const { user } = await requireProviderOpsManagersOnly(request);
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
    const opsSettings = await loadProviderOpsStallSettings(supabase, tenantId);
    const {
      stall_threshold_hours: stallThresholdHours,
      dropoff_threshold_hours: dropoffThresholdHours,
      auto_assign_enabled: autoAssignEnabled,
      auto_sms_on_stall: autoSmsOnStall,
      sla_contact_stalled_hours: slaContactStalledHours,
    } = opsSettings;

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
        .select("id, user_id, current_step, updated_at, created_at")
        .in("user_id", chunk);
      if (draftErr) throw draftErr;
      drafts.push(...((draftChunk ?? []) as Record<string, unknown>[]));
    }

    const { data: existingProviders } = await supabase
      .from("providers")
      .select("user_id")
      .eq("tenant_id", tenantId)
      .in("user_id", tenantUserIds);
    const providerOwnerIds = new Set(
      (existingProviders || []).map((p: { user_id: string }) => p.user_id)
    );

    const results = { stalled: 0, dropped: 0, on_track: 0, sms_sent: 0 };
    const toUpdateTrackingStalled: string[] = [];
    const toUpdateTrackingDropped: string[] = [];
    const smsCreds = autoSmsOnStall
      ? await resolveTwilioCredentials(supabase, tenantId)
      : null;

    for (const raw of drafts) {
      const draft = raw as {
        id: string;
        user_id: string;
        updated_at?: string | null;
        created_at?: string | null;
      };
      if (providerOwnerIds.has(draft.user_id)) continue;

      const lastActivity = draft.updated_at || draft.created_at;
      if (!lastActivity) continue;

      if (lastActivity < dropoffCutoff) {
        toUpdateTrackingDropped.push(draft.user_id);
        results.dropped++;
      } else if (lastActivity < stallCutoff) {
        toUpdateTrackingStalled.push(draft.user_id);
        results.stalled++;

        if (autoSmsOnStall && lastActivity < slaCutoff && smsCreds?.smsFrom) {
          try {
            const { data: userRow } = await supabase
              .from("users")
              .select("phone, full_name")
              .eq("id", draft.user_id)
              .maybeSingle();

            const phone = (userRow as { phone?: string } | null)?.phone;
            const name = (userRow as { full_name?: string } | null)?.full_name ?? "Provider";

            if (phone && !(await phoneIsDoNotContact(supabase, tenantId, phone))) {
              await sendTwilioSMS(
                smsCreds,
                phone,
                `Hi ${name}, we noticed you started signing up on Beautonomi but haven't finished. Need help? Reply to this message or contact us. We'd love to have you on board!`
              );
              results.sms_sent++;

              await supabase.from("provider_lead_communications").insert({
                tenant_id: tenantId,
                user_id: draft.user_id,
                channel: "sms",
                direction: "outbound",
                from_number: smsCreds.smsFrom,
                to_number: phone,
                body: `Auto-stall SMS to ${name}`,
                status: "sent",
                metadata: { auto_trigger: "stall_check" },
                sent_by: null,
              });
            }
          } catch (smsErr) {
            console.error(`[provider-ops-stall-check] SMS failed for draft ${draft.id}:`, smsErr);
          }
        }
      } else {
        results.on_track++;
      }
    }

    // ── 3. Batch-update tracking wizard_status ─────────────────────────────
    if (toUpdateTrackingStalled.length > 0) {
      await supabase
        .from("provider_onboarding_tracking")
        .upsert(
          toUpdateTrackingStalled.map((userId) => ({
            user_id: userId,
            tenant_id: tenantId,
            wizard_status: "stalled",
            updated_at: now.toISOString(),
          })),
          { onConflict: "user_id" }
        );
    }
    if (toUpdateTrackingDropped.length > 0) {
      await supabase
        .from("provider_onboarding_tracking")
        .upsert(
          toUpdateTrackingDropped.map((userId) => ({
            user_id: userId,
            tenant_id: tenantId,
            wizard_status: "dropped",
            updated_at: now.toISOString(),
          })),
          { onConflict: "user_id" }
        );
    }

    let auto_assigned = 0;
    if (autoAssignEnabled) {
      const assignUserIds = [...toUpdateTrackingStalled, ...toUpdateTrackingDropped];
      if (assignUserIds.length > 0) {
        const { data: trackingRows } = await supabase
          .from("provider_onboarding_tracking")
          .select("user_id, assigned_to")
          .in("user_id", assignUserIds);
        const trackingMap = new Map(
          (trackingRows ?? []).map((t: { user_id: string; assigned_to: string | null }) => [
            t.user_id,
            { assigned_to: t.assigned_to },
          ]),
        );
        auto_assigned = await autoAssignOnboardingTrackingOwners(
          supabase,
          tenantId,
          assignUserIds,
          trackingMap,
        );
      }
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
        auto_assigned,
        settings_used: {
          stallThresholdHours,
          dropoffThresholdHours,
          autoAssignEnabled,
          autoSmsOnStall,
          slaContactStalledHours,
        },
      },
    });

    return successResponse({
      tenant_id: tenantId,
      processed: (drafts ?? []).length,
      ...results,
      auto_assigned,
      settings_used: {
        stallThresholdHours,
        dropoffThresholdHours,
        autoAssignEnabled,
        autoSmsOnStall,
        slaContactStalledHours,
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to run stall check");
  }
}
