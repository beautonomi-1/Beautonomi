import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseServer } from '@/lib/supabase/server';
import { resolveTenantIdWithZaFallback } from '@/lib/tenant/resolve-tenant-from-db';
import { getTenantRegionConfig } from '@/lib/regions/config';
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { ensurePlanOptionHasBarePlanId } from "@/lib/subscription/extract-subscription-plan-uuid";
import { getDisplayFeatureBulletsForSubscriptionPlans } from "@/lib/subscription/pricing-plan-display-features";
import {
  filterPlansForPublishedCatalog,
  getPublishedPaidSubscriptionPlanIds,
} from "@/lib/subscription/published-subscription-plans";

export async function GET(request: NextRequest) {
  try {
    let defaultCurrency: string = LAST_RESORT_CURRENCY;
    let tenantId: string | null = null;
    try {
      tenantId = await resolveTenantIdWithZaFallback(request);
      const tenantRegion = await getTenantRegionConfig(tenantId);
      defaultCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;
    } catch (tenantErr) {
      console.warn(
        "Tenant resolution failed in /api/public/subscription-plans (using last-resort currency):",
        tenantErr,
      );
    }
    const supabase = await getSupabaseServer();
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Fetch available subscription plans
    const { data: plansRaw, error } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error) {
      console.error('Error fetching subscription plans:', error);
      return NextResponse.json(
        { error: 'Failed to load subscription plans' },
        { status: 500 }
      );
    }

    const publishedPaidIds = await getPublishedPaidSubscriptionPlanIds(supabaseAdmin, tenantId);
    const plans = filterPlansForPublishedCatalog(plansRaw as { id: string; is_free?: boolean }[], publishedPaidIds);

    const planRows = (plans || []) as { id: string }[];
    const featureMap = await getDisplayFeatureBulletsForSubscriptionPlans(
      supabase,
      tenantId,
      planRows.map((p) => p.id)
    );

    // Shape expected by provider subscription UI: flatten into monthly/yearly options.
    // Free plans (is_free=true with null prices) get a single entry with price=0.
    // `features` are marketing bullets from pricing_plan_features (same as public /pricing), not raw JSON limits.
    const out = (plans || []).flatMap((p: any) => {
      const features = featureMap.get(p.id) ?? [];
      const description =
        typeof p.description === "string" && p.description.trim() ? p.description.trim() : null;
      const options: any[] = [];

      if (p.is_free) {
        options.push({
          id: `${p.id}:free`,
          plan_id: p.id,
          name: p.name,
          description,
          price: 0,
          currency: p.currency || defaultCurrency,
          billing_period: "monthly",
          features,
          is_popular: (p as any).is_popular || false,
          is_free: true,
        });
        return options;
      }

      if (p.price_monthly != null) {
        options.push({
          id: `${p.id}:monthly`,
          plan_id: p.id,
          name: p.name,
          description,
          price: Number(p.price_monthly),
          currency: p.currency || defaultCurrency,
          billing_period: "monthly",
          features,
          is_popular: (p as any).is_popular || false,
        });
      }
      if (p.price_yearly != null) {
        options.push({
          id: `${p.id}:yearly`,
          plan_id: p.id,
          name: p.name,
          description,
          price: Number(p.price_yearly),
          currency: p.currency || defaultCurrency,
          billing_period: "yearly",
          features,
          is_popular: (p as any).is_popular || false,
        });
      }
      return options;
    });

    return NextResponse.json({ data: out.map(ensurePlanOptionHasBarePlanId) });
  } catch (error) {
    console.error('Error in subscription-plans GET route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
