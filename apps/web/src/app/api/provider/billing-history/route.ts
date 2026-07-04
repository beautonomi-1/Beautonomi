import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  notFoundResponse,
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request
    );

    const supabaseAdmin = getSupabaseAdmin();

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");

    const { data: prow } = await supabaseAdmin
      .from("providers")
      .select("tenant_id")
      .eq("id", providerId)
      .maybeSingle();
    const effectiveTenantId =
      (prow as { tenant_id?: string | null } | null)?.tenant_id ??
      (await resolveTenantIdWithZaFallback(request));
    const tenantRegion = await getTenantRegionConfig(effectiveTenantId);
    const lastResortCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;

    // Caller-controlled page size for load-more (default 50, capped at 200).
    const limit = Math.min(
      Math.max(parseInt(request.nextUrl.searchParams.get("limit") ?? "50", 10) || 50, 50),
      200,
    );

    const { data: txns, error: txnsError, count } = await supabaseAdmin
      .from("finance_transactions")
      .select("id, amount, net, fees, currency, created_at, description, transaction_type, metadata", {
        count: "exact",
      })
      .eq("provider_id", providerId)
      .in("transaction_type", [
        "provider_subscription_payment",
        "provider_ads_payment",
        "provider_marketing_credit_topup",
        "provider_marketing_credit_refund",
      ])
      .order("created_at", { ascending: false })
      .limit(limit);

    if (txnsError) {
      console.error("Error fetching billing history transactions:", txnsError);
      return handleApiError(txnsError, "Failed to load billing history");
    }

    const items = (txns || []).map((t: any) => {
      const isAds = t.transaction_type === "provider_ads_payment";
      const isMarketing =
        t.transaction_type === "provider_marketing_credit_topup" ||
        t.transaction_type === "provider_marketing_credit_refund";
      const isMarketingRefund = t.transaction_type === "provider_marketing_credit_refund";
      const meta = (t.metadata as { description?: string; ads_budget_order_id?: string } | null) ?? null;
      const metadataDescription = meta?.description ?? null;
      // Ads payments carry their funding order id in metadata; expose a
      // downloadable PDF receipt for it (mirrors product-order receipts).
      const adsOrderId = isAds ? (meta?.ads_budget_order_id ?? null) : null;
      // Subscription payments expose a finance-transaction-keyed receipt so
      // both one-off orders and recurring renewals get a downloadable PDF.
      const invoiceUrl = isMarketing
        ? null
        : isAds
          ? adsOrderId
            ? `/api/provider/ads/orders/${adsOrderId}/receipt/pdf`
            : null
          : `/api/provider/subscription/receipts/${t.id}/pdf`;
      const type = isMarketing ? "marketing_credit" : isAds ? "ads" : "subscription";
      const fallbackDescription = isMarketing
        ? isMarketingRefund
          ? "Marketing credit refund"
          : "Marketing credit top-up"
        : isAds
          ? "Ads campaign payment"
          : "Subscription payment";
      // Show the GROSS amount the provider paid. `net + fees` reconstructs gross
      // and is robust across all row types (subscription/ads/marketing) and both
      // new rows (amount=gross) and legacy subscription rows (amount=net).
      const grossAmount = Number(t.net || 0) + Number(t.fees || 0);
      return {
        id: t.id,
        amount: grossAmount || Number(t.amount || 0),
        currency: t.currency || lastResortCurrency,
        status: "paid",
        type,
        description: t.description || metadataDescription || fallbackDescription,
        created_at: t.created_at,
        invoice_url: invoiceUrl,
      };
    });

    return successResponse({
      items,
      total: count ?? items.length,
      limit,
      has_more: (count ?? 0) > items.length,
    });
  } catch (error) {
    console.error("Error fetching billing history:", error);
    return handleApiError(error, "Failed to load billing history");
  }
}
