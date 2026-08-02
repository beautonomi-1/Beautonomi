/**
 * POST /api/me/safety/panic
 * Creates a safety event (panic) and optionally triggers Aura. Requires auth.
 *
 * Gating matches the client `SafetyPanicButton`s exactly:
 * `safety_module_config.enabled` AND the `safety.panic.enabled` feature flag.
 * Every accepted panic also raises a real-time Slack ops alert (best effort).
 */

import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isFeatureEnabledServer } from "@/lib/server/feature-flags";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { slackNotifySafetyPanic } from "@/lib/integrations/slack/ops-triggers";

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["customer", "provider_owner", "provider_staff"], request);
    const body = await request.json().catch(() => ({}));
    const bookingId = (body.booking_id as string) || null;

    const supabase = getSupabaseAdmin();
    const tenantId = await resolveTenantIdWithZaFallback(request).catch(() => null);

    const env = (body.environment as string) || (process.env.NODE_ENV === "production" ? "production" : "development");
    const [{ data: safetyConfig }, panicFlagEnabled] = await Promise.all([
      supabase
        .from("safety_module_config")
        .select("enabled, escalation_enabled")
        .eq("environment", env)
        .maybeSingle(),
      isFeatureEnabledServer("safety.panic.enabled", tenantId),
    ]);

    if (!safetyConfig?.enabled || !panicFlagEnabled) {
      return errorResponse("Safety module is disabled", "DISABLED", 403);
    }

    const requestMetadata =
      body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
        ? (body.metadata as Record<string, unknown>)
        : {};

    const { data: profile } = await supabase
      .from("users")
      .select(
        "emergency_contact_name, emergency_contact_phone, emergency_contact_relationship",
      )
      .eq("id", user.id)
      .maybeSingle();

    const emergencyContact =
      profile &&
      (profile.emergency_contact_name ||
        profile.emergency_contact_phone ||
        profile.emergency_contact_relationship)
        ? {
            name: profile.emergency_contact_name ?? null,
            phone: profile.emergency_contact_phone ?? null,
            relationship: profile.emergency_contact_relationship ?? null,
          }
        : null;

    const eventMetadata = {
      ...requestMetadata,
      ...(emergencyContact ? { emergency_contact: emergencyContact } : {}),
    };

    const { data: event, error: insertError } = await supabase
      .from("safety_events")
      .insert({
        user_id: user.id,
        booking_id: bookingId,
        event_type: "panic",
        status: "created",
        metadata: eventMetadata,
      })
      .select("id, event_type, status, created_at")
      .single();

    if (insertError) throw insertError;

    let auraDispatched = false;
    if (safetyConfig.escalation_enabled) {
      const { data: auraConfig } = await supabase
        .from("aura_integration_config")
        .select("enabled, api_key_secret, org_id")
        .eq("environment", env)
        .maybeSingle();

      if (auraConfig?.enabled && auraConfig.api_key_secret) {
        try {
          const auraRes = await fetch("https://api.aura.security/v1/incidents", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${auraConfig.api_key_secret}`,
              "X-Aura-Org-Id": (auraConfig.org_id as string) || "",
            },
            body: JSON.stringify({
              user_id: user.id,
              booking_id: bookingId,
              type: "panic",
              source: "beautonomi",
            }),
          });
          const auraId = auraRes.ok ? ((await auraRes.json()) as { id?: string })?.id : null;
          await supabase
            .from("safety_events")
            .update({ status: "dispatched", aura_request_id: auraId ?? null, updated_at: new Date().toISOString() })
            .eq("id", event.id);
          auraDispatched = true;
        } catch (e) {
          console.error("Aura dispatch error:", e);
          // Preserve the original request metadata (source etc.) alongside the error.
          await supabase
            .from("safety_events")
            .update({
              status: "failed",
              metadata: { ...requestMetadata, aura_error: String((e as Error).message) },
              updated_at: new Date().toISOString(),
            })
            .eq("id", event.id);
        }
      }
    }

    if (tenantId) {
        slackNotifySafetyPanic({
          tenantId,
          eventId: event.id,
          userId: user.id,
          bookingId,
          source: typeof requestMetadata.source === "string" ? requestMetadata.source : null,
          auraDispatched,
          emergencyContact,
        });
    }

    return successResponse({
      id: event.id,
      event_id: event.id,
      event_type: event.event_type,
      status: event.status,
      created_at: event.created_at,
    });
  } catch (error) {
    return handleApiError(error as Error, "Failed to create safety event");
  }
}
