import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

/**
 * GET /api/public/providers/[slug]/membership-plans
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const supabase = await getSupabaseServer();
    const { slug } = await params;

    // First, get the provider by slug to get the id
    const { data: provider, error: providerError } = await supabase
      .from("providers")
      .select("id")
      .eq("slug", slug)
      .eq("status", "active")
      .single();

    if (providerError || !provider) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Provider not found",
            code: "NOT_FOUND",
          },
        },
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

    return NextResponse.json({ data: { plans: plans || [] }, error: null });
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
