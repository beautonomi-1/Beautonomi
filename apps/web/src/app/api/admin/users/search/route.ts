import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * GET /api/admin/users/search
 * 
 * Search for a user by email or phone number
 */
export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const supabase = await getSupabaseServer(request);

    if (!supabase) {
      return handleApiError(new Error("Supabase client not available"), "Failed to search user");
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q");

    if (!query || query.trim().length === 0) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Search query is required",
            code: "VALIDATION_ERROR",
          },
        },
        { status: 400 }
      );
    }

    const searchTerm = query.trim();

    // Try to find user by email or phone
    const { data: users, error } = await supabase
      .from("users")
      .select("id, email, phone, full_name")
      .or(`email.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%`)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Error searching user:", error);
      return handleApiError(error, "Failed to search user");
    }

    if (!users) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "User not found",
            code: "NOT_FOUND",
          },
        },
        { status: 404 }
      );
    }

    return successResponse({
      id: users.id,
      email: users.email,
      phone: users.phone,
      full_name: users.full_name,
    });
  } catch (error) {
    return handleApiError(error, "Failed to search user");
  }
}
