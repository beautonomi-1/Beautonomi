import type { ApiResponse } from "@beautonomi/types";
import { getHttpErrorStatus } from "@/lib/api-error";

/**
 * Whether to drop a pending signup referral code from local storage after attach.
 * Keep the code on transient failures so the next login can retry attribution.
 */
export function shouldClearStoredReferralAfterAttach(
  res: Pick<ApiResponse<unknown>, "error"> | null | undefined,
): boolean {
  if (!res) return false;
  if (!res.error) return true;
  const status = getHttpErrorStatus(res.error);
  return status === 400 || status === 404;
}
