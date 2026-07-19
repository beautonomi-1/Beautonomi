import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  errorResponse,
  handleApiError,
  notFoundResponse,
  requireRoleInApi,
  successResponse,
} from "@/lib/supabase/api-helpers";
import { computePaycloudReadiness } from "@/lib/payments/paycloud-readiness";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { writeAuditLog } from "@/lib/audit/audit";
import { z } from "zod";

const patchSchema = z.object({
  accept_paycloud: z.boolean().optional(),
  qr_payments_enabled: z.boolean().optional(),
  cashback_enabled: z.boolean().optional(),
});

/**
 * GET /api/admin/providers/[id]/paycloud
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireRoleInApi(["superadmin"], _request);
    const { id: providerId } = await params;
    const supabase = getSupabaseAdmin();

    const { data: provider } = await supabase
      .from("providers")
      .select("id, business_name, accept_paycloud, tenant_id")
      .eq("id", providerId)
      .maybeSingle();
    if (!provider) return notFoundResponse("Provider not found");

    const scopedTenantId = await resolveAdminApiTenantId(_request);
    if (scopedTenantId && (provider as { tenant_id?: string }).tenant_id !== scopedTenantId) {
      return notFoundResponse("Provider not found");
    }

    const readiness = await computePaycloudReadiness(supabase, providerId);

    const { data: terminals } = await (supabase.from("paycloud_terminals") as any)
      .select(
        `
          *,
          merchant:paycloud_merchants(id, label, merchant_no, store_no, environment),
          location:provider_locations(id, name)
        `,
      )
      .eq("provider_id", providerId)
      .not("status", "eq", "decommissioned")
      .order("display_name");

    const merchants = Array.from(
      new Map(
        (terminals ?? [])
          .map((t: { merchant?: { id: string } | null }) => t.merchant)
          .filter(Boolean)
          .map((m: { id: string }) => [m.id, m]),
      ).values(),
    );

    const { data: recentPayments } = await supabase
      .from("provider_paycloud_payments")
      .select(
        "id, merchant_order_no, amount, expected_amount, status, amount_match_status, entity_type, entity_id, created_at",
      )
      .eq("provider_id", providerId)
      .order("created_at", { ascending: false })
      .limit(10);

    return successResponse({
      provider,
      readiness,
      merchants,
      terminals: terminals ?? [],
      recent_payments: recentPayments ?? [],
    });
  } catch (error) {
    return handleApiError(error, "Failed to load provider PayCloud status");
  }
}

/**
 * PATCH /api/admin/providers/[id]/paycloud
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireRoleInApi(["superadmin"], request);
    const { id: providerId } = await params;
    const supabase = getSupabaseAdmin();
    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return errorResponse(
        parsed.error.issues.map((i) => i.message).join(", "),
        "VALIDATION_ERROR",
        400,
      );
    }

    const { data: provider } = await supabase
      .from("providers")
      .select("id, tenant_id")
      .eq("id", providerId)
      .maybeSingle();
    if (!provider) return notFoundResponse("Provider not found");

    const scopedTenantId = await resolveAdminApiTenantId(request);
    if (scopedTenantId && (provider as { tenant_id?: string }).tenant_id !== scopedTenantId) {
      return notFoundResponse("Provider not found");
    }

    if (parsed.data.accept_paycloud !== undefined) {
      await supabase
        .from("providers")
        .update({ accept_paycloud: parsed.data.accept_paycloud })
        .eq("id", providerId);
    }

    const settingsPayload: Record<string, unknown> = {
      provider_id: providerId,
      tenant_id: (provider as { tenant_id?: string }).tenant_id,
      updated_at: new Date().toISOString(),
    };
    if (parsed.data.accept_paycloud !== undefined) {
      settingsPayload.accept_paycloud = parsed.data.accept_paycloud;
    }
    if (parsed.data.qr_payments_enabled !== undefined) {
      settingsPayload.qr_payments_enabled = parsed.data.qr_payments_enabled;
    }
    if (parsed.data.cashback_enabled !== undefined) {
      settingsPayload.cashback_enabled = parsed.data.cashback_enabled;
    }

    await supabase.from("provider_paycloud_settings").upsert(settingsPayload, { onConflict: "provider_id" });

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: (user as { role?: string }).role ?? "superadmin",
      action: "admin.provider.paycloud.updated",
      entity_type: "providers",
      entity_id: providerId,
      metadata: { fields: Object.keys(parsed.data) },
    });

    const readiness = await computePaycloudReadiness(supabase, providerId);
    return successResponse({ updated: true, readiness });
  } catch (error) {
    return handleApiError(error, "Failed to update provider PayCloud settings");
  }
}
