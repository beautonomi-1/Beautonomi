import { errorResponse, notFoundResponse } from "@/lib/supabase/api-helpers";
import type { ResendGroupGuestInviteResult } from "@/lib/bookings/resend-group-guest-invite";

type FailureCode = Extract<ResendGroupGuestInviteResult, { ok: false }>["code"];

export function resendInviteErrorResponse(code: FailureCode) {
  switch (code) {
    case "NOT_SPLIT":
      return errorResponse("This guest does not pay their own share.", "NOT_SPLIT", 400);
    case "SHARE_CLOSED":
      return errorResponse("This guest's spot is no longer active.", "SHARE_CLOSED", 409);
    case "TOO_SOON":
      return errorResponse("An invite was just sent. Try again in a minute.", "TOO_SOON", 429);
    default:
      return notFoundResponse("Participant not found");
  }
}
