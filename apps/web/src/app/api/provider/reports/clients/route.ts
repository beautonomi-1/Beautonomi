import { NextRequest } from "next/server";
import {  requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import { subDays, subMonths, format, startOfMonth } from "date-fns";

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

    const { data: bookings } = await supabaseAdmin
      .from("bookings")
      .select("id, customer_id, created_at, total_amount, status")
      .eq("provider_id", providerId)
      .gte("scheduled_at", fromDate.toISOString())
      .lte("scheduled_at", new Date(toDate.getTime() + 86400000).toISOString())
      .not("status", "in", "(cancelled,no_show)");

    const all = bookings || [];
    const customerIds = new Set(all.map((b: any) => b.customer_id).filter(Boolean));
    const firstBookingMap = new Map<string, string>();
    all.forEach((b: any) => {
      if (!b.customer_id) return;
      const existing = firstBookingMap.get(b.customer_id);
      if (!existing || new Date(b.created_at) < new Date(existing)) {
        firstBookingMap.set(b.customer_id, b.created_at);
      }
    });

    let newClients = 0;
    let returningClients = 0;
    customerIds.forEach((cid) => {
      const firstDate = firstBookingMap.get(cid);
      if (firstDate && new Date(firstDate) >= fromDate) newClients++;
      else returningClients++;
    });

    const spendByCustomer = new Map<string, { spend: number; visits: number; name: string }>();
    all.forEach((b: any) => {
      if (!b.customer_id) return;
      const existing = spendByCustomer.get(b.customer_id) || { spend: 0, visits: 0, name: b.customer_id };
      existing.spend += Number(b.total_amount || 0);
      existing.visits += 1;
      spendByCustomer.set(b.customer_id, existing);
    });

    const topClientIds = Array.from(spendByCustomer.entries())
      .sort((a, b) => b[1].spend - a[1].spend)
      .slice(0, 10);

    let topClients: { name: string; spend: number; visits: number }[] = [];
    if (topClientIds.length > 0) {
      const { data: customers } = await supabaseAdmin
        .from("users")
        .select("id, full_name")
        .in("id", topClientIds.map(([id]) => id));
      const nameMap = new Map((customers || []).map((c: any) => [c.id, c.full_name || "Unknown"]));
      topClients = topClientIds.map(([id, data]) => ({
        name: nameMap.get(id) || "Client",
        spend: data.spend,
        visits: data.visits,
      }));
    }

    const months: { month: string; count: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const m = subMonths(new Date(), i);
      const label = format(m, "MMM yyyy");
      const mStart = startOfMonth(m);
      const mEnd = startOfMonth(subMonths(new Date(), i - 1));
      const count = all.filter((b: any) => {
        const d = new Date(b.created_at);
        return d >= mStart && d < mEnd;
      }).length;
      months.push({ month: label, count });
    }

    const totalClients = customerIds.size;
    const retentionRate = totalClients > 0 ? (returningClients / totalClients) * 100 : 0;
    const avgLifetimeValue = totalClients > 0
      ? all.reduce((s, b: any) => s + Number(b.total_amount || 0), 0) / totalClients
      : 0;

    return successResponse({
      new_clients: newClients,
      returning_clients: returningClients,
      total_clients: totalClients,
      retention_rate: retentionRate,
      avg_lifetime_value: avgLifetimeValue,
      top_clients: topClients,
      growth: months,
    });
  } catch (error) {
    console.error("Error in clients report:", error);
    return handleApiError(error, "Failed to generate clients report");
  }
}
