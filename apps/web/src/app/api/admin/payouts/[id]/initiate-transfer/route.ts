import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi } from "@/lib/supabase/api-helpers";
import { createTransfer, convertToSmallestUnit } from "@/lib/payments/paystack-complete";
import { writeAuditLog } from "@/lib/audit/audit";

const bodySchema = z.object({
  reason: z.string().optional().nullable(),
});

/**
 * POST /api/admin/payouts/[id]/initiate-transfer
 *
 * Initiate a Paystack transfer for a payout using the provider's active recipient_code.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["superadmin"], request);
    const { id } = await params;
    const supabase = await getSupabaseServer(request);

    if (!supabase) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Supabase client not available",
            code: "SERVER_ERROR",
          },
        },
        { status: 500 }
      );
    }
    const { reason } = bodySchema.parse(await request.json().catch(() => ({})));

    const { data: payout, error: payoutErr } = await supabase
      .from("payouts")
      .select("*")
      .eq("id", id)
      .single();
    if (payoutErr || !payout) throw payoutErr || new Error("Payout not found");

    const p = payout as any;
    if (p.status === "completed") {
      return NextResponse.json(
        { data: null, error: { message: "Payout already paid", code: "ALREADY_PAID" } },
        { status: 400 }
      );
    }

    // Load active recipient_code for provider (use latest if multiple active accounts)
    const { data: acct } = await (supabase.from("provider_payout_accounts") as any)
      .select("recipient_code, currency")
      .eq("provider_id", p.provider_id)
      .eq("active", true)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!acct?.recipient_code) {
      return NextResponse.json(
        { data: null, error: { message: "Provider payout account not set", code: "ACCOUNT_NOT_FOUND" } },
        { status: 404 }
      );
    }

    const transferRequest = {
      source: "balance" as const,
      amount: convertToSmallestUnit(Number(p.amount || 0)),
      recipient: acct.recipient_code as string,
      reason: reason || `Payout ${p.payout_number || p.id}`,
      reference: `payout_${p.id}`,
      currency: p.currency || acct.currency || "ZAR",
    };

    const paystack = await createTransfer(transferRequest);

    // Update payout to record transfer details + mark as processing
    const { data: updatedPayout, error: updateErr } = await (supabase
      .from("payouts") as any)
      .update({
        status: "processing",
        payout_provider: "paystack",
        payout_provider_transaction_id: paystack.data.transfer_code,
        payout_provider_response: paystack,
        recipient_code: acct.recipient_code,
        transfer_code: paystack.data.transfer_code,
        transfer_id: paystack.data.id,
        processed_at: new Date().toISOString(),
        processed_by: user.id,
      })
      .eq("id", id)
      .select()
      .single();

    if (updateErr || !updatedPayout) throw updateErr || new Error("Failed to update payout");

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: (user as any).role || "superadmin",
      action: "admin.payout.initiate_transfer",
      entity_type: "payout",
      entity_id: id,
      metadata: {
        provider_id: p.provider_id,
        amount: p.amount,
        currency: p.currency,
        transfer_code: paystack.data.transfer_code,
      },
    });

    return NextResponse.json({ data: { payout: updatedPayout, transfer: paystack.data }, error: null });
  } catch (error: any) {
    console.error("Error initiating payout transfer:", error);
    return NextResponse.json(
      { data: null, error: { message: error.message || "Failed to initiate transfer", code: "INTERNAL_ERROR" } },
      { status: 500 }
    );
  }
}

