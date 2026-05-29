import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, getPaginationParams  } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_FINANCE } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import {
  getNegativeBalanceProvidersForTenant,
  type NegativeBalanceProvidersPayload,
} from "@/lib/admin/negative-provider-payout-balances";

type PayoutRow = {
  id?: string;
  provider_id?: string;
  payout_number?: string;
  status?: string;
  amount?: number;
  net_amount?: number;
  platform_fee_amount?: number;
  currency?: string;
  payout_method?: string;
  recipient_code?: string;
  transfer_code?: string;
  payout_provider_response?: unknown;
  scheduled_at?: string | null;
  created_at?: string | null;
  approved_at?: string | null;
  processed_at?: string | null;
  completed_at?: string | null;
  failed_at?: string | null;
  failure_reason?: string | null;
  providers?: unknown;
  [key: string]: unknown;
};

function csvEscape(value: unknown): string {
  const raw = value == null ? "" : String(value);
  return /[",\r\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

function paystackTransferStatus(response: unknown): string {
  if (!response || typeof response !== "object") return "";
  const rec = response as Record<string, unknown>;
  const nested = rec.data;
  if (nested && typeof nested === "object") {
    const st = (nested as Record<string, unknown>).status;
    if (typeof st === "string") return st;
  }
  return typeof rec.status === "string" ? rec.status : "";
}

function payoutsToCsv(rows: Array<PayoutRow & { provider?: any; bank_account?: any }>) {
  const headers = [
    "payout_id",
    "payout_number",
    "provider_id",
    "provider",
    "status",
    "currency",
    "amount",
    "net_amount",
    "platform_fee_amount",
    "payout_method",
    "recipient_code",
    "transfer_code",
    "transfer_status",
    "bank_name",
    "account_name",
    "account_last4",
    "scheduled_at",
    "created_at",
    "approved_at",
    "processed_at",
    "completed_at",
    "failed_at",
    "failure_reason",
  ];
  const lines = rows.map((r) =>
    [
      r.id,
      r.payout_number,
      r.provider_id,
      r.provider?.business_name ?? "",
      r.status,
      r.currency,
      r.amount,
      r.net_amount,
      r.platform_fee_amount,
      r.payout_method,
      r.recipient_code,
      r.transfer_code,
      paystackTransferStatus(r.payout_provider_response),
      r.bank_account?.bank_name ?? "",
      r.bank_account?.account_name ?? "",
      r.bank_account?.account_number_last4 ?? "",
      r.scheduled_at,
      r.created_at,
      r.approved_at,
      r.processed_at,
      r.completed_at,
      r.failed_at,
      r.failure_reason,
    ].map(csvEscape).join(",")
  );
  return [headers.join(","), ...lines].join("\r\n");
}

/**
 * GET /api/admin/payouts
 * 
 * Get payout queue with filters
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    let negativeBalanceProviders: NegativeBalanceProvidersPayload = { count: 0, providers: [] };
    if (supabase) {
      try {
        negativeBalanceProviders = await getNegativeBalanceProvidersForTenant(supabase, tenantId);
      } catch (e) {
        console.warn("Failed to list negative provider payout balances:", e);
      }
    }

    if (!supabase) {
      return NextResponse.json({
        data: [],
        error: null,
        meta: {
          page: 1,
          limit: 50,
          total: 0,
          has_more: false,
          negative_balance_providers: negativeBalanceProviders,
        },
      });
    }

    const { searchParams } = new URL(request.url);
    const { page, limit, offset } = getPaginationParams(request);

    const status = searchParams.get("status"); // pending, processing, completed, failed
    const providerId = searchParams.get("provider_id");
    const q = searchParams.get("q")?.trim() || "";
    const startDate = searchParams.get("start_date")?.slice(0, 10) || "";
    const endDate = searchParams.get("end_date")?.slice(0, 10) || "";
    const minAmountRaw = searchParams.get("min_amount");
    const maxAmountRaw = searchParams.get("max_amount");
    const transferStatus = searchParams.get("transfer_status")?.trim() || "";
    const exportFormat = searchParams.get("export")?.trim().toLowerCase() || "";
    const requestedLimit = exportFormat === "csv" ? Math.min(5000, Math.max(limit, 5000)) : limit;

    let providerIdsForSearch: string[] | null = null;
    if (q) {
      const { data: matchedProviders } = await supabase
        .from("providers")
        .select("id")
        .eq("tenant_id", tenantId)
        .or(`business_name.ilike.%${q}%,slug.ilike.%${q}%`)
        .limit(250);
      providerIdsForSearch = (matchedProviders || []).map((p: { id: string }) => p.id);
    }

    const buildBaseQuery = (opts: { count?: "exact"; select?: string } = {}) => {
      let query = supabase
      .from("payouts")
        .select(opts.select ?? "*, providers!inner(tenant_id)", opts.count ? { count: opts.count } : undefined)
      .eq("providers.tenant_id", tenantId);

      if (status && status !== "all") query = query.eq("status", status);
      if (providerId) query = query.eq("provider_id", providerId);
      if (startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate)) query = query.gte("created_at", `${startDate}T00:00:00.000Z`);
      if (endDate && /^\d{4}-\d{2}-\d{2}$/.test(endDate)) query = query.lte("created_at", `${endDate}T23:59:59.999Z`);
      const minAmount = minAmountRaw != null ? Number(minAmountRaw) : NaN;
      const maxAmount = maxAmountRaw != null ? Number(maxAmountRaw) : NaN;
      if (Number.isFinite(minAmount)) query = query.gte("amount", minAmount);
      if (Number.isFinite(maxAmount)) query = query.lte("amount", maxAmount);
      if (q) {
        const payoutNumberFilter = `payout_number.ilike.%${q}%`;
        if (providerIdsForSearch && providerIdsForSearch.length > 0) {
          query = query.or(`${payoutNumberFilter},provider_id.in.(${providerIdsForSearch.join(",")})`);
        } else {
          query = query.ilike("payout_number", `%${q}%`);
        }
      }
      if (transferStatus) {
        // Paystack responses are JSONB; top-level and nested data.status are both seen in historical rows.
        query = query.or(
          `payout_provider_response->>status.eq.${transferStatus},payout_provider_response->data->>status.eq.${transferStatus}`
        );
      }
      return query;
    };

    // Apply pagination
    const { data: payouts, error, count } = await buildBaseQuery({ count: "exact" })
      .order("scheduled_at", { ascending: false })
      .range(exportFormat === "csv" ? 0 : offset, exportFormat === "csv" ? requestedLimit - 1 : offset + limit - 1);

    if (error) {
      console.error("Error fetching payouts:", error);
      return NextResponse.json({
        data: [],
        error: {
          message: error.message || "Failed to fetch payouts",
          code: "QUERY_ERROR",
        },
        meta: {
          page,
          limit,
          total: 0,
          has_more: false,
          negative_balance_providers: negativeBalanceProviders,
        },
      }, { status: 500 });
    }

    const { data: summaryRows } = await buildBaseQuery({ select: "status, amount, currency, providers!inner(tenant_id)" })
      .limit(10000);
    const summary = (summaryRows || []).reduce(
      (acc: Record<string, { count: number; amount: number }>, row: any) => {
        const key = String(row.status ?? "unknown");
        acc[key] = acc[key] || { count: 0, amount: 0 };
        acc[key].count += 1;
        acc[key].amount += Number(row.amount || 0);
        return acc;
      },
      {},
    );

    if (!payouts || payouts.length === 0) {
      return NextResponse.json({
        data: [],
        error: null,
        meta: {
          page,
          limit,
          total: 0,
          has_more: false,
          summary,
          negative_balance_providers: negativeBalanceProviders,
        },
      });
    }

    // Fetch provider data separately
    const payoutRows = payouts as unknown as PayoutRow[];
    const providerIds = [...new Set(payoutRows.map((p) => p.provider_id).filter(Boolean))];

    let providerMap = new Map<string, { id: string; business_name?: string; slug?: string }>();
    if (providerIds.length > 0) {
      const { data: providers } = await supabase
        .from("providers")
        .select("id, business_name, slug")
        .eq("tenant_id", tenantId)
        .in("id", providerIds);
      if (providers) {
        providerMap = new Map(providers.map((p: { id: string; business_name?: string; slug?: string }) => [p.id, p]));
      }
    }

    const recipientCodes = payoutRows.map((p) => p.recipient_code).filter(Boolean);

    let bankAccountByRecipient = new Map<string, { recipient_code?: string; account_name?: string; account_number_last4?: string; bank_name?: string; bank_code?: string }>();
    if (recipientCodes.length > 0) {
      const { data: bankAccounts } = await supabase
        .from("provider_payout_accounts")
        .select("recipient_code, account_name, account_number_last4, bank_name, bank_code")
        .in("recipient_code", recipientCodes)
        .eq("active", true)
        .is("deleted_at", null);
      if (bankAccounts) {
        type AccRow = { recipient_code?: string };
        bankAccountByRecipient = new Map(
          bankAccounts.map((acc: AccRow) => [acc.recipient_code ?? "", acc])
        );
      }
    }

    // For payouts without recipient_code (e.g. pending), use provider's active payout account for display
    const bankAccountByProviderId = new Map();
    if (providerIds.length > 0) {
      const { data: providerAccounts } = await supabase
        .from("provider_payout_accounts")
        .select("provider_id, account_name, account_number_last4, bank_name, bank_code")
        .in("provider_id", providerIds)
        .eq("active", true)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      // One row per provider (latest); if multiple active, first wins
      if (providerAccounts) {
        for (const acc of providerAccounts) {
          if (!bankAccountByProviderId.has(acc.provider_id)) {
            bankAccountByProviderId.set(acc.provider_id, acc);
          }
        }
      }
    }

    type PayoutWithScope = PayoutRow & { providers?: unknown };
    const enrichedPayouts = (payoutRows as PayoutWithScope[]).map((payout) => {
      const { providers: _tenantScope, ...payoutRest } = payout;
      void _tenantScope;
      const bankFromRecipient = payoutRest.recipient_code
        ? bankAccountByRecipient.get(payoutRest.recipient_code) || null
        : null;
      const bankFromProvider =
        !bankFromRecipient && payoutRest.provider_id
          ? bankAccountByProviderId.get(payoutRest.provider_id) || null
          : null;
      return {
        ...payoutRest,
        provider: payoutRest.provider_id
          ? providerMap.get(payoutRest.provider_id) || null
          : null,
        bank_account: bankFromRecipient || bankFromProvider || null,
      };
    });

    if (exportFormat === "csv") {
      return new NextResponse(payoutsToCsv(enrichedPayouts as any), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="payouts-${new Date().toISOString().slice(0, 10)}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }

    return NextResponse.json({
      data: enrichedPayouts,
      error: null,
      meta: {
        page,
        limit,
        total: count || 0,
        has_more: (count || 0) > offset + limit,
        summary,
        negative_balance_providers: negativeBalanceProviders,
      },
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/payouts:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: error instanceof Error ? error.message : "Failed to fetch payouts",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

