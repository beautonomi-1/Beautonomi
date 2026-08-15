import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requirePublicTenant } from "@/lib/tenant/require-public-tenant";
import { resolveStaffLocationScope } from "@/lib/provider/staff-location-scope";

/**
 * GET /api/public/providers/[slug]/staff
 *
 * Returns staff members for a provider (public view).
 * When the provider has no provider_staff rows (e.g. solo/freelancer), returns one synthetic
 * option so the booking UI can still show a choice.
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
    let { slug } = await params;
    try { slug = decodeURIComponent(slug); } catch { /* keep as-is */ }
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);

    // Use admin client to bypass RLS — consistent with the SSR profile loader
    const { data: provider, error: providerError } = await supabase
      .from("providers")
      .select("id, business_name")
      .eq("tenant_id", tenantId)
      .eq(isUuid ? "id" : "slug", slug)
      .maybeSingle();

    if (providerError || !provider) {
      return NextResponse.json(
        { data: null, error: { message: "Provider not found", code: "NOT_FOUND" } },
        { status: 404 }
      );
    }

    const locationId = new URL(request.url).searchParams.get("location_id")?.trim() || null;

    // Fetch active staff members (provider_staff has no specialties column; use [] in response)
    const { data: staff, error: staffError } = await supabase
      .from("provider_staff")
      .select(`
        id,
        name,
        role,
        avatar_url,
        bio,
        is_active
      `)
      .eq("provider_id", provider.id)
      .eq("is_active", true)
      .order("name");

    if (staffError) {
      console.error("Error fetching staff:", staffError);
      return NextResponse.json(
        {
          data: [],
          error: null,
        }
      );
    }

    let staffMembers = (staff || []).map((member: any) => ({
      id: member.id,
      name: member.name || "Staff Member",
      role: member.role || "Staff",
      avatar_url: member.avatar_url,
      bio: member.bio,
      specialties: member.specialties || [],
      mobileReady: true,
    }));

    if (locationId && staffMembers.length > 0) {
      const scope = await resolveStaffLocationScope(supabase, provider.id, locationId);
      if (scope.staffIds !== null) {
        const allowed = new Set(scope.staffIds);
        staffMembers = staffMembers.filter((m) => allowed.has(m.id));
      }
    }

    // When provider has no staff rows (e.g. solo/freelancer), return one synthetic option
    // so the step shows a selectable specialist; availability treats provider-* as "any"
    if ((staff || []).length === 0 && provider?.id && provider?.business_name) {
      staffMembers = [
        {
          id: `provider-${provider.id}`,
          name: provider.business_name,
          role: "Your specialist",
          avatar_url: null,
          bio: null,
          specialties: [],
          mobileReady: true,
        },
      ];
    }

    const res = NextResponse.json({
      data: staffMembers,
      error: null,
    });
    res.headers.set("Cache-Control", "public, s-maxage=120, stale-while-revalidate=300");
    return res;
  } catch (error) {
    console.error("Unexpected error in /api/public/providers/[slug]/staff:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to fetch staff",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
