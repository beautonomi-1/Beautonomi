import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi } from "@/lib/supabase/api-helpers";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRoleInApi(["superadmin"]);
    const supabase = await getSupabaseServer();

    if (!supabase) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Supabase client not available",
            code: "SERVER_ERROR",
          },
        },
        { status: 500 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const { new_password } = body;

    if (!new_password || new_password.length < 8) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Password must be at least 8 characters",
            code: "VALIDATION_ERROR",
          },
        },
        { status: 400 }
      );
    }

    // Use Supabase Admin API to update password
    // Note: This requires service role key or admin API access
    const { error } = await supabase.auth.admin.updateUserById(id, {
      password: new_password,
    });

    if (error) {
      console.error("Error updating password:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: error.message || "Failed to update password",
            code: "PASSWORD_UPDATE_ERROR",
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: { success: true },
      error: null,
    });
  } catch (error: any) {
    console.error("Error in password reset:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: error.message || "Failed to reset password",
          code: "SERVER_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
