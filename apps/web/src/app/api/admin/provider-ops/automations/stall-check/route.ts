import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDER_OPS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { resolveTwilioCredentials, sendTwilioSMS } from "@/lib/integrations/twilio";
import { chunkIds } from "@/lib/provider-ops/postgrest-unbounded";
import { phoneIsDoNotContact } from "@/lib/provider-ops/do-not-contact";

/**
 * On-demand stall detection. Scans all in-progress onboarding drafts,
 * computes stall status based on configurable thresholds, and returns
 * a list of signups that need attention. This can be triggered by an
 * admin from the UI, or invoked by a cron job.
 */
export async function POST(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_PROVIDER_OPS, request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    const { data: platformSettings } = await supabase
      .from("platform_settings")
      .select("settings")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const allSettings =
      (platformSettings?.settings as Record<string, unknown>) || {};
    const opsSettings =
      (allSettings.provider_ops as Record<string, unknown>) || {};

    const stallThresholdHours =
      (opsSettings.stall_threshold_hours as number) ?? 24;
    const dropoffThresholdHours =
      (opsSettings.dropoff_threshold_hours as number) ?? 168;

    const now = new Date();
    const stallCutoff = new Date(
      now.getTime() - stallThresholdHours * 60 * 60 * 1000
    ).toISOString();
    const dropoffCutoff = new Date(
      now.getTime() - dropoffThresholdHours * 60 * 60 * 1000
    ).toISOString();

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

    const draftAcc: {
      user_id: string;
      current_step: number;
      updated_at: string;
      created_at: string;
    }[] = [];
    for (const chunk of chunkIds(tenantUserIds, 400)) {
      const { data: draftChunk, error: dErr } = await supabase
        .from("provider_onboarding_drafts")
        .select("user_id, current_step, updated_at, created_at")
        .in("user_id", chunk);
      if (dErr) throw dErr;
      draftAcc.push(...((draftChunk ?? []) as typeof draftAcc));
    }
    const drafts = draftAcc;

    if (!drafts || drafts.length === 0) {
      return successResponse({ stalled: [], dropped_off: [], summary: { stalled: 0, dropped_off: 0 } });
    }

    const userIds = drafts.map((d) => d.user_id);

    const { data: existingProviders } = await supabase
      .from("providers")
      .select("user_id")
      .eq("tenant_id", tenantId)
      .in("user_id", userIds);
    const providerOwnerIds = new Set(
      (existingProviders || []).map((p: { user_id: string }) => p.user_id)
    );

    const { data: users } = await supabase
      .from("users")
      .select("id, full_name, email, phone")
      .in("id", userIds);
    const userMap = new Map((users || []).map((u) => [u.id, u]));

    const { data: tracking } = await supabase
      .from("provider_onboarding_tracking")
      .select("user_id, assigned_to")
      .in("user_id", userIds);
    const trackingMap = new Map(
      (tracking || []).map((t) => [t.user_id, t])
    );

    const stalled: Array<Record<string, unknown>> = [];
    const droppedOff: Array<Record<string, unknown>> = [];

    for (const draft of drafts) {
      if (providerOwnerIds.has(draft.user_id)) continue;

      const lastActivity = draft.updated_at || draft.created_at;
      if (!lastActivity) continue;

      const user = userMap.get(draft.user_id);
      const trackingEntry = trackingMap.get(draft.user_id);

      const entry = {
        user_id: draft.user_id,
        full_name: user?.full_name || "Unknown",
        email: user?.email || null,
        phone: user?.phone || null,
        current_step: draft.current_step,
        last_activity: lastActivity,
        assigned_to: trackingEntry?.assigned_to || null,
        hours_since_activity: Math.round(
          (now.getTime() - new Date(lastActivity).getTime()) / (1000 * 60 * 60)
        ),
      };

      if (lastActivity < dropoffCutoff) {
        droppedOff.push(entry);
      } else if (lastActivity < stallCutoff) {
        stalled.push(entry);
      }
    }

    stalled.sort(
      (a, b) =>
        (b.hours_since_activity as number) -
        (a.hours_since_activity as number)
    );
    droppedOff.sort(
      (a, b) =>
        (b.hours_since_activity as number) -
        (a.hours_since_activity as number)
    );

    // Auto-SMS stalled signups if enabled
    let smsSentCount = 0;
    const autoSmsEnabled = (opsSettings.auto_sms_on_stall as boolean) === true;

    if (autoSmsEnabled && stalled.length > 0) {
      const creds = await resolveTwilioCredentials(supabase, tenantId);
      if (creds && creds.smsFrom) {
        for (const entry of stalled) {
          const phone = entry.phone as string | null;
          const name = entry.full_name as string;
          if (!phone) continue;
          if (await phoneIsDoNotContact(supabase, tenantId, phone)) continue;

          try {
            await sendTwilioSMS(
              creds,
              phone,
              `Hi ${name}, we noticed you started signing up on Beautonomi but haven't finished. Need help? Reply to this message or contact us. We'd love to have you on board!`
            );
            smsSentCount++;

            // Log the communication
            await supabase.from("provider_lead_communications").insert({
              tenant_id: tenantId,
              user_id: entry.user_id as string,
              channel: "sms",
              direction: "outbound",
              from_number: creds.smsFrom,
              to_number: phone,
              body: `Auto-stall SMS to ${name}`,
              status: "sent",
              metadata: { auto_trigger: "stall_check" },
              sent_by: null,
            });
          } catch {
            // Non-fatal — continue with other stalled signups
          }
        }
      }
    }

    return successResponse({
      stalled,
      dropped_off: droppedOff,
      summary: {
        stalled: stalled.length,
        dropped_off: droppedOff.length,
        stall_threshold_hours: stallThresholdHours,
        dropoff_threshold_hours: dropoffThresholdHours,
        auto_sms_enabled: autoSmsEnabled,
        sms_sent: smsSentCount,
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to run stall check");
  }
}
