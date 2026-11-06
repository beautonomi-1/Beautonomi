import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSectionAny,
  successResponse,
  notFoundResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_FINANCE } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";
import { isAccountInCoolingOff } from "@/lib/auth/payout-cooling-off";
import { sendSecurityAlert } from "@/lib/notifications/security-notifications";

const bodySchema = z.object({
  reason: z.string().trim().min(10, "Explain how the change was confirmed with the owner (min 10 characters)."),
});

/**
 * POST /api/admin/providers/[id]/payout-accounts/[accountId]/release-hold
 * Ends the new-account security hold early (finance admins). Requires a reason; audited and the owner is alerted.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; accountId: string }> },
) {
  try {
    const { user } = await requireAdminSectionAny([ADMIN_SECTION_FINANCE], request);
    const { id: providerId, accountId } = await params;
    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0]?.message ?? "Reason required", "VALIDATION_ERROR", 400);
    }

    const admin = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const { data: provider } = await admin
      .from("providers")
      .select("id, user_id")
      .eq("id", providerId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!provider) return notFoundResponse("Provider not found");

    const { data: account } = await admin
      .from("provider_payout_accounts")
      .select("id, cooling_off_until, account_number_last4")
      .eq("id", accountId)
      .eq("provider_id", providerId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!account) return notFoundResponse("Payout account not found");

    const acct = account as { id: string; cooling_off_until: string | null; account_number_last4: string | null };
    if (!isAccountInCoolingOff(acct.cooling_off_until)) {
      return successResponse({ released: false, message: "This account has no active hold." });
    }

    const now = new Date().toISOString();
    const { error } = await admin
      .from("provider_payout_accounts")
      .update({ cooling_off_until: null, cooling_off_ready_notified_at: now })
      .eq("id", acct.id);
    if (error) throw error;

    const meta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: String(user.role ?? ""),
      action: "payout_account.hold_released",
      entity_type: "provider_payout_account",
      entity_id: acct.id,
      module: "auth_security",
      metadata: {
        provider_id: providerId,
        previous_cooling_off_until: acct.cooling_off_until,
        reason: parsed.data.reason,
      },
      ip_address: meta.ip_address,
      user_agent: meta.user_agent,
    }).catch(() => undefined);

    const ownerId = (provider as { user_id?: string | null }).user_id;
    if (ownerId) {
      await sendSecurityAlert({
        key: "security_payout_hold_released",
        userId: ownerId,
        eventId: `payout_hold_released:${acct.id}`,
        variables: { account_last4: acct.account_number_last4 ?? "****" },
      });
    }

    return successResponse({ released: true });
  } catch (error) {
    return handleApiError(error, "Failed to release payout hold");
  }
}
