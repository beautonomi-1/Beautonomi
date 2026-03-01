import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { z } from "zod";

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
    const { data: config } = await admin
      .from("on_demand_module_config")
      .select("provider_accept_window_seconds")
      .eq("environment", "production")
      .maybeSingle();

    const windowSeconds = Number(config?.provider_accept_window_seconds ?? 30);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + windowSeconds * 1000);

    const key =
      idempotency_key ??
      `od-${user.id}-${provider_id}-${now.toISOString().slice(0, 13)}`;

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
    return successResponse(row);
  } catch (error) {
    return handleApiError(error as Error, "Failed to create on-demand request");
  }
}
