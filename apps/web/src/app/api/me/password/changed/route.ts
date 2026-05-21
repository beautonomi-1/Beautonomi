import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { handleApiError, requireRoleInApi, successResponse } from "@/lib/supabase/api-helpers";

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request,
    );
    const supabase = await getSupabaseServer(request);
    const { error } = await supabase
      .from("users")
      .update({ password_changed_at: new Date().toISOString() })
      .eq("id", user.id);

    if (error) {
      throw error;
    }

    return successResponse({ message: "Password timestamp updated" });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Not authenticated")) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    return handleApiError(error, "Failed to update password timestamp");
  }
}
