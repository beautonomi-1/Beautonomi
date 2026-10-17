import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_FINANCE } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import {
  getEffectiveWalletBankRefundSettings,
  setWalletBankRefundSettingsForScope,
} from "@/lib/wallet-bank-refunds/settings";
import { writeAuditLog } from "@/lib/audit/audit";

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  min_amount: z.number().nonnegative().optional(),
  max_amount_per_request: z.number().positive().nullable().optional(),
  fee_type: z.enum(["fixed", "percentage"]).optional(),
  fee_value: z.number().nonnegative().max(100000).optional(),
  sla_business_days: z.number().int().min(1).max(30).optional(),
  help_text: z.string().max(2000).nullable().optional(),
  scope: z.enum(["tenant", "global"]).optional(),
});

export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    const tenantId = await resolveAdminApiTenantId(request);
    const supabase = getSupabaseAdmin();
    const settings = await getEffectiveWalletBankRefundSettings(supabase, tenantId);
    return successResponse({ settings, tenant_id: tenantId });
  } catch (error) {
    return handleApiError(error, "Failed to load wallet bank refund settings");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    const tenantId = await resolveAdminApiTenantId(request);
    const supabase = getSupabaseAdmin();
    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("Validation failed", "VALIDATION_ERROR", 400);
    }

    const scopeTenantId = parsed.data.scope === "global" ? null : tenantId;
    const { scope: _scope, ...patch } = parsed.data;
    await setWalletBankRefundSettingsForScope(supabase, scopeTenantId, patch);

    await writeAuditLog({
      actor_user_id: user.id,
      action: "wallet_bank_refund_settings_update",
      entity_type: "platform_settings",
      entity_id: scopeTenantId ?? "global",
      metadata: patch,
      retention_tier: "financial",
    });

    const settings = await getEffectiveWalletBankRefundSettings(supabase, tenantId);
    return successResponse({ settings });
  } catch (error) {
    return handleApiError(error, "Failed to update wallet bank refund settings");
  }
}
