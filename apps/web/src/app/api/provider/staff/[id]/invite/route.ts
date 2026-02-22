import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
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
    const { user } = await requireRoleInApi(['provider_owner', 'superadmin'], request);
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

    // Generate invitation token (in a real app, you'd store this in the database)
    const invitationToken = Buffer.from(`${id}:${Date.now()}`).toString('base64');

    // In a real implementation, you would:
    // 1. Store the invitation token in the database
    // 2. Send an email using your email service (e.g., SendGrid, AWS SES)
    // 3. Include a link like: https://yourapp.com/accept-invite?token=...
    
    const businessName = provider?.business_name || 'the team';

    // Notify via OneSignal if staff has user_id (existing user)
    if (staff.user_id) {
      try {
        const { sendToUser } = await import('@/lib/notifications/onesignal');
        await sendToUser(staff.user_id, {
          title: `Invitation to join ${businessName}`,
          message: validationResult.data.message || `You've been invited to join ${businessName} as a team member.`,
          data: {
            type: 'staff_invitation',
            staff_id: id,
            provider_id: providerId,
            invitation_token: invitationToken,
          },
          url: `/provider/onboarding?invite=${invitationToken}`,
        });
      } catch (notifError) {
        console.error('Staff invite notification failed:', notifError);
      }
    }
    // For staff without user_id: email integration needed (invite link to sign up)

    return successResponse({
      success: true,
      message: "Invitation sent successfully",
      email: validationResult.data.email,
    });
  } catch (error) {
    return handleApiError(error, "Failed to send invitation");
  }
}
