/**
 * POST /api/me/safety/panic
 * Creates a safety event (panic) and optionally triggers Aura. Requires auth.
 */

import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["customer", "provider_owner", "provider_staff"], request);
    const body = await request.json().catch(() => ({}));
    const bookingId = (body.booking_id as string) || null;

    const supabase = getSupabaseAdmin();

    const env = (body.environment as string) || (process.env.NODE_ENV === "production" ? "production" : "development");
    const { data: safetyConfig } = await supabase
      .from("safety_module_config")
      .select("enabled, escalation_enabled")
      .eq("environment", env)
      .maybeSingle();

    if (!safetyConfig?.enabled) {
      return errorResponse("Safety module is disabled", "DISABLED", 403);
    }

    const { data: event, error: insertError } = await supabase
      .from("safety_events")
      .insert({
        user_id: user.id,
        booking_id: bookingId,
        event_type: "panic",
        status: "created",
        metadata: body.metadata ?? {},
      })
      .select("id, event_type, status, created_at")
      .single();

    if (insertError) throw insertError;

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
        } catch (e) {
          console.error("Aura dispatch error:", e);
          await supabase
            .from("safety_events")
            .update({ status: "failed", metadata: { aura_error: String((e as Error).message) }, updated_at: new Date().toISOString() })
            .eq("id", event.id);
        }
      }
    }

    return successResponse({
      id: event.id,
      event_type: event.event_type,
      status: event.status,
      created_at: event.created_at,
    });
  } catch (error) {
    return handleApiError(error as Error, "Failed to create safety event");
  }
}
