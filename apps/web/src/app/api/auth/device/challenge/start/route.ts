import { NextRequest } from "next/server";
import {
  handleApiError,
  requireAuthInApi,
  successResponse,
} from "@/lib/supabase/api-helpers";
import { startSecurityCode } from "@/lib/auth/security-codes";
import { describeDevice } from "@/lib/auth/trust-device";
import { deliverableEmail } from "@/lib/notifications/security-notifications";

/** Emails a 6-digit code to verify the current device/session. */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuthInApi(request);
    if (!deliverableEmail(user.email)) {
      return handleApiError(
        Object.assign(new Error("There's no email on this account. Sign in again with a code sent to your phone."), {
          status: 422,
          code: "NO_EMAIL_ON_FILE",
          details: { methods: user.phone ? ["sms_signin"] : [] },
        }),
      );
    }
    const result = await startSecurityCode({
      request,
      userId: user.id,
      purpose: "device_verification",
      templateKey: "security_device_verification_code",
      variables: { device_label: describeDevice(request).label },
    });
    return successResponse({ ...result, delivery: "email" });
  } catch (error) {
    return handleApiError(error);
  }
}
