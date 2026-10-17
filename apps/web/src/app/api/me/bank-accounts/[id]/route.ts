import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  notFoundResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { serializeCustomerBankAccount } from "@/lib/wallet-bank-refunds/serialize";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireRoleInApi(["customer", "provider_owner", "provider_staff", "superadmin"], request);
    const { id } = await params;
    const admin = getSupabaseAdmin();

    const { data: row } = await admin
      .from("customer_bank_accounts")
      .select("id")
      .eq("id", id)
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!row) return notFoundResponse("Bank account not found");

    const { error } = await admin
      .from("customer_bank_accounts")
      .update({ deleted_at: new Date().toISOString(), is_primary: false })
      .eq("id", id);
    if (error) throw error;

    return successResponse({ id, deleted: true });
  } catch (error) {
    return handleApiError(error, "Failed to remove bank account");
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireRoleInApi(["customer", "provider_owner", "provider_staff", "superadmin"], request);
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { is_primary?: boolean };
    const admin = getSupabaseAdmin();

    const { data: row } = await admin
      .from("customer_bank_accounts")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!row) return notFoundResponse("Bank account not found");

    if (body.is_primary === true) {
      await admin
        .from("customer_bank_accounts")
        .update({ is_primary: false })
        .eq("user_id", user.id)
        .is("deleted_at", null);
      const { data: updated, error } = await admin
        .from("customer_bank_accounts")
        .update({ is_primary: true })
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return successResponse(serializeCustomerBankAccount(updated as never));
    }

    return errorResponse("No supported fields to update", "VALIDATION_ERROR", 400);
  } catch (error) {
    return handleApiError(error, "Failed to update bank account");
  }
}
