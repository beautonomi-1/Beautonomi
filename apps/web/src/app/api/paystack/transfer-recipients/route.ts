import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/requireRole";
import {
  createTransferRecipient,
  listTransferRecipients,
  bulkCreateTransferRecipients,
  CreateTransferRecipientRequest,
} from "@/lib/payments/paystack-complete";
import { getSupabaseServer } from "@/lib/supabase/server";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { resourceTenantMatchesHostTenant } from "@/lib/bookings/resolve-payment-tenant";

/**
 * GET /api/paystack/transfer-recipients
 * List transfer recipients (for provider payouts)
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

    const tenantId = await resolveTenantIdWithZaFallback(request);
    const { searchParams } = new URL(request.url);
    const perPage = searchParams.get("perPage");
    const page = searchParams.get("page");

    const response = await listTransferRecipients({
      perPage: perPage ? parseInt(perPage) : undefined,
      page: page ? parseInt(page) : undefined,
      tenantId,
    });

    return NextResponse.json({
      data: response.data,
      error: null,
    });
  } catch (error: any) {
    console.error("Error listing transfer recipients:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: error.message || "Failed to list transfer recipients",
          code: "PAYSTACK_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/paystack/transfer-recipients
 * Create transfer recipient (for provider payout)
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

    const tenantId = await resolveTenantIdWithZaFallback(request);
    const tenantRegion = await getTenantRegionConfig(tenantId);
    const fallbackCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;
    const body = await request.json();
    const {
      provider_id,
      type,
      name,
      account_number,
      bank_code,
      currency,
      description,
      email,
      metadata,
    } = body;

    // Validate required fields
    if (!provider_id || !type || !name || !account_number || !bank_code) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Missing required fields: provider_id, type, name, account_number, bank_code",
            code: "VALIDATION_ERROR",
          },
        },
        { status: 400 }
      );
    }

    const supabaseForTenant = await getSupabaseServer(request);
    const { data: provRow } = await supabaseForTenant
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

    // Create transfer recipient request
    const recipientRequest: CreateTransferRecipientRequest = {
      type: type as "nuban" | "basa" | "mobile_money" | "barter",
      name,
      account_number,
      bank_code,
      currency: currency || fallbackCurrency,
      description: description || `Payout recipient for provider ${provider_id}`,
      email,
      metadata: {
        provider_id,
        ...metadata,
      },
    };

    const response = await createTransferRecipient(recipientRequest, { tenantId });

    // Store recipient in database
    const supabase = supabaseForTenant;
    const accountNumber = response.data.details.account_number || "";
    const last4 = accountNumber ? accountNumber.slice(-4) : null;
    await (supabase.from("provider_payout_accounts") as any).upsert({
      provider_id,
      recipient_code: response.data.recipient_code,
      recipient_id: response.data.id,
      type: response.data.type,
      account_number_last4: last4,
      account_name: response.data.details.account_name,
      bank_code: response.data.details.bank_code,
      bank_name: response.data.details.bank_name,
      currency: response.data.currency,
      active: response.data.active,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    return NextResponse.json({
      data: response.data,
      error: null,
    });
  } catch (error: any) {
    console.error("Error creating transfer recipient:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: error.message || "Failed to create transfer recipient",
          code: "PAYSTACK_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/paystack/transfer-recipients/bulk
 * Bulk create transfer recipients
 */
export async function PUT(request: Request) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const tenantId = await resolveTenantIdWithZaFallback(request);
    const tenantRegion = await getTenantRegionConfig(tenantId);
    const fallbackCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;
    const body = await request.json();
    const { recipients } = body;

    if (!Array.isArray(recipients) || recipients.length === 0) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "recipients must be a non-empty array",
            code: "VALIDATION_ERROR",
          },
        },
        { status: 400 }
      );
    }

    const supabase = await getSupabaseServer(request);
    const providerIds = new Set<string>();
    for (const r of recipients as { provider_id?: string; metadata?: { provider_id?: string } }[]) {
      const pid = r?.provider_id || r?.metadata?.provider_id;
      if (typeof pid === "string" && pid.trim()) providerIds.add(pid.trim());
    }
    for (const pid of providerIds) {
      const { data: provRow } = await supabase
        .from("providers")
        .select("tenant_id")
        .eq("id", pid)
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
              message: "One or more providers are not in this market.",
              code: "TENANT_MISMATCH",
            },
          },
          { status: 403 },
        );
      }
    }

    const recipientRequests: CreateTransferRecipientRequest[] = recipients.map(
      (r: any) => ({
        type: r.type,
        name: r.name,
        account_number: r.account_number,
        bank_code: r.bank_code,
        currency: r.currency || fallbackCurrency,
        description: r.description,
        email: r.email,
        metadata: r.metadata,
      })
    );

    const response = await bulkCreateTransferRecipients(recipientRequests, { tenantId });

    // Store recipients in database
    const records = response.data
      .map((recipient: any, idx: number) => {
        const input = recipients[idx] || {};
        const providerId = input.provider_id || input?.metadata?.provider_id || recipient?.metadata?.provider_id;
        if (!providerId) return null;

        const acct = recipient.details?.account_number || "";
        const last4 = acct ? acct.slice(-4) : null;

        return {
          provider_id: providerId,
          recipient_code: recipient.recipient_code,
          recipient_id: recipient.id,
          type: recipient.type,
          account_number_last4: last4,
          account_name: recipient.details.account_name,
          bank_code: recipient.details.bank_code,
          bank_name: recipient.details.bank_name,
          currency: recipient.currency,
          active: recipient.active,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      })
      .filter(Boolean);

    if (records.length === 0) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Each bulk recipient must include provider_id (or metadata.provider_id)",
            code: "VALIDATION_ERROR",
          },
        },
        { status: 400 }
      );
    }

    await (supabase.from("provider_payout_accounts") as any).insert(records as any);

    return NextResponse.json({
      data: response.data,
      error: null,
    });
  } catch (error: any) {
    console.error("Error bulk creating transfer recipients:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: error.message || "Failed to bulk create transfer recipients",
          code: "PAYSTACK_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
