import { NextRequest } from "next/server";
import {  requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import { subDays } from "date-fns";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");
    const sp = request.nextUrl.searchParams;
    const fromDate = sp.get("from") ? new Date(sp.get("from")!) : subDays(new Date(), 30);
    const toDate = sp.get("to") ? new Date(sp.get("to")!) : new Date();
    const endIso = new Date(toDate.getTime() + 86400000).toISOString();

    const { data: txns } = await supabaseAdmin
      .from("finance_transactions")
      .select("transaction_type, amount, net, created_at, metadata")
      .eq("provider_id", providerId)
      .gte("created_at", fromDate.toISOString())
      .lte("created_at", endIso);

    const all = txns || [];
    let totalCollected = 0;
    let totalRefunded = 0;
    const methodMap = new Map<string, { amount: number; count: number }>();

    all.forEach((t: any) => {
      const val = Number(t.net ?? t.amount ?? 0);
      if (t.transaction_type === "provider_earnings") {
        if (val >= 0) totalCollected += val;
        else totalRefunded += Math.abs(val);
      }
      const method = (t.metadata as any)?.payment_method || "other";
      const existing = methodMap.get(method) || { amount: 0, count: 0 };
      if (val > 0) {
        existing.amount += val;
        existing.count += 1;
      }
      methodMap.set(method, existing);
    });

    const { data: payouts } = await supabaseAdmin
      .from("finance_transactions")
      .select("amount, created_at, transaction_type")
      .eq("provider_id", providerId)
      .eq("transaction_type", "payout")
      .order("created_at", { ascending: false })
      .limit(5);

    const recentPayouts = (payouts || []).map((p: any) => ({
      date: p.created_at,
      amount: Number(p.amount || 0),
      status: "completed",
    }));

    return successResponse({
      total_collected: totalCollected,
      total_refunded: totalRefunded,
      net_revenue: totalCollected - totalRefunded,
      by_method: Array.from(methodMap.entries())
        .map(([method, data]) => ({ method, ...data }))
        .sort((a, b) => b.amount - a.amount),
      recent_payouts: recentPayouts,
      recent_refunds: [],
    });
  } catch (error) {
    console.error("Error in payments report:", error);
    return handleApiError(error, "Failed to generate payments report");
  }
}
