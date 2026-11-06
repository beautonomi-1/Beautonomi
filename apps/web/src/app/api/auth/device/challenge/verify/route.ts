import { NextRequest } from "next/server";
import {
  handleApiError,
  requireAuthInApi,
  successResponse,
} from "@/lib/supabase/api-helpers";
import { verifySecurityCode } from "@/lib/auth/security-codes";
import { describeDevice, readSessionIdFromRequest, trustCurrentDevice } from "@/lib/auth/trust-device";
import { sendSecurityAlert } from "@/lib/notifications/security-notifications";

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuthInApi(request);
    const body = (await request.json().catch(() => ({}))) as { challenge_id?: string; code?: string };
    if (!body.challenge_id || !body.code) {
      return handleApiError(
        Object.assign(new Error("Enter the 6-digit code."), { status: 400, code: "VALIDATION_ERROR" }),
      );
    }

    try {
      await verifySecurityCode({
        userId: user.id,
        challengeId: body.challenge_id,
        code: body.code,
        purpose: "device_verification",
      });
    } catch (err) {
      if ((err as { code?: string }).code === "TOO_MANY_ATTEMPTS" && (err as { details?: { exhausted?: boolean } }).details?.exhausted) {
        await sendSecurityAlert({
          key: "security_signin_attempt_blocked",
          userId: user.id,
          eventId: `device_code_blocked:${body.challenge_id}`,
          variables: { reason: "Too many incorrect verification codes were entered." },
        });
      }
      throw err;
    }

    await trustCurrentDevice(request, user.id, "email_code");
    const sessionId = await readSessionIdFromRequest(request);
    await sendSecurityAlert({
      key: "security_new_device_signin",
      userId: user.id,
      eventId: `new_device:${sessionId ?? body.challenge_id}`,
      variables: {
        device_label: describeDevice(request).label,
        location: request.headers.get("x-vercel-ip-country") || "an unknown location",
        signin_time: new Date().toUTCString(),
      },
    });

    return successResponse({ status: "trusted" });
  } catch (error) {
    return handleApiError(error);
  }
}
