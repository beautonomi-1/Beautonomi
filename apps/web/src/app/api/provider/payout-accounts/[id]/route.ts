import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { updateTransferRecipient } from "@/lib/payments/paystack-complete";
import { z } from "zod";

const updateAccountSchema = z.object({
  account_name: z.string().min(1).optional(),
  description: z.string().optional(),
  email: z.string().email().optional(),
  active: z.boolean().optional(),
});

/**
 * GET /api/provider/payout-accounts/[id]
 * 
 * Get a specific payout account
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { id } = await params;

    const { data: account, error } = await supabase
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
 * Update a payout account
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return notFoundResponse("Provider not found");
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

    // Get existing account
    const { data: account, error: fetchError } = await supabase
      .from("provider_payout_accounts")
      .select("*")
      .eq("id", id)
      .eq("provider_id", providerId)
      .is("deleted_at", null)
      .single();

    if (fetchError || !account) {
      return notFoundResponse("Payout account not found");
    }

    // Update in Paystack if recipient_code exists
    if (account.recipient_code && (validationResult.data.account_name || validationResult.data.email)) {
      try {
        await updateTransferRecipient(account.recipient_code, {
          name: validationResult.data.account_name || account.account_name,
          email: validationResult.data.email || undefined,
          description: validationResult.data.description || undefined,
        });
      } catch (paystackError) {
        console.error("Failed to update Paystack recipient:", paystackError);
        // Continue with database update even if Paystack update fails
      }
    }

    // Update in database
    const updateData: any = {};
    if (validationResult.data.account_name) updateData.account_name = validationResult.data.account_name;
    if (validationResult.data.description !== undefined) {
      updateData.metadata = {
        ...(account.metadata || {}),
        description: validationResult.data.description,
      };
    }
    if (validationResult.data.active !== undefined) updateData.active = validationResult.data.active;

    const { data: updatedAccount, error: updateError } = await supabase
      .from("provider_payout_accounts")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    return successResponse(updatedAccount);
  } catch (error) {
    return handleApiError(error, "Failed to update payout account");
  }
}

/**
 * DELETE /api/provider/payout-accounts/[id]
 * 
 * Delete (soft delete) a payout account
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { id } = await params;

    // Get existing account
    const { data: account, error: fetchError } = await supabase
      .from("provider_payout_accounts")
      .select("*")
      .eq("id", id)
      .eq("provider_id", providerId)
      .is("deleted_at", null)
      .single();

    if (fetchError || !account) {
      return notFoundResponse("Payout account not found");
    }

    // Soft delete in database
    const { error: deleteError } = await supabase
      .from("provider_payout_accounts")
      .update({
        active: false,
        deleted_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (deleteError) {
      throw deleteError;
    }

    // Optionally delete from Paystack (commented out to preserve history)
    // try {
    //   await deleteTransferRecipient(account.recipient_code);
    // } catch (paystackError) {
    //   console.error("Failed to delete Paystack recipient:", paystackError);
    // }

    return successResponse({ message: "Payout account deleted successfully" });
  } catch (error) {
    return handleApiError(error, "Failed to delete payout account");
  }
}
