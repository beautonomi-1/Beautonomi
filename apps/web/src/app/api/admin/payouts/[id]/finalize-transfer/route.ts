import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_FINANCE } from "@/lib/admin-sections";
import { finalizeTransfer } from "@/lib/payments/paystack-complete";
import { writeAuditLog } from "@/lib/audit/audit";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { fetchProviderInAdminTenant } from "@/lib/tenant/admin-booking-tenant";

const bodySchema = z.object({
  otp: z.string().trim().min(4).max(12),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    const { id } = await params;
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const body = bodySchema.safeParse(await request.json().catch(() => ({})));

    if (!body.success) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Enter the Paystack transfer OTP.",
            code: "VALIDATION_ERROR",
            details: body.error.issues,
          },
        },
        { status: 400 }
      );
    }

    const { data: payout, error: payoutErr } = await supabase
      .from("payouts")
      .select("*")
      .eq("id", id)
      .single();
    if (payoutErr || !payout) {
      return NextResponse.json(
        { data: null, error: { message: "Payout not found", code: "NOT_FOUND" } },
        { status: 404 }
      );
    }

    type PayoutRow = {
      id: string;
      provider_id: string;
      status: string;
      amount?: number | null;
      currency?: string | null;
      transfer_code?: string | null;
      payout_provider_response?: unknown;
    };
    const p = payout as PayoutRow;

    const provCheck = await fetchProviderInAdminTenant(supabase, p.provider_id, tenantId, "id");
    if ("error" in provCheck) {
      const st = provCheck.error.status;
      return NextResponse.json(
        {
          data: null,
          error: {
            message: st === 403 ? "Payout belongs to another market" : "Provider not found",
            code: st === 403 ? "TENANT_MISMATCH" : "NOT_FOUND",
          },
        },
        { status: st }
      );
    }

    if (p.status !== "processing") {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: `Cannot finalize transfer for payout in status "${p.status}".`,
            code: "INVALID_STATE",
          },
        },
        { status: 400 }
      );
    }

    if (!p.transfer_code) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "No Paystack transfer has been initiated for this payout.",
            code: "TRANSFER_NOT_INITIATED",
          },
        },
        { status: 409 }
      );
    }

    const paystack = await finalizeTransfer(p.transfer_code, body.data.otp, { tenantId });
    if (!paystack.status || !paystack.data?.transfer_code) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: paystack.message || "Paystack did not finalize the transfer.",
            code: "PAYSTACK_TRANSFER_FINALIZE_FAILED",
          },
        },
        { status: 400 }
      );
    }

    const { data: updatedPayout, error: updateErr } = await supabase
      .from("payouts")
      .update({
        payout_provider_response: paystack,
        transfer_code: paystack.data.transfer_code,
        transfer_id: paystack.data.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();
    if (updateErr || !updatedPayout) {
      throw updateErr || new Error("Failed to update payout after transfer finalization");
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "superadmin",
      action: "admin.payout.finalize_transfer",
      entity_type: "payout",
      entity_id: id,
      metadata: {
        provider_id: p.provider_id,
        amount: p.amount,
        currency: p.currency,
        transfer_code: paystack.data.transfer_code,
        paystack_status: paystack.data.status,
      },
    });

    return NextResponse.json({
      data: { payout: updatedPayout, transfer: paystack.data },
      error: null,
    });
  } catch (error: unknown) {
    console.error("Error finalizing payout transfer:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: error instanceof Error ? error.message : "Failed to finalize transfer",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
