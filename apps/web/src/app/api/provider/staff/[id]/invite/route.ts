import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { sendStaffInvite } from "@/lib/provider/staff-invite";
import { trackServer } from "@/lib/analytics/amplitude/server";
import { EVENT_STAFF_INVITED } from "@/lib/analytics/amplitude/types";
import { z } from "zod";

const inviteSchema = z.object({
  email: z.string().email("Invalid email address"),
  message: z.string().optional(),
});

/**
 * POST /api/provider/staff/[id]/invite
 *
 * Send staff invitation (Resend email + optional OneSignal push).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const permissionCheck = await requirePermission("manage_team", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const { id } = await params;
    const body = await request.json();

    const validationResult = inviteSchema.safeParse(body);
    if (!validationResult.success) {
      return errorResponse(
        "Validation failed",
        "VALIDATION_ERROR",
        400,
        validationResult.error.issues
      );
    }

    const providerId = await getProviderIdForUser(user.id, supabase, { request });
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data: staff, error: staffError } = await supabase
      .from("provider_staff")
      .select("id, name, email, user_id")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (staffError || !staff) {
      return notFoundResponse("Staff member not found");
    }

    const { data: provider } = await supabase
      .from("providers")
      .select("business_name, tenant_id")
      .eq("id", providerId)
      .single();

    const inviteEmail = (staff.email || validationResult.data.email || "").trim().toLowerCase();
    if (!inviteEmail) {
      return errorResponse("Staff member has no email address", "VALIDATION_ERROR", 400);
    }

    const { data: inviterProfile } = await supabase
      .from("users")
      .select("full_name, email")
      .eq("id", user.id)
      .maybeSingle();
    const inviter = inviterProfile as { full_name?: string | null; email?: string | null } | null;

    const delivery = await sendStaffInvite({
      supabase,
      staffId: id,
      providerId,
      tenantId: (provider as { tenant_id?: string | null } | null)?.tenant_id ?? null,
      inviterUserId: user.id,
      inviterName: inviter?.full_name ?? inviter?.email ?? null,
      customMessage: validationResult.data.message ?? null,
      recipientUserId: staff.user_id ?? null,
      recipientEmail: inviteEmail,
    });

    void trackServer(EVENT_STAFF_INVITED, {
      user_id: user.id,
      staff_id: id,
      provider_id: providerId,
      email_delivered: delivery.email.delivered,
      push_delivered: delivery.push.delivered,
    }).catch((err) => console.warn("[staff-invite] analytics failed:", err));

    if (!delivery.email.delivered && !delivery.push.delivered) {
      return errorResponse(
        delivery.email.error ||
          delivery.push.error ||
          "Failed to send invite. Configure Resend in Admin → Integrations or ensure the user has the Provider app installed.",
        "INVITE_DELIVERY_FAILED",
        502,
        {
          join_url: delivery.join_url,
          email: delivery.email,
          push: delivery.push,
        },
      );
    }

    return successResponse({
      success: true,
      message: "Invitation sent successfully",
      email: inviteEmail,
      join_url: delivery.join_url,
      channels: {
        push: delivery.push.delivered,
        email: delivery.email.delivered,
      },
      delivery: {
        email: delivery.email,
        push: delivery.push,
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to send invitation");
  }
}
