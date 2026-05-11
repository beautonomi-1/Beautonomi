import { NextRequest } from "next/server";
import { requireRoleInApi, getProviderIdForUser, notFoundResponse, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);

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

    const { data: txns } = await supabaseAdmin
      .from("finance_transactions")
      .select("id, amount, created_at, metadata")
      .eq("provider_id", providerId)
      .eq("transaction_type", "provider_subscription_payment")
      .order("created_at", { ascending: false })
      .limit(20);

    const items = (txns || []).map((t: any) => ({
      id: t.id,
      amount: Number(t.amount || 0),
      currency: lastResortCurrency,
      status: "paid",
      description: (t.metadata as { description?: string } | null)?.description ?? "Subscription payment",
      created_at: t.created_at,
      invoice_url: null,
    }));

    return successResponse(items);
  } catch (error) {
    console.error("Error fetching billing history:", error);
    return handleApiError(error, "Failed to load billing history");
  }
}
