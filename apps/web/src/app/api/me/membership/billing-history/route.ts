import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";

type BillingItem = {
  id: string;
  date: string;
  amount: number;
  fees: number;
  net: number;
  status: string;
  kind?: string;
  is_renewal: boolean;
  plan_name: string;
  provider_name: string;
  provider_id: string | null;
  reference: string | null;
  receipt_url: string | null;
  failure_reason?: string | null;
  sort_ts: number;
};

/**
 * GET /api/me/membership/billing-history
 *
 * Returns the authenticated customer's membership payment history.
 * Optional query: provider_id, plan_id
 * Includes paid ledger rows and failed/pending membership_orders.
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
    const providerIdFilter = searchParams.get("provider_id")?.trim() || null;
    const planIdFilter = searchParams.get("plan_id")?.trim() || null;

    let ftQuery = supabase
      .from("finance_transactions")
      .select("id, provider_id, transaction_type, amount, fees, net, description, metadata, created_at")
      .eq("transaction_type", "membership_sale")
      .contains("metadata", { user_id: user.id })
      .order("created_at", { ascending: false });

    if (providerIdFilter) {
      ftQuery = ftQuery.eq("provider_id", providerIdFilter);
    }

    const { data: ftRows, error } = await ftQuery.range(0, 199);
    if (error) throw error;

    let orderQuery = (supabase.from("membership_orders") as any)
      .select("id, provider_id, plan_id, amount, currency, status, paystack_reference, metadata, created_at, updated_at")
      .eq("user_id", user.id)
      .in("status", ["pending", "failed"])
      .order("created_at", { ascending: false });

    if (providerIdFilter) {
      orderQuery = orderQuery.eq("provider_id", providerIdFilter);
    }
    if (planIdFilter) {
      orderQuery = orderQuery.eq("plan_id", planIdFilter);
    }

    const { data: orderRows } = await orderQuery.range(0, 99);

    const paidOrderIds = new Set<string>();
    for (const row of ftRows ?? []) {
      const meta = (row as { metadata?: Record<string, unknown> }).metadata ?? {};
      const oid = meta.membership_order_id as string | undefined;
      if (oid) paidOrderIds.add(oid);
    }

    const providerIds = new Set<string>();
    const planIds = new Set<string>();
    for (const r of ftRows ?? []) {
      const pid = (r as { provider_id?: string }).provider_id;
      if (pid) providerIds.add(pid);
      const planId = ((r as { metadata?: Record<string, unknown> }).metadata as Record<string, unknown>)?.plan_id as string | undefined;
      if (planId) planIds.add(planId);
    }
    for (const r of orderRows ?? []) {
      if (r.provider_id) providerIds.add(r.provider_id);
      if (r.plan_id) planIds.add(r.plan_id);
    }

    const [{ data: providers }, { data: plans }] = await Promise.all([
      providerIds.size > 0
        ? supabase.from("providers").select("id, business_name").in("id", [...providerIds])
        : Promise.resolve({ data: [] }),
      planIds.size > 0
        ? (supabase.from("membership_plans") as any).select("id, name").in("id", [...planIds])
        : Promise.resolve({ data: [] }),
    ]);

    const providerMap = new Map((providers ?? []).map((p: { id: string; business_name: string }) => [p.id, p.business_name]));
    const planMap = new Map((plans ?? []).map((p: { id: string; name: string }) => [p.id, p.name]));

    const items: BillingItem[] = [];

    for (const row of ftRows ?? []) {
      const r = row as {
        id: string;
        provider_id: string | null;
        amount: number | string | null;
        fees: number | string | null;
        net: number | string | null;
        metadata: Record<string, unknown> | null;
        created_at: string;
      };
      const meta = (r.metadata ?? {}) as Record<string, unknown>;
      const planId = meta.plan_id as string | undefined;
      if (planIdFilter && planId !== planIdFilter) continue;

      const isRenewal = meta.kind === "membership_renewal";
      const reference = (meta.reference as string | undefined) ?? null;
      const sortTs = new Date(r.created_at).getTime();

      items.push({
        id: r.id,
        date: r.created_at,
        amount: Number(r.amount ?? 0),
        fees: Number(r.fees ?? 0),
        net: Number(r.net ?? r.amount ?? 0),
        status: "paid",
        kind: meta.kind as string | undefined,
        is_renewal: isRenewal,
        plan_name: planId ? String(planMap.get(planId) ?? "Membership") : "Membership",
        provider_name: r.provider_id ? String(providerMap.get(r.provider_id) ?? "Provider") : "Provider",
        provider_id: r.provider_id,
        reference,
        receipt_url: `/api/me/membership/receipts/${r.id}/pdf`,
        failure_reason: null,
        sort_ts: Number.isFinite(sortTs) ? sortTs : 0,
      });
    }

    for (const row of orderRows ?? []) {
      if (paidOrderIds.has(row.id)) continue;
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      const failureReason =
        (typeof meta.failure_reason === "string" && meta.failure_reason) ||
        (typeof meta.error === "string" && meta.error) ||
        null;
      const isRenewal = meta.kind === "membership_renewal";
      const sortTs = new Date(row.created_at ?? row.updated_at).getTime();

      items.push({
        id: `order-${row.id}`,
        date: row.created_at ?? row.updated_at,
        amount: Number(row.amount ?? 0),
        fees: 0,
        net: Number(row.amount ?? 0),
        status: row.status === "pending" ? "pending" : "failed",
        kind: meta.kind as string | undefined,
        is_renewal: isRenewal,
        plan_name: row.plan_id ? String(planMap.get(row.plan_id) ?? "Membership") : "Membership",
        provider_name: row.provider_id ? String(providerMap.get(row.provider_id) ?? "Provider") : "Provider",
        provider_id: row.provider_id ?? null,
        reference: row.paystack_reference ?? null,
        receipt_url: null,
        failure_reason: failureReason,
        sort_ts: Number.isFinite(sortTs) ? sortTs : 0,
      });
    }

    items.sort((a, b) => b.sort_ts - a.sort_ts);
    const paged = items.slice(offset, offset + limit).map(({ sort_ts: _sortTs, ...rest }) => rest);

    return successResponse({ items: paged, page, limit, total: items.length });
  } catch (error) {
    return handleApiError(error, "Failed to fetch membership billing history");
  }
}
