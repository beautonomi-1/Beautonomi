import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireRoleInApi, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { writeAuditLog } from "@/lib/audit/audit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { cookies } from "next/headers";

const MAX_IMPERSONATIONS_PER_HOUR = 5;

/**
 * Check rate limit: max impersonations per admin per hour.
 * Returns true if the admin is within the allowed limit.
 */
async function checkImpersonationRateLimit(adminId: string): Promise<{ allowed: boolean; count: number }> {
  const supabase = getSupabaseAdmin();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { count, error } = await supabase
    .from("audit_logs")
    .select("id", { count: "exact", head: true })
    .eq("actor_user_id", adminId)
    .eq("action", "admin_impersonation_start")
    .gte("created_at", oneHourAgo);

  if (error) {
    console.error("Rate limit check failed:", error);
    // Fail open but log — don't block admins due to DB errors
    return { allowed: true, count: 0 };
  }

  const currentCount = count ?? 0;
  return { allowed: currentCount < MAX_IMPERSONATIONS_PER_HOUR, count: currentCount };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: adminUser } = await requireRoleInApi(["superadmin"], request);

    const { id } = await params;

    // Parse request body and require a reason
    let body: { reason?: string } = {};
    try {
      body = await request.json();
    } catch {
      // Body may be empty in legacy callers — we now require it
    }

    const reason = body.reason?.trim();
    if (!reason || reason.length < 3) {
      return errorResponse(
        "A reason is required for impersonation (minimum 3 characters)",
        "REASON_REQUIRED",
        400
      );
    }

    // Rate limiting: max 5 impersonations per admin per hour
    const rateLimit = await checkImpersonationRateLimit(adminUser.id);
    if (!rateLimit.allowed) {
      return errorResponse(
        `Rate limit exceeded: ${rateLimit.count}/${MAX_IMPERSONATIONS_PER_HOUR} impersonations in the last hour. Please wait before trying again.`,
        "RATE_LIMIT_EXCEEDED",
        429
      );
    }

    // Collect request metadata for audit trail
    const ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";

    // Use service role client for admin operations
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

    // Get the target user
    const { data: targetUser, error: targetError } = await supabaseAdmin.auth.admin.getUserById(id);

    if (targetError || !targetUser) {
      return errorResponse("Target user not found", "USER_NOT_FOUND", 404);
    }

    // Generate a sign-in link for the target user using recovery type (works better for impersonation)
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: targetUser.user.email!,
      options: {
        redirectTo: `${request.nextUrl.origin}/auth/callback`,
      },
    });

    if (linkError || !linkData) {
      console.error("Error generating impersonation link:", linkError);
      return errorResponse("Failed to create impersonation session", "SESSION_ERROR", 500);
    }

    // Log the full response to debug
    console.log("Link data received:", JSON.stringify(linkData, null, 2));

    // Extract the action link from the response
    // Supabase returns: { properties: { action_link: "..." } }
    let actionLink: string | null = null;
    
    if (linkData && typeof linkData === 'object') {
      const data = linkData as any;
      // Try properties.action_link first (most common)
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
      console.error("Link data structure:", JSON.stringify(linkData, null, 2));
      return errorResponse("Failed to extract action link from response", "LINK_EXTRACTION_ERROR", 500);
    }

    console.log("Action link extracted:", actionLink);

    // Extract token_hash from the action link
    let token: string | null = null;
    try {
      // Parse the URL to extract token_hash
      const linkUrl = new URL(actionLink);
      token = linkUrl.searchParams.get("token_hash");
      
      // If not found, try token parameter
      if (!token) {
        token = linkUrl.searchParams.get("token");
      }
    } catch {
      // If parsing fails, try regex extraction
      console.log("Error parsing URL, trying regex extraction");
      const tokenMatch = actionLink.match(/[?&]token_hash=([^&?#]+)/) || 
                        actionLink.match(/[?&]token=([^&?#]+)/);
      if (tokenMatch) {
        token = decodeURIComponent(tokenMatch[1]);
      }
    }

    if (!token) {
      console.error("Link data:", JSON.stringify(linkData, null, 2));
      console.error("Action link:", actionLink);
      return errorResponse("Failed to extract token from link. Please check server logs for details.", "TOKEN_ERROR", 500);
    }

    console.log("Token extracted successfully:", token.substring(0, 20) + "...");

    // Store impersonation info in cookies
    const cookieStore = await cookies();
    cookieStore.set("impersonation_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60, // 1 hour
    });
    
    // Store original admin user ID so we can return to it
    cookieStore.set("impersonation_admin_id", adminUser.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60, // 1 hour
    });

    // Enhanced audit log: admin_impersonation_start
    await writeAuditLog({
      actor_user_id: adminUser.id,
      actor_role: "superadmin",
      action: "admin_impersonation_start",
      entity_type: "user",
      entity_id: id,
      metadata: {
        target_email: targetUser.user.email,
        target_user_id: id,
        reason,
        ip_address: ipAddress,
        user_agent: userAgent,
      },
    });

    // Return redirect URL - use recovery type since we generated a recovery link
    return successResponse({
      success: true,
      url: `/auth/callback?token_hash=${token}&type=recovery`,
    });
  } catch (error: any) {
    console.error("Error in impersonation:", error);
    return handleApiError(error, "Failed to impersonate user");
  }
}
