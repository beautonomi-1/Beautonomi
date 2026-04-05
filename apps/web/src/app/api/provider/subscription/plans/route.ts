import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request
    );
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

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

    const { data: plans, error } = await supabaseAdmin
      .from("subscription_plans")
      .select("*")
      .eq("is_active", true)
      .order("amount", { ascending: true });

    if (error) {
      console.warn("Error fetching plans, returning defaults:", error);
      return successResponse([
        {
          id: "free",
          name: "Free",
          amount: 0,
          currency: lastResortCurrency,
          interval: "month",
          features: ["50 bookings/month", "4 staff members", "3 locations"],
          limits: { max_bookings: 50, max_staff: 4, max_locations: 3 },
          is_popular: false,
        },
        {
          id: "starter",
          name: "Starter",
          amount: 199,
          currency: lastResortCurrency,
          interval: "month",
          features: ["50 bookings/month", "3 staff members", "Online booking"],
          limits: { max_bookings: 50, max_staff: 3, max_locations: 1 },
          is_popular: false,
        },
        {
          id: "professional",
          name: "Professional",
          amount: 499,
          currency: lastResortCurrency,
          interval: "month",
          features: ["Unlimited bookings", "10 staff members", "Reports & analytics"],
          limits: { max_bookings: null, max_staff: 10, max_locations: 3 },
          is_popular: true,
        },
        {
          id: "business",
          name: "Business",
          amount: 999,
          currency: lastResortCurrency,
          interval: "month",
          features: ["Unlimited everything", "Priority support", "Custom branding"],
          limits: { max_bookings: null, max_staff: null, max_locations: null },
          is_popular: false,
        },
      ]);
    }

    const result = (plans || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      amount: Number(p.amount || 0),
      currency: p.currency || lastResortCurrency,
      interval: p.interval || "month",
      features: p.features || [],
      limits: p.limits || { max_bookings: null, max_staff: null, max_locations: null },
      is_popular: p.is_popular || false,
    }));

    return successResponse(result);
  } catch (error) {
    console.error("Error fetching subscription plans:", error);
    return handleApiError(error, "Failed to load subscription plans");
  }
}
