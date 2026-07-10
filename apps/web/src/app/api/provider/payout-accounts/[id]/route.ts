import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { updateTransferRecipient } from "@/lib/payments/paystack-complete";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { resourceTenantMatchesHostTenant } from "@/lib/bookings/resolve-payment-tenant";
import { applyPayoutNameMatchForAccount } from "@/lib/verification/apply-payout-name-match";
import { z } from "zod";

const updateAccountSchema = z.object({
  account_name: z.string().min(1).optional(),
  description: z.string().optional(),
  email: z.string().email().optional(),
  active: z.boolean().optional(),
  is_primary: z.boolean().optional(),
});

/**
 * GET /api/provider/payout-accounts/[id]
 *
 * Get a specific payout account.
 *
 * §payout-account-fix 2026-05: read via admin client to bypass the SELECT-only
 * RLS scope mismatch; auth is enforced by `requireRoleInApi` + provider/tenant
 * ownership checks above the query.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const sessionSupabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, sessionSupabase);

    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { id } = await params;

    const admin = getSupabaseAdmin();
    const { data: account, error } = await admin
      .from("provider_payout_accounts")
      .select("*")
      .eq("id", id)
      .eq("provider_id", providerId)
      .is("deleted_at", null)
      .single();

    if (error || !account) {
      return notFoundResponse("Payout account not found");
    }

    return successResponse(account);
  } catch (error) {
    return handleApiError(error, "Failed to fetch payout account");
  }
}

/**
 * PATCH /api/provider/payout-accounts/[id]
 *
 * Update a payout account.
 *
 * §payout-account-fix 2026-05:
 * - Uses admin client for ownership-checked reads/writes.
 * - Blocks deactivating the last remaining active account so the payout
 *   setup-status step does not silently regress to incomplete.
 * - When clearing `is_primary` on the current primary, prevents leaving the
 *   provider without any primary account.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const sessionSupabase = await getSupabaseServer(request);
    const tenantId = await resolveTenantIdWithZaFallback(request);
    const providerId = await getProviderIdForUser(user.id, sessionSupabase);

    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const admin = getSupabaseAdmin();
    const { data: provRow } = await admin
      .from("providers")
      .select("tenant_id")
      .eq("id", providerId)
      .maybeSingle();
    if (
      !resourceTenantMatchesHostTenant(
        tenantId,
        (provRow as { tenant_id?: string | null } | null)?.tenant_id,
      )
    ) {
      return errorResponse(
        "Your provider account is not on this market. Use the site or app for the correct region.",
        "TENANT_MISMATCH",
        403,
      );
    }

    const { id } = await params;
    const body = await request.json();
    const validationResult = updateAccountSchema.safeParse(body);

    if (!validationResult.success) {
      return errorResponse(
        "Validation failed",
        "VALIDATION_ERROR",
        400,
        validationResult.error.issues
      );
    }

    const { data: account, error: fetchError } = await admin
      .from("provider_payout_accounts")
      .select("*")
      .eq("id", id)
      .eq("provider_id", providerId)
      .is("deleted_at", null)
      .single();

    if (fetchError || !account) {
      return notFoundResponse("Payout account not found");
    }

    // Guard against turning off the only remaining active account.
    if (validationResult.data.active === false && account.active) {
      const { count: activeCount } = await admin
        .from("provider_payout_accounts")
        .select("id", { count: "exact", head: true })
        .eq("provider_id", providerId)
        .eq("active", true)
        .is("deleted_at", null);
      if ((activeCount ?? 0) <= 1) {
        return errorResponse(
          "You must keep at least one active payout account. Add another account first.",
          "LAST_ACTIVE_ACCOUNT",
          400,
        );
      }
    }

    if (validationResult.data.is_primary === false && account.is_primary) {
      return errorResponse(
        "Set another account as primary instead of clearing the current one.",
        "PRIMARY_REQUIRED",
        400,
      );
    }

    if (account.recipient_code && (validationResult.data.account_name || validationResult.data.email)) {
      try {
        await updateTransferRecipient(
          account.recipient_code,
          {
            name: validationResult.data.account_name || account.account_name,
            email: validationResult.data.email || undefined,
            description: validationResult.data.description || undefined,
          },
          { tenantId }
        );
      } catch (paystackError) {
        console.error("Failed to update Paystack recipient:", paystackError);
        // Continue with database update even if Paystack update fails so
        // local edits don't get blocked by transient Paystack outages.
      }
    }

    const updateData: any = {};
    if (validationResult.data.account_name) updateData.account_name = validationResult.data.account_name;
    if (validationResult.data.description !== undefined) {
      updateData.metadata = {
        ...(account.metadata || {}),
        description: validationResult.data.description,
      };
    }
    if (validationResult.data.active !== undefined) updateData.active = validationResult.data.active;
    if (validationResult.data.is_primary === true) {
      await admin
        .from("provider_payout_accounts")
        .update({ is_primary: false })
        .eq("provider_id", account.provider_id)
        .neq("id", id);
      updateData.is_primary = true;
    } else if (validationResult.data.is_primary === false) {
      updateData.is_primary = false;
    }

    const { data: updatedAccount, error: updateError } = await admin
      .from("provider_payout_accounts")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    const nameForMatch =
      (updatedAccount as { account_name?: string | null })?.account_name ??
      validationResult.data.account_name;
    if (updatedAccount?.id && nameForMatch && validationResult.data.account_name) {
      try {
        await applyPayoutNameMatchForAccount(
          providerId,
          updatedAccount.id as string,
          nameForMatch,
        );
      } catch (matchErr) {
        console.warn("[payout-accounts] name match check failed:", matchErr);
      }
    }

    return successResponse(updatedAccount);
  } catch (error) {
    return handleApiError(error, "Failed to update payout account");
  }
}

/**
 * DELETE /api/provider/payout-accounts/[id]
 *
 * Soft-delete a payout account.
 *
 * §payout-account-fix 2026-05: blocks deleting the primary or last active
 * account, and reassigns primary to the next available account when deleting
 * one that happens to be primary.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const sessionSupabase = await getSupabaseServer(request);
    const tenantId = await resolveTenantIdWithZaFallback(request);
    const providerId = await getProviderIdForUser(user.id, sessionSupabase);

    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const admin = getSupabaseAdmin();
    const { data: provRow } = await admin
      .from("providers")
      .select("tenant_id")
      .eq("id", providerId)
      .maybeSingle();
    if (
      !resourceTenantMatchesHostTenant(
        tenantId,
        (provRow as { tenant_id?: string | null } | null)?.tenant_id,
      )
    ) {
      return errorResponse(
        "Your provider account is not on this market. Use the site or app for the correct region.",
        "TENANT_MISMATCH",
        403,
      );
    }

    const { id } = await params;

    const { data: account, error: fetchError } = await admin
      .from("provider_payout_accounts")
      .select("*")
      .eq("id", id)
      .eq("provider_id", providerId)
      .is("deleted_at", null)
      .single();

    if (fetchError || !account) {
      return notFoundResponse("Payout account not found");
    }

    const { data: otherAccounts } = await admin
      .from("provider_payout_accounts")
      .select("id, is_primary, active")
      .eq("provider_id", providerId)
      .is("deleted_at", null)
      .neq("id", id);

    if (account.is_primary && (otherAccounts?.length ?? 0) === 0) {
      return errorResponse(
        "Add another payout account before removing your only account.",
        "PRIMARY_REQUIRED",
        400,
      );
    }

    const { error: deleteError } = await admin
      .from("provider_payout_accounts")
      .update({
        active: false,
        is_primary: false,
        deleted_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (deleteError) {
      throw deleteError;
    }

    // If we just removed the primary, promote the next-best account so the
    // provider always has a primary on file.
    if (account.is_primary) {
      const nextPrimary =
        otherAccounts?.find((a: { active: boolean }) => a.active) ?? otherAccounts?.[0];
      if (nextPrimary) {
        await admin
          .from("provider_payout_accounts")
          .update({ is_primary: true })
          .eq("id", nextPrimary.id);
      }
    }

    return successResponse({ message: "Payout account removed successfully." });
  } catch (error) {
    return handleApiError(error, "Failed to delete payout account");
  }
}
