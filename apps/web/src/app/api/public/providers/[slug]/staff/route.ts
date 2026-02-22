import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

/**
 * GET /api/public/providers/[slug]/staff
 * 
 * Returns staff members for a provider (public view).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const supabase = await getSupabaseServer();
    const { slug } = await params;

    // First get the provider ID from slug
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

    // Fetch active staff members
    const { data: staff, error: staffError } = await supabase
      .from("provider_staff")
      .select(`
        id,
        name,
        role,
        avatar_url,
        bio,
        specialties,
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

    const staffMembers = (staff || []).map((member: any) => ({
      id: member.id,
      name: member.name || "Staff Member",
      role: member.role || "Staff",
      avatar_url: member.avatar_url,
      bio: member.bio,
      specialties: member.specialties || [],
      // For booking flow compatibility - check if staff member is mobile-ready
      // This would typically come from provider_staff settings, but for now we'll default to true
      mobileReady: true, // Can be enhanced to check actual mobile service capability
    }));

    // Return in format expected by booking flow: { data: Staff[] }
    // The partner profile component expects { data: { staff: Staff[] } } but we'll fix that component instead
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
