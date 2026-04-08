import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { resolveOneSignalCredentials } from "@/lib/platform/secrets";
import { z } from "zod";

const inviteSchema = z.object({
  email: z.string().email("Invalid email address"),
  message: z.string().optional(),
});

/**
 * POST /api/provider/staff/[id]/invite
 * 
 * Send invitation email to staff member
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

    // Validate input
    const validationResult = inviteSchema.safeParse(body);
    if (!validationResult.success) {
      return errorResponse(
        "Validation failed",
        "VALIDATION_ERROR",
        400,
        validationResult.error.issues
      );
    }

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Get staff member
    const { data: staff, error: staffError } = await supabase
      .from("provider_staff")
      .select("id, name, email, user_id")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (staffError || !staff) {
      return notFoundResponse("Staff member not found");
    }

    // Get provider info for email
    const { data: provider } = await supabase
      .from("providers")
      .select("business_name, owner_name")
      .eq("id", providerId)
      .single();

    // Generate invitation token used in push/email deep links.
    const invitationToken = Buffer.from(`${id}:${Date.now()}`).toString('base64');
    const businessName = provider?.business_name || 'the team';
    const inviteEmail = (staff.email || validationResult.data.email || "").trim().toLowerCase();
    const appBase = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
    const inviteUrl = `${appBase}/provider/onboarding?invite=${encodeURIComponent(invitationToken)}`;

    let pushSent = false;
    let emailSent = false;

    // Notify via OneSignal if staff has user_id (existing user)
    if (staff.user_id) {
      try {
        const { sendToUser } = await import('@/lib/notifications/onesignal');
        await sendToUser(
          staff.user_id,
          {
            title: `Invitation to join ${businessName}`,
            message: validationResult.data.message || `You've been invited to join ${businessName} as a team member.`,
            data: {
              type: 'staff_invitation',
              staff_id: id,
              provider_id: providerId,
              invitation_token: invitationToken,
            },
            url: `/provider/onboarding?invite=${invitationToken}`,
          },
          ["push"],
          { appType: "provider" }
        );
        pushSent = true;
      } catch (notifError) {
        console.error('Staff invite notification failed:', notifError);
      }
    }

    // Always try email delivery; required path for staff without linked app account.
    if (inviteEmail) {
      try {
        const creds = await resolveOneSignalCredentials("provider");
        if (creds.appId && creds.restKey) {
          const emailSubject = `Invitation to join ${businessName}`;
          const emailBody =
            (validationResult.data.message?.trim() ||
              `You've been invited to join ${businessName} as a team member.`) +
            `\n\nOpen this link to continue: ${inviteUrl}`;

          const oneSignalRes = await fetch("https://api.onesignal.com/notifications?c=push", {
            method: "POST",
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              "Authorization": `Key ${creds.restKey}`,
            },
            body: JSON.stringify({
              app_id: creds.appId,
              target_channel: "email",
              include_email_tokens: [inviteEmail],
              email_subject: emailSubject,
              email_body: emailBody,
              data: {
                type: "staff_invitation",
                staff_id: id,
                provider_id: providerId,
                invitation_token: invitationToken,
              },
            }),
          });
          if (!oneSignalRes.ok) {
            const errBody = await oneSignalRes.text();
            console.error("Staff invite email failed:", errBody);
          } else {
            emailSent = true;
          }
        }
      } catch (emailErr) {
        console.error("Staff invite email failed:", emailErr);
      }
    }

    if (!pushSent && !emailSent) {
      return errorResponse(
        "Failed to send invite. Configure provider OneSignal email credentials or ensure user has push registration.",
        "INVITE_DELIVERY_FAILED",
        502
      );
    }

    return successResponse({
      success: true,
      message: "Invitation sent successfully",
      email: inviteEmail || validationResult.data.email,
      channels: {
        push: pushSent,
        email: emailSent,
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to send invitation");
  }
}
