import { NextRequest } from "next/server";
import {  requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import { subDays, format, eachDayOfInterval } from "date-fns";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request,
    );    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);

    if (!providerId) return notFoundResponse("Provider not found");


    const { data: providerData, error: providerError } = await supabaseAdmin
      .from("providers")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (providerError || !providerData?.id) {
      return handleApiError(
        new Error("Provider profile not found."),
        "NOT_FOUND",
        404,
      );
    }
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get("start_date")
      ? new Date(searchParams.get("start_date")!)
      : subDays(new Date(), 6);
    const endDate = searchParams.get("end_date")
      ? new Date(searchParams.get("end_date")!)
      : new Date();

    const { data: rows } = await supabaseAdmin
      .from("finance_transactions")
      .select("net, amount, created_at")
      .eq("provider_id", providerId)
      .eq("transaction_type", "provider_earnings")
      .gte("created_at", startDate.toISOString())
      .lte("created_at", new Date(endDate.getTime() + 86400000).toISOString());

    const revenueMap = new Map<string, number>();
    const days = eachDayOfInterval({ start: startDate, end: endDate });
    days.forEach((d) => revenueMap.set(format(d, "yyyy-MM-dd"), 0));

    (rows || []).forEach((r: any) => {
      const day = format(new Date(r.created_at), "yyyy-MM-dd");
      const val = Number(r.net ?? r.amount ?? 0);
      revenueMap.set(day, (revenueMap.get(day) ?? 0) + val);
    });

    const result = days.map((d) => ({
      day: format(d, "yyyy-MM-dd"),
      revenue: revenueMap.get(format(d, "yyyy-MM-dd")) ?? 0,
    }));

    return successResponse(result);
  } catch (error) {
    console.error("Error in weekly-revenue report:", error);
    return handleApiError(error, "Failed to generate weekly revenue report");
  }
}
