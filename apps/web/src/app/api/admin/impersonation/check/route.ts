import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    // Require authenticated session
    const supabase = await getSupabaseServer(request);
    if (!supabase) {
      return NextResponse.json(
        { error: "Authentication required", isImpersonating: false },
        { status: 401 }
      );
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: "Authentication required", isImpersonating: false },
        { status: 401 }
      );
    }

    const cookieStore = await cookies();
    
    // Check if we have an impersonation admin ID cookie
    const adminId = cookieStore.get("impersonation_admin_id")?.value;
    
    return NextResponse.json({
      isImpersonating: !!adminId,
    });
  } catch (error: any) {
    console.error("Error checking impersonation status:", error);
    return NextResponse.json(
      { isImpersonating: false },
      { status: 200 }
    );
  }
}
