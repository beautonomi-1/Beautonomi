import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { z } from "zod";

type OnDemandModuleEnv = "production" | "staging" | "development";

/** Match `on_demand_module_config.environment` — never hard-code production only (preview/staging rows exist). */
function resolveOnDemandModuleEnvironment(): OnDemandModuleEnv {
  const explicit = process.env.ON_DEMAND_CONFIG_ENV?.trim().toLowerCase();
  if (explicit === "production" || explicit === "staging" || explicit === "development") {
    return explicit;
  }
  if (process.env.VERCEL_ENV === "production") return "production";
  if (process.env.VERCEL_ENV === "preview") return "staging";
  if (process.env.VERCEL_ENV === "development") return "development";
  return process.env.NODE_ENV === "production" ? "production" : "development";
}

async function fetchProviderAcceptWindowSeconds(admin: ReturnType<typeof getSupabaseAdmin>): Promise<number> {
  const primary = resolveOnDemandModuleEnvironment();
  const order: OnDemandModuleEnv[] = [primary, "production", "staging", "development"];
  const seen = new Set<OnDemandModuleEnv>();
  for (const env of order) {
    if (seen.has(env)) continue;
    seen.add(env);
    const { data } = await admin
      .from("on_demand_module_config")
      .select("provider_accept_window_seconds")
      .eq("environment", env)
      .maybeSingle();
    const w = Number((data as { provider_accept_window_seconds?: number } | null)?.provider_accept_window_seconds);
    if (Number.isFinite(w) && w > 0) return Math.floor(w);
  }
  return 30;
}

const createRequestSchema = z.object({
  provider_id: z.string().uuid("Invalid provider ID"),
  request_payload: z.record(z.string(), z.unknown()).or(z.object({}).passthrough()),
  idempotency_key: z.string().min(1).optional(),
});

/**
 * POST /api/me/on-demand/requests
 * Create an on-demand request (customer). Idempotent by idempotency_key.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request
    );
    const body = await request.json();
    const parsed = createRequestSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        parsed.error.issues.map((i) => i.message).join(", "),
        "VALIDATION_ERROR",
        400
      );
    }
    const { provider_id, request_payload, idempotency_key } = parsed.data;

    const admin = getSupabaseAdmin();

    const { data: obSettings } = await admin
      .from("provider_online_booking_settings")
      .select("on_demand_accept_enabled")
      .eq("provider_id", provider_id)
      .maybeSingle();
    if (!obSettings?.on_demand_accept_enabled) {
      return errorResponse(
        "This provider does not accept on-demand requests.",
        "PROVIDER_ON_DEMAND_DISABLED",
        400
      );
    }

    const windowSeconds = await fetchProviderAcceptWindowSeconds(admin);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + windowSeconds * 1000);

    const headerKey =
      request.headers.get("idempotency-key")?.trim() ||
      request.headers.get("x-idempotency-key")?.trim() ||
      null;
    const key = idempotency_key?.trim() || headerKey || `od-${user.id}-${provider_id}-${randomUUID()}`;

    const supabase = await getSupabaseServer(request);
    const { data: existing } = await supabase
      .from("on_demand_requests")
      .select("*")
      .eq("idempotency_key", key)
      .maybeSingle();

    if (existing) {
      return successResponse(existing);
    }

    const { data: row, error } = await supabase
      .from("on_demand_requests")
      .insert({
        provider_id,
        customer_id: user.id,
        status: "requested",
        expires_at: expiresAt.toISOString(),
        request_payload: request_payload ?? {},
        idempotency_key: key,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        const { data: existingRow } = await supabase
          .from("on_demand_requests")
          .select("*")
          .eq("idempotency_key", key)
          .maybeSingle();
        if (existingRow) return successResponse(existingRow);
      }
      throw error;
    }

    // Notify provider app (owner + staff) so they get a push when app is closed/background
    try {
      const { data: providerRow } = await admin
        .from("providers")
        .select("user_id")
        .eq("id", provider_id)
        .single();
      const { data: staffRows } = await admin
        .from("provider_staff")
        .select("user_id")
        .eq("provider_id", provider_id)
        .eq("is_active", true);
      const userIds = new Set<string>();
      if (providerRow?.user_id) userIds.add(providerRow.user_id);
      (staffRows || []).forEach((s: { user_id: string }) => {
        if (s.user_id) userIds.add(s.user_id);
      });
      if (userIds.size > 0) {
        const { sendToUsers } = await import("@/lib/notifications/onesignal");
        await sendToUsers(
          Array.from(userIds),
          {
            title: "Incoming booking request",
            message: "A client is requesting a booking now. Open to accept or decline.",
            data: {
              type: "on_demand_incoming",
              id: row.id,
              on_demand_request_id: row.id,
            },
            priority: 10,
            ios_interruption_level: "time_sensitive",
          },
          ["push"],
          { appType: "provider", supabaseClient: admin }
        );
      }
    } catch (pushErr) {
      console.error("Failed to send on-demand incoming push to provider:", pushErr);
    }

    return successResponse(row);
  } catch (error) {
    return handleApiError(error as Error, "Failed to create on-demand request");
  }
}
