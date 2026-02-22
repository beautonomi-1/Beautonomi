import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/requireRole";
import {
  createTransfer,
  listTransfers,
  CreateTransferRequest,
  convertToSmallestUnit,
} from "@/lib/payments/paystack-complete";
import { getSupabaseServer } from "@/lib/supabase/server";

/**
 * GET /api/paystack/transfers
 * List transfers (provider payouts)
 */
export async function GET(request: Request) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const perPage = searchParams.get("perPage");
    const page = searchParams.get("page");
    const status = searchParams.get("status");
    const providerId = searchParams.get("provider_id");

    const response = await listTransfers({
      perPage: perPage ? parseInt(perPage) : undefined,
      page: page ? parseInt(page) : undefined,
      status: status || undefined,
    });

    // Filter by provider if specified
    let transfers = response.data;
    if (providerId) {
      const supabase = await getSupabaseServer();
      const { data: payoutAccount } = await (supabase
        .from("provider_payout_accounts") as any)
        .select("recipient_code")
        .eq("provider_id", providerId)
        .eq("active", true)
        .single();

      if (payoutAccount) {
        transfers = transfers.filter(
          (t: any) => t.recipient === payoutAccount.recipient_code
        );
      }
    }

    return NextResponse.json({
      data: transfers,
      error: null,
    });
  } catch (error: any) {
    console.error("Error listing transfers:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: error.message || "Failed to list transfers",
          code: "PAYSTACK_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/paystack/transfers
 * Create transfer (provider payout)
 */
export async function POST(request: Request) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { provider_id, amount, reason, reference, currency } = body;

    // Validate required fields
    if (!provider_id || !amount) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Missing required fields: provider_id, amount",
            code: "VALIDATION_ERROR",
          },
        },
        { status: 400 }
      );
    }

    // Get provider's transfer recipient
    const supabase = await getSupabaseServer();
    const { data: payoutAccount, error: accountError } = await (supabase
      .from("provider_payout_accounts") as any)
      .select("*")
      .eq("provider_id", provider_id)
      .eq("active", true)
      .single();

    if (accountError || !payoutAccount) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Provider payout account not found or inactive",
            code: "ACCOUNT_NOT_FOUND",
          },
        },
        { status: 404 }
      );
    }

    // Create transfer request
    const transferRequest: CreateTransferRequest = {
      source: "balance",
      amount: convertToSmallestUnit(amount),
      recipient: payoutAccount.recipient_code,
      reason: reason || `Payout to provider ${provider_id}`,
      reference: reference || `payout_${provider_id}_${Date.now()}`,
      currency: currency || payoutAccount.currency || "ZAR",
    };

    const response = await createTransfer(transferRequest);
    // Note: this route is a Paystack utility endpoint. The canonical payout queue flow
    // is handled via /api/admin/payouts/[id]/initiate-transfer which updates the payouts table.

    return NextResponse.json({
      data: response.data,
      error: null,
    });
  } catch (error: any) {
    console.error("Error creating transfer:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: error.message || "Failed to create transfer",
          code: "PAYSTACK_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
