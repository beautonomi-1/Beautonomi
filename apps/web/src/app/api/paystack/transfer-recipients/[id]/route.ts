import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/requireRole";
import {
  fetchTransferRecipient,
  updateTransferRecipient,
  deleteTransferRecipient,
  CreateTransferRecipientRequest,
} from "@/lib/payments/paystack-complete";
import { getSupabaseServer } from "@/lib/supabase/server";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { resourceTenantMatchesHostTenant } from "@/lib/bookings/resolve-payment-tenant";

/**
 * When we have a DB row for this Paystack recipient, ensure its provider is on the Host tenant.
 */
async function tenantGuardForRecipient(
  request: Request,
  tenantId: string,
  id: string,
): Promise<Response | null> {
  const supabase = await getSupabaseServer(request);
  const { data: byCode } = await supabase
    .from("provider_payout_accounts")
    .select("provider_id")
    .eq("recipient_code", id)
    .maybeSingle();
  let providerId = (byCode as { provider_id?: string } | null)?.provider_id;
  if (!providerId && /^\d+$/.test(id)) {
    const { data: byRid } = await supabase
      .from("provider_payout_accounts")
      .select("provider_id")
      .eq("recipient_id", Number(id))
      .maybeSingle();
    providerId = (byRid as { provider_id?: string } | null)?.provider_id;
  }
  if (!providerId) return null;
  const { data: prov } = await supabase
    .from("providers")
    .select("tenant_id")
    .eq("id", providerId)
    .maybeSingle();
  if (
    !resourceTenantMatchesHostTenant(
      tenantId,
      (prov as { tenant_id?: string | null } | null)?.tenant_id,
    )
  ) {
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Recipient is not in this market.",
          code: "TENANT_MISMATCH",
        },
      },
      { status: 403 },
    );
  }
  return null;
}

/**
 * GET /api/paystack/transfer-recipients/[id]
 * Fetch transfer recipient
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const tenantId = await resolveTenantIdWithZaFallback(request);
    const { id } = await params;
    const tenantBlock = await tenantGuardForRecipient(request, tenantId, id);
    if (tenantBlock) return tenantBlock;

    const response = await fetchTransferRecipient(id, { tenantId });

    return NextResponse.json({
      data: response.data,
      error: null,
    });
  } catch (error: any) {
    console.error("Error fetching transfer recipient:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: error.message || "Failed to fetch transfer recipient",
          code: "PAYSTACK_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/paystack/transfer-recipients/[id]
 * Update transfer recipient
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const tenantId = await resolveTenantIdWithZaFallback(request);
    const { id } = await params;
    const tenantBlock = await tenantGuardForRecipient(request, tenantId, id);
    if (tenantBlock) return tenantBlock;

    const body = await request.json();
    const updates: Partial<CreateTransferRecipientRequest> = {};

    if (body.name) updates.name = body.name;
    if (body.account_number) updates.account_number = body.account_number;
    if (body.bank_code) updates.bank_code = body.bank_code;
    if (body.description) updates.description = body.description;
    if (body.email) updates.email = body.email;
    if (body.metadata) updates.metadata = body.metadata;

    const response = await updateTransferRecipient(id, updates, { tenantId });

    // Update database
    const supabase = await getSupabaseServer(request);
    const accountNumber = response.data.details.account_number || "";
    const last4 = accountNumber ? accountNumber.slice(-4) : null;
    await (supabase.from("provider_payout_accounts") as any)
      .update({
        account_number_last4: last4,
        account_name: response.data.details.account_name,
        bank_code: response.data.details.bank_code,
        bank_name: response.data.details.bank_name,
        updated_at: new Date().toISOString(),
      })
      .eq("recipient_code", response.data.recipient_code);

    return NextResponse.json({
      data: response.data,
      error: null,
    });
  } catch (error: any) {
    console.error("Error updating transfer recipient:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: error.message || "Failed to update transfer recipient",
          code: "PAYSTACK_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/paystack/transfer-recipients/[id]
 * Delete transfer recipient
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const tenantId = await resolveTenantIdWithZaFallback(request);
    const { id } = await params;
    const tenantBlock = await tenantGuardForRecipient(request, tenantId, id);
    if (tenantBlock) return tenantBlock;

    await deleteTransferRecipient(id, { tenantId });

    // Update database
    const supabase = await getSupabaseServer(request);
    await (supabase.from("provider_payout_accounts") as any)
      .update({
        active: false,
        deleted_at: new Date().toISOString(),
      })
      .eq("recipient_code", id)
      .or(`recipient_id.eq.${id}`);

    return NextResponse.json({
      data: { success: true },
      error: null,
    });
  } catch (error: any) {
    console.error("Error deleting transfer recipient:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: error.message || "Failed to delete transfer recipient",
          code: "PAYSTACK_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
