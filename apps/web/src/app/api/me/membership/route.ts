import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

function isNotExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return true;
  const ts = new Date(expiresAt).getTime();
  if (!Number.isFinite(ts)) return true;
  return ts >= Date.now();
}

/**
 * GET /api/me/membership
 *
 * Returns the current user's active memberships:
 * - membership: platform membership (customer_memberships + memberships) if any
 * - provider_memberships: active salon/provider plans (user_memberships + membership_plans)
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request
    );
    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveTenantIdWithZaFallback(request);
    const tenantRegion = await getTenantRegionConfig(tenantId);
    const lastResortCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;

    // 1) Platform membership (customer_memberships + memberships)
    const { data: activeRows, error: cmError } = await supabase
      .from("customer_memberships")
      .select(
        `
        id,
        status,
        started_at,
        expires_at,
        auto_renew,
        membership:memberships(id, name, description, price, currency, billing_period)
      `
      )
      .eq("customer_id", user.id)
      .eq("status", "active")
      .order("expires_at", { ascending: false });

    let hasPlatformMembership = false;
    let membership: {
      id: string;
      name: string;
      description?: string;
      billing_cycle: string;
      expires_at: string | null;
      auto_renew: boolean;
    } | null = null;
    let benefits: { name: string; description?: string }[] = [];

    if (!cmError && activeRows && activeRows.length > 0) {
      const validRows = (activeRows as any[]).filter((row) => isNotExpired(row?.expires_at ?? null));
      const first = validRows[0] as any;
      const plan = first?.membership;
      if (first && plan) {
        hasPlatformMembership = true;
        try {
          const { data: benefitRows } = await supabase
            .from("membership_benefits")
            .select("benefit_name, benefit_description")
            .eq("membership_id", plan.id)
            .eq("is_active", true)
            .order("display_order");
          benefits = (benefitRows || []).map((b: any) => ({
            name: b.benefit_name,
            description: b.benefit_description ?? undefined,
          }));
        } catch {
          // ignore
        }
        membership = {
          id: first.id,
          name: plan.name,
          description: plan.description ?? undefined,
          billing_cycle: plan.billing_period === "yearly" ? "yearly" : "monthly",
          expires_at: first.expires_at ?? null,
          auto_renew: first.auto_renew !== false,
        };
      }
      const staleIds = (activeRows as any[])
        .filter((row) => row?.id && !isNotExpired(row?.expires_at ?? null))
        .map((row) => row.id as string);
      if (staleIds.length > 0) {
        await supabase
          .from("customer_memberships")
          .update({
            status: "expired",
            updated_at: new Date().toISOString(),
          })
          .in("id", staleIds);
      }
    }

    // 2) Salon/provider memberships (user_memberships + membership_plans + providers)
    //    Include active AND past_due (past_due with grace still confers benefits).
    const { data: umRows, error: umError } = await (supabase
      .from("user_memberships") as any)
      .select(
        `
        id,
        provider_id,
        plan_id,
        status,
        started_at,
        expires_at,
        auto_renew,
        payment_method_id,
        next_billing_at,
        last_payment_at,
        renewal_failure_count,
        past_due_since,
        metadata,
        plan:membership_plans(id, name, description, price_monthly, currency, discount_percent),
        provider:providers(id, business_name, slug, tenant_id)
      `
      )
      .eq("user_id", user.id)
      .in("status", ["active", "past_due"])
      .order("expires_at", { ascending: false, nullsFirst: false });

    const provider_memberships: {
      id: string;
      provider_id: string;
      provider_name: string;
      provider_slug: string | null;
      plan_id: string;
      plan_name: string;
      plan_description: string | null;
      discount_percent: number;
      price_monthly: number;
      currency: string;
      status: string;
      expires_at: string | null;
      started_at: string;
      auto_renew: boolean;
      next_billing_at: string | null;
      last_payment_at: string | null;
      past_due_since: string | null;
      renewal_payment_method_missing?: boolean;
      card: { last4: string; brand: string; exp: string } | null;
    }[] = [];

    // Collect payment_method_ids to fetch card info in one go.
    const pmIdSet = new Set<string>();
    if (!umError && umRows && Array.isArray(umRows)) {
      for (const row of umRows as any[]) {
        if (row.payment_method_id) pmIdSet.add(row.payment_method_id);
      }
    }

    const cardMap = new Map<string, { last4: string; brand: string; exp: string }>();
    if (pmIdSet.size > 0) {
      const { data: pmRows } = await (supabase.from("payment_methods") as any)
        .select("id, last_four, card_brand, expiry_month, expiry_year")
        .in("id", [...pmIdSet])
        .eq("is_active", true);
      for (const pm of (pmRows ?? []) as any[]) {
        cardMap.set(pm.id, {
          last4: pm.last_four ?? "••••",
          brand: pm.card_brand ?? "card",
          exp: `${String(pm.expiry_month ?? "").padStart(2, "0")}/${pm.expiry_year ?? ""}`,
        });
      }
    }

    if (!umError && umRows && Array.isArray(umRows)) {
      // Only auto-expire truly stale `active` rows (expired term, no dunning state).
      // `past_due` rows must NOT be expired here — the renewal cron owns that transition
      // and enforces the grace window. Expiring past_due rows from a GET would bypass
      // grace and break discounts + dunning UI for customers still in the retry window.
      const staleUserMembershipIds: string[] = [];
      for (const row of umRows as any[]) {
        const plan = row.plan;
        const provider = row.provider;
        const rowStatus: string = row?.status ?? "active";

        if (rowStatus === "active" && !isNotExpired(row?.expires_at ?? null) && row?.id) {
          staleUserMembershipIds.push(row.id);
          continue;
        }

        // Include all of the customer's active/past_due salon memberships. Do not gate on
        // request tenant_id — tenant resolution (headers/subdomain) can differ from
        // the provider row's tenant and would incorrectly hide valid subscriptions.
        if (plan && provider) {
          provider_memberships.push({
            id: row.id,
            provider_id: row.provider_id,
            provider_name: (provider.business_name || "Provider").trim(),
            provider_slug: provider.slug ?? null,
            plan_id: row.plan_id,
            plan_name: (plan.name || "Plan").trim(),
            plan_description: plan.description ?? null,
            discount_percent: Number(plan.discount_percent ?? 0),
            price_monthly: Number(plan.price_monthly ?? 0),
            currency: plan.currency || lastResortCurrency,
            status: rowStatus,
            expires_at: row.expires_at ?? null,
            started_at: row.started_at || new Date().toISOString(),
            auto_renew: row.auto_renew === true,
            next_billing_at: row.next_billing_at ?? null,
            last_payment_at: row.last_payment_at ?? null,
            past_due_since: row.past_due_since ?? null,
            renewal_payment_method_missing:
              (row.metadata as { renewal_payment_method_missing?: boolean } | null)
                ?.renewal_payment_method_missing === true,
            card: row.payment_method_id ? (cardMap.get(row.payment_method_id) ?? null) : null,
          });
        }
      }
      if (staleUserMembershipIds.length > 0) {
        await (supabase.from("user_memberships") as any)
          .update({
            status: "expired",
            updated_at: new Date().toISOString(),
          })
          .in("id", staleUserMembershipIds);
      }
    }

    // 3) Savings from membership discounts applied on bookings
    let savingsThisMonth = 0;
    let savingsLifetime = 0;
    let savingsCurrency = lastResortCurrency;
    try {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const { data: discountRows } = await supabase
        .from("bookings")
        .select("membership_discount_amount, currency, created_at")
        .eq("customer_id", user.id)
        .gt("membership_discount_amount", 0);

      for (const row of (discountRows ?? []) as Array<{
        membership_discount_amount?: number | string | null;
        currency?: string | null;
        created_at?: string | null;
      }>) {
        const amt = Number(row.membership_discount_amount ?? 0);
        if (!Number.isFinite(amt) || amt <= 0) continue;
        savingsLifetime += amt;
        if (row.created_at && new Date(row.created_at) >= monthStart) {
          savingsThisMonth += amt;
        }
        if (row.currency && typeof row.currency === "string") {
          savingsCurrency = row.currency;
        }
      }
      savingsThisMonth = Math.round(savingsThisMonth * 100) / 100;
      savingsLifetime = Math.round(savingsLifetime * 100) / 100;
    } catch {
      // non-fatal — savings stay at 0
    }

    return successResponse({
      has_membership: hasPlatformMembership,
      membership,
      benefits,
      savings: { this_month: savingsThisMonth, lifetime: savingsLifetime },
      savings_currency: savingsCurrency,
      provider_memberships,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch membership");
  }
}
