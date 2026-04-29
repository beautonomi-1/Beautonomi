import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requirePublicTenant } from "@/lib/tenant/require-public-tenant";

/**
 * GET /api/public/providers/[slug]/membership-plans
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const tenantRes = await requirePublicTenant(request);
    if (tenantRes instanceof Response) return tenantRes;
    const { tenantId } = tenantRes;

    const supabase = getSupabaseAdmin();
    const rawSlug = (await params).slug;
    let slug: string;
    try { slug = decodeURIComponent(rawSlug); } catch { slug = rawSlug; }
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);

    // Use admin client to bypass RLS — consistent with the SSR profile loader
    const { data: provider } = await supabase
      .from("providers")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq(isUuid ? "id" : "slug", slug)
      .maybeSingle();

    if (!provider) {
      return NextResponse.json(
        { data: null, error: { message: "Provider not found", code: "NOT_FOUND" } },
        { status: 404 }
      );
    }

    const providerData = provider as any;

    // Get membership plans for this provider
    const { data: plans, error: plansError } = await (supabase.from("membership_plans") as any)
      .select("id, provider_id, name, description, price_monthly, currency, discount_percent, is_active")
      .eq("provider_id", providerData.id)
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (plansError) {
      console.error("Error fetching membership plans:", plansError);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to fetch membership plans",
            code: "FETCH_ERROR",
          },
        },
        { status: 500 }
      );
    }

    const res = NextResponse.json({ data: { plans: plans || [] }, error: null });
    res.headers.set("Cache-Control", "public, s-maxage=120, stale-while-revalidate=300");
    return res;
  } catch (error) {
    console.error("Unexpected error in /api/public/providers/[slug]/membership-plans:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to fetch membership plans",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
