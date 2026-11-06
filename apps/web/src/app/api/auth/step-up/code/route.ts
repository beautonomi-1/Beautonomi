import { NextRequest } from "next/server";
import {
  handleApiError,
  requireAuthInApi,
  successResponse,
} from "@/lib/supabase/api-helpers";
import { startSecurityCode } from "@/lib/auth/security-codes";
import { deliverableEmail } from "@/lib/notifications/security-notifications";

const ACTION_LABELS: Record<string, string> = {
  payout_account: "payout account",
  stripe_connect: "payout account",
  payout_transfer: "payout",
  password_change: "password",
  contact_change: "contact details",
  team_change: "team access",
};

/** Emails a confirmation code for step-up (sensitive change). */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuthInApi(request);
    if (!deliverableEmail(user.email)) {
      return handleApiError(
        Object.assign(new Error("There's no email on this account."), {
          status: 422,
          code: "NO_EMAIL_ON_FILE",
          details: { methods: user.phone ? ["sms_signin"] : [] },
        }),
      );
    }
    const body = (await request.json().catch(() => ({}))) as { action?: string };
    const result = await startSecurityCode({
      request,
      userId: user.id,
      purpose: "step_up",
      templateKey: "security_step_up_code",
      variables: { action_label: ACTION_LABELS[body.action ?? ""] ?? "account security" },
    });
    return successResponse(result);
  } catch (error) {
    return handleApiError(error);
  }
}
