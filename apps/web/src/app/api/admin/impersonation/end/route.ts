import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit/audit";

export async function POST(request: NextRequest) {
  try {
    // Require authenticated session (during impersonation, session is the impersonated user)
    const supabase = await getSupabaseServer();
    if (!supabase) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const cookieStore = await cookies();
    
    // Get the original admin user ID from cookie
    const adminUserId = cookieStore.get("impersonation_admin_id")?.value;
    
    if (!adminUserId) {
      return NextResponse.json(
        { error: "No impersonation session found" },
        { status: 400 }
      );
    }

    // Use service role client to generate a sign-in link for the admin
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Get the admin user
    const { data: adminUser, error: adminError } = await supabaseAdmin.auth.admin.getUserById(adminUserId);

    if (adminError || !adminUser) {
      return NextResponse.json(
        { error: "Admin user not found" },
        { status: 404 }
      );
    }

    // Generate a sign-in link for the admin
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: adminUser.user.email!,
      options: {
        redirectTo: `${request.nextUrl.origin}/auth/callback`,
      },
    });

    if (linkError || !linkData) {
      console.error("Error generating admin sign-in link:", linkError);
      return NextResponse.json(
        { error: "Failed to create admin session" },
        { status: 500 }
      );
    }

    // Extract the action link
    let actionLink: string | null = null;
    if (linkData && typeof linkData === 'object') {
      const data = linkData as any;
      if (data.properties?.action_link) {
        actionLink = data.properties.action_link;
      } else if (data.properties?.actionLink) {
        actionLink = data.properties.actionLink;
      } else if (data.action_link) {
        actionLink = data.action_link;
      } else if (data.actionLink) {
        actionLink = data.actionLink;
      } else if (typeof data.properties === 'string') {
        actionLink = data.properties;
      }
    } else if (typeof linkData === 'string') {
      actionLink = linkData;
    }

    if (!actionLink) {
      return NextResponse.json(
        { error: "Failed to extract action link" },
        { status: 500 }
      );
    }

    // Extract token_hash from the action link
    let token: string | null = null;
    try {
      const linkUrl = new URL(actionLink);
      token = linkUrl.searchParams.get("token_hash");
      if (!token) {
        token = linkUrl.searchParams.get("token");
      }
    } catch {
      const tokenMatch = actionLink.match(/[?&]token_hash=([^&?#]+)/) || 
                        actionLink.match(/[?&]token=([^&?#]+)/);
      if (tokenMatch) {
        token = decodeURIComponent(tokenMatch[1]);
      }
    }

    if (!token) {
      return NextResponse.json(
        { error: "Failed to extract token from link" },
        { status: 500 }
      );
    }

    // Log impersonation end before clearing cookies
    const ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";
    const userAgentHeader = request.headers.get("user-agent") || "unknown";

    await writeAuditLog({
      actor_user_id: adminUserId,
      actor_role: "superadmin",
      action: "admin_impersonation_end",
      entity_type: "user",
      entity_id: user.id, // the impersonated user
      metadata: {
        admin_id: adminUserId,
        impersonated_user_id: user.id,
        impersonated_email: user.email,
        ip_address: ipAddress,
        user_agent: userAgentHeader,
      },
    });

    // Clear impersonation cookies
    cookieStore.delete("impersonation_token");
    cookieStore.delete("impersonation_admin_id");

    // Return redirect URL
    return NextResponse.json({
      success: true,
      url: `/auth/callback?token_hash=${token}&type=recovery`,
    });
  } catch (error: any) {
    console.error("Error ending impersonation:", error);
    return NextResponse.json(
      { error: "Failed to end impersonation" },
      { status: 500 }
    );
  }
}
