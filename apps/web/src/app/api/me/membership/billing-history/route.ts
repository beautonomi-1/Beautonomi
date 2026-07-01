import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * GET /api/me/membership/billing-history
 *
 * Returns the authenticated customer's membership payment history.
 * Each item includes a link to the PDF receipt.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request,
    );

    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get("limit") ?? 50), 100);
    const page = Math.max(Number(searchParams.get("page") ?? 1), 1);
    const offset = (page - 1) * limit;

    // @tenant-hint: finance_transactions is read with getSupabaseAdmin but is strictly
    // scoped to the authenticated caller via `.contains("metadata", { user_id: user.id })`
    // below — membership_sale rows carry the purchaser's user_id in metadata. A user can
    // only ever see their own membership payments, so no cross-tenant leakage is possible.
    const { data: ftRows, error } = await supabase
      .from("finance_transactions")
      .select("id, provider_id, transaction_type, amount, fees, net, description, metadata, created_at")
      .eq("transaction_type", "membership_sale")
      .contains("metadata", { user_id: user.id })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    // Load plan and provider names in parallel
    const providerIds = [...new Set((ftRows ?? []).map((r: any) => r.provider_id).filter(Boolean))];
    const planIds = [...new Set((ftRows ?? []).map((r: any) => (r.metadata as any)?.plan_id).filter(Boolean))];

    const [{ data: providers }, { data: plans }] = await Promise.all([
      providerIds.length > 0
        ? supabase.from("providers").select("id, business_name").in("id", providerIds)
        : Promise.resolve({ data: [] }),
      planIds.length > 0
        ? (supabase.from("membership_plans") as any).select("id, name").in("id", planIds)
        : Promise.resolve({ data: [] }),
    ]);

    const providerMap = new Map((providers ?? []).map((p: any) => [p.id, p.business_name as string]));
    const planMap = new Map((plans ?? []).map((p: any) => [p.id, p.name as string]));

    const items = (ftRows ?? []).map((row: any) => {
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      const planId = meta.plan_id as string | undefined;
      const providerId = row.provider_id as string | null;
      const reference = meta.reference as string | undefined;
      const isRenewal = meta.kind === "membership_renewal";

      return {
        id: row.id as string,
        date: row.created_at as string,
        amount: Number(row.amount ?? 0),
        fees: Number(row.fees ?? 0),
        net: Number(row.net ?? row.amount ?? 0),
        status: "paid",
        kind: meta.kind as string | undefined,
        is_renewal: isRenewal,
        plan_name: planId ? (planMap.get(planId) ?? "Membership") : "Membership",
        provider_name: providerId ? (providerMap.get(providerId) ?? "Provider") : "Provider",
        provider_id: providerId,
        reference: reference ?? null,
        receipt_url: `/api/me/membership/receipts/${row.id}/pdf`,
      };
    });

    return successResponse({ items, page, limit });
  } catch (error) {
    return handleApiError(error, "Failed to fetch membership billing history");
  }
}
