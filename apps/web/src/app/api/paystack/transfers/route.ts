import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

import { NextResponse } from "next/server";
import { requirePaystackPayoutAdmin } from "@/lib/admin/require-paystack-payout-admin";
import {
  createTransfer,
  listTransfers,
  CreateTransferRequest,
  convertToSmallestUnit,
} from "@/lib/payments/paystack-complete";
import { getSupabaseServer } from "@/lib/supabase/server";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { resourceTenantMatchesHostTenant } from "@/lib/bookings/resolve-payment-tenant";

/**
 * GET /api/paystack/transfers
 * List transfers (provider payouts)
 */
export async function GET(request: Request) {
  try {
    const auth = await requirePaystackPayoutAdmin(request);
    if (auth.ok === false) return auth.response;

    const tenantId = await resolveTenantIdWithZaFallback(request);
    const { searchParams } = new URL(request.url);
    const perPage = searchParams.get("perPage");
    const page = searchParams.get("page");
    const status = searchParams.get("status");
    const providerId = searchParams.get("provider_id");

    if (providerId) {
      const supabase = await getSupabaseServer(request);
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
              message: "Provider is not in this market.",
              code: "TENANT_MISMATCH",
            },
          },
          { status: 403 },
        );
      }
    }

    const response = await listTransfers({
      perPage: perPage ? parseInt(perPage) : undefined,
      page: page ? parseInt(page) : undefined,
      status: status || undefined,
      tenantId,
    });

    // Filter by provider if specified
    let transfers = response.data;
    if (providerId) {
      const supabaseFilter = await getSupabaseServer(request);
      const { data: payoutAccount } = await (supabaseFilter
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
    const auth = await requirePaystackPayoutAdmin(request);
    if (auth.ok === false) return auth.response;

    const tenantId = await resolveTenantIdWithZaFallback(request);
    const tenantRegion = await getTenantRegionConfig(tenantId);
    const fallbackCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;
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

    const supabase = await getSupabaseServer(request);
    const { data: provRow } = await supabase
      .from("providers")
      .select("tenant_id")
      .eq("id", provider_id)
      .maybeSingle();
    if (
      !resourceTenantMatchesHostTenant(
        tenantId,
        (provRow as { tenant_id?: string | null } | null)?.tenant_id,
      )
    ) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Provider is not in this market.",
            code: "TENANT_MISMATCH",
          },
        },
        { status: 403 },
      );
    }

    // Get provider's transfer recipient (skips accounts still in the new-account security hold)
    const { resolveActivePayoutAccount, providerPayoutBlockedByCoolingOff } = await import(
      "@/lib/admin/validate-provider-payout-readiness"
    );
    const payoutAccount = (await resolveActivePayoutAccount(supabase, provider_id)) as
      | (Record<string, any> & { recipient_code: string; currency?: string | null })
      | null;

    if (!payoutAccount) {
      const hold = await providerPayoutBlockedByCoolingOff(supabase, provider_id);
      if (hold.blocked) {
        return NextResponse.json(
          {
            data: null,
            error: {
              message: "The provider's payout account is in its new-account security hold.",
              code: "PAYOUT_ACCOUNT_COOLING_OFF",
              details: { available_at: hold.until },
            },
          },
          { status: 409 },
        );
      }
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
      amount: convertToSmallestUnit(amount, currency || payoutAccount.currency || fallbackCurrency),
      recipient: payoutAccount.recipient_code,
      reason: reason || `Payout to provider ${provider_id}`,
      reference: reference || `payout_${provider_id}_${Date.now()}`,
      currency: currency || payoutAccount.currency || fallbackCurrency,
    };

    const response = await createTransfer(transferRequest, { tenantId });
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
