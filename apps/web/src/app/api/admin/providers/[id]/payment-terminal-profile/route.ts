/**
 * GET  /api/admin/providers/:id/payment-terminal-profile
 * PUT  /api/admin/providers/:id/payment-terminal-profile
 *
 * Admin view + override of any provider's terminal profile.
 * Audited; gated on ADMIN_SECTION_COMMERCIAL.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_COMMERCIAL } from "@/lib/admin-sections";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";

const updateSchema = z.object({
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
  reason: z.string().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    await requireAdminSection(ADMIN_SECTION_COMMERCIAL, request);
    const supabase = getSupabaseAdmin();
    const providerId = params.id;

    const { data, error } = await supabase
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

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { user: adminUser } = await requireAdminSection(ADMIN_SECTION_COMMERCIAL, request);
    const supabase = getSupabaseAdmin();
    const providerId = params.id;

    const body = await request.json();
    const validation = updateSchema.safeParse(body);
    if (!validation.success) {
      return errorResponse("Validation failed", "VALIDATION_ERROR", 400, validation.error.issues);
    }
    const { reason, ...profileUpdates } = validation.data;

    // Load provider for tenant_id
    const { data: provRow } = await supabase
      .from("providers")
      .select("id, tenant_id")
      .eq("id", providerId)
      .maybeSingle();

    if (!provRow) {
      return errorResponse("Provider not found", "NOT_FOUND", 404);
    }

    // Load existing for audit
    const { data: existing } = await supabase
      .from("provider_payment_terminal_profile")
      .select("*")
      .eq("provider_id", providerId)
      .maybeSingle();

    const upsertData: Record<string, unknown> = {
      tenant_id: (provRow as { tenant_id?: string }).tenant_id,
      provider_id: providerId,
      ...profileUpdates,
      terminal_provider_other:
        profileUpdates.terminal_provider === "other"
          ? (profileUpdates.terminal_provider_other ?? null)
          : null,
      source: "superadmin_update",
      updated_by: adminUser.id,
      ...(existing ? {} : { created_by: adminUser.id }),
    };

    const { data, error } = await supabase
      .from("provider_payment_terminal_profile")
      .upsert(upsertData, { onConflict: "provider_id" })
      .select()
      .single();

    if (error) {
      return errorResponse("Failed to update terminal profile", "SAVE_ERROR", 500, error);
    }

    const reqMeta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: adminUser.id,
      actor_role: adminUser.role ?? "superadmin",
      action: existing
        ? "admin.terminal_profile.updated"
        : "admin.terminal_profile.created",
      entity_type: "provider_payment_terminal_profile",
      entity_id: providerId,
      module: "terminal_commerce",
      before_json: existing ?? undefined,
      after_json: upsertData,
      metadata: { reason: reason ?? null },
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
    });

    return successResponse({ profile: data });
  } catch (error) {
    return handleApiError(error, "Failed to update terminal profile");
  }
}
