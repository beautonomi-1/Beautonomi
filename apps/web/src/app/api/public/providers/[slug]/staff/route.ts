import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

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
    const supabase = await getSupabaseServer();
    let { slug } = await params;
    try {
      slug = decodeURIComponent(slug);
    } catch {
      // keep slug as-is if decode fails
    }

    // First get the provider (id + business_name for synthetic staff when needed)
    const { data: provider, error: providerError } = await supabase
      .from("providers")
      .select("id, business_name")
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

    // When provider has no staff rows (e.g. solo/freelancer), return one synthetic option
    // so the step shows a selectable specialist; availability treats provider-* as "any"
    if (staffMembers.length === 0 && provider?.id && provider?.business_name) {
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

    return NextResponse.json({
      data: staffMembers,
      error: null,
    });
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
