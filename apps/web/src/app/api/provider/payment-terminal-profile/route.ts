/**
 * GET  /api/provider/payment-terminal-profile
 *   Returns the current provider's terminal profile (or null if not yet captured).
 *
 * PUT  /api/provider/payment-terminal-profile
 *   Upserts the terminal profile (source = profile_update).
 *
 * Gated by feature flag provider_terminal_capture_enabled (default ON).
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import { isFeatureEnabledServer } from "@/lib/server/feature-flags";
import { FEATURE_FLAG_KEYS } from "@/lib/server/feature-flag-keys";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";

const terminalProfileSchema = z.object({
  has_payment_terminal: z.boolean().optional().nullable(),
  terminal_ownership_status: z.enum([
    "has_terminal", "no_terminal", "planning_to_get_terminal", "unsure",
  ]).optional().nullable(),
  terminal_provider: z.string().optional().nullable(),
  terminal_provider_other: z.string().optional().nullable(),
  terminal_count_range: z.enum([
    "one", "two_to_three", "four_to_ten", "more_than_ten", "unsure",
  ]).optional().nullable(),
  terminal_active_usage_status: z.enum(["yes", "no", "sometimes", "unsure"]).optional().nullable(),
  interested_in_platform_terminal: z.enum(["yes", "maybe_later", "no"]).optional().nullable(),
  interested_in_terminal_subscription: z.boolean().optional().nullable(),
  interested_in_integrated_payments: z.boolean().optional().nullable(),
});

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const supabaseAdmin = getServiceClient();

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return errorResponse("Provider not found", "PROVIDER_NOT_FOUND", 404);
    }

    // Resolve tenant for feature flag check
    const { data: provRow } = await supabaseAdmin
      .from("providers")
      .select("tenant_id")
      .eq("id", providerId)
      .maybeSingle();
    const tenantId = (provRow as { tenant_id?: string } | null)?.tenant_id ?? null;

    const captureEnabled = await isFeatureEnabledServer(
      FEATURE_FLAG_KEYS.PROVIDER_TERMINAL_CAPTURE,
      tenantId,
    );
    if (!captureEnabled) {
      return errorResponse("Terminal profile capture is not available.", "FEATURE_DISABLED", 403);
    }

    const { data, error } = await supabaseAdmin
      .from("provider_payment_terminal_profile")
      .select("*")
      .eq("provider_id", providerId)
      .maybeSingle();

    if (error) {
      return errorResponse("Failed to load terminal profile", "LOAD_ERROR", 500, error);
    }

    return successResponse({ profile: data ?? null });
  } catch (error) {
    return handleApiError(error, "Failed to load terminal profile");
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const supabaseAdmin = getServiceClient();

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return errorResponse("Provider not found", "PROVIDER_NOT_FOUND", 404);
    }

    const { data: provRow } = await supabaseAdmin
      .from("providers")
      .select("tenant_id")
      .eq("id", providerId)
      .maybeSingle();
    const tenantId = (provRow as { tenant_id?: string } | null)?.tenant_id ?? null;

    const captureEnabled = await isFeatureEnabledServer(
      FEATURE_FLAG_KEYS.PROVIDER_TERMINAL_CAPTURE,
      tenantId,
    );
    if (!captureEnabled) {
      return errorResponse("Terminal profile capture is not available.", "FEATURE_DISABLED", 403);
    }

    const body = await request.json();
    const validation = terminalProfileSchema.safeParse(body);
    if (!validation.success) {
      return errorResponse("Validation failed", "VALIDATION_ERROR", 400, validation.error.issues);
    }

    const updates = validation.data;

    // Load existing for audit diff
    const { data: existing } = await supabaseAdmin
      .from("provider_payment_terminal_profile")
      .select("*")
      .eq("provider_id", providerId)
      .maybeSingle();

    const upsertData: Record<string, unknown> = {
      tenant_id: tenantId,
      provider_id: providerId,
      ...updates,
      terminal_provider_other:
        updates.terminal_provider === "other"
          ? (updates.terminal_provider_other ?? null)
          : null,
      source: "profile_update",
      updated_by: user.id,
      ...(existing ? {} : { created_by: user.id }),
    };

    const { data, error } = await supabaseAdmin
      .from("provider_payment_terminal_profile")
      .upsert(upsertData, { onConflict: "provider_id" })
      .select()
      .single();

    if (error) {
      return errorResponse("Failed to save terminal profile", "SAVE_ERROR", 500, error);
    }

    const reqMeta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "provider_owner",
      action: existing
        ? "provider.terminal_profile.updated"
        : "provider.terminal_profile.created",
      entity_type: "provider_payment_terminal_profile",
      entity_id: (data as { id?: string }).id ?? providerId,
      module: "terminal_commerce",
      before_json: existing ?? undefined,
      after_json: upsertData,
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
    });

    return successResponse({ profile: data });
  } catch (error) {
    return handleApiError(error, "Failed to save terminal profile");
  }
}
