import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { unauthorizedResponse } from "@/lib/auth/requireRole";
import { requireAdminSection, successResponse, errorResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDERS_OPERATIONS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { writeAuditLog } from "@/lib/audit/audit";
import { syncProviderVerificationState } from "@/lib/verification/sync-provider-verification";
import { clearIdentityVerificationForReverify } from "@/lib/verification/clear-identity-verification-for-reverify";
import { invalidatePublicProviderCache } from "@/lib/providers/invalidate-public-provider-cache";
import { z } from "zod";

const bulkActionSchema = z.object({
  provider_ids: z.array(z.string().uuid()).min(1, "At least one provider ID is required"),
  action: z.enum(["approve", "suspend", "reject", "verify", "unverify"]),
  reason: z.string().optional().nullable(),
});

/**
 * POST /api/admin/providers/bulk
 * 
 * Perform bulk actions on providers
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_PROVIDERS_OPERATIONS, request);
    if (!user) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveAdminApiTenantId(request);
    const body = await request.json();

    // Validate request body
    const validationResult = bulkActionSchema.safeParse(body);
    if (!validationResult.success) {
      return errorResponse(
        "Validation failed",
        "VALIDATION_ERROR",
        400
      );
    }

    const { provider_ids, action, reason } = validationResult.data;

    const results = { success: 0, failed: 0, errors: [] as string[] };

    if (action === "verify" || action === "unverify") {
      const admin = getSupabaseAdmin();
      const { data: providers, error: providerError } = await admin
        .from("providers")
        .select("id, user_id")
        .in("id", provider_ids)
        .eq("tenant_id", tenantId);

      if (providerError) throw providerError;

      for (const provider of providers ?? []) {
        const p = provider as { id: string; user_id?: string | null };
        const syncResult =
          action === "verify"
            ? await syncProviderVerificationState(admin, {
                providerId: p.id,
                userId: p.user_id ?? null,
                status: "approved",
                source: "manual_admin",
                metadata: {
                  admin_bulk_action: action,
                  reviewed_by_user_id: user.id,
                  reason: reason ?? null,
                },
              })
            : await clearIdentityVerificationForReverify(admin, {
                userId: p.user_id ?? "",
                providerId: p.id,
                adminUserId: user.id,
                reason: reason ?? undefined,
                metadata: {
                  admin_bulk_action: action,
                  reviewed_by_user_id: user.id,
                },
              });
        if (syncResult.ok) {
          results.success += 1;
        } else {
          results.failed += 1;
          results.errors.push(`${p.id}: ${syncResult.errors.join("; ")}`);
        }
      }
      results.failed += provider_ids.length - (providers?.length ?? 0);
    } else {
      let updateData: Record<string, unknown> = {};

      switch (action) {
        case "approve":
          updateData = { status: "active" };
          break;
        case "suspend":
          updateData = { status: "suspended" };
          break;
        case "reject":
          // `provider_status` has no `rejected` member; store as suspended.
          // The rejection reason is persisted via the audit log below.
          updateData = { status: "suspended" };
          break;
      }

      // Perform bulk update (only rows in this admin tenant)
      const { data: updatedRows, error: updateError } = await supabase
        .from("providers")
        .update(updateData)
        .in("id", provider_ids)
        .eq("tenant_id", tenantId)
        .select("id");

      if (updateError) {
        throw updateError;
      }

      const n = updatedRows?.length ?? 0;
      results.success = n;
      results.failed = provider_ids.length - n;
    }

    if (action === "approve" || action === "suspend" || action === "reject") {
      invalidatePublicProviderCache(tenantId);
    }

    // Log audit trail
    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "superadmin",
      action: `admin.providers.bulk.${action}`,
      entity_type: "provider",
      entity_id: provider_ids.join(","),
      metadata: { provider_ids, action, reason, count: provider_ids.length },
    });

    return successResponse({
      success: true,
      results,
    });
  } catch (error) {
    return handleApiError(error, "Failed to perform bulk action");
  }
}
