import { sendTemplateNotification } from "@/lib/notifications/onesignal";

export type IdentityVerificationOutcome = "approved" | "rejected";

const CUSTOMER_VERIFICATION_URL = "/account-settings/identity-verification";
const PROVIDER_VERIFICATION_URL = "/provider/settings/verification";

const DEFAULT_REJECTION_REASON =
  "We could not verify your document. Please upload a clear photo of a valid ID";

/**
 * Notify a customer or provider that their identity verification was reviewed.
 * Non-fatal: logs and swallows errors so review flows never fail on notification.
 */
export async function notifyIdentityVerificationReviewed(params: {
  userId: string;
  outcome: IdentityVerificationOutcome;
  rejectionReason?: string | null;
  isProvider: boolean;
  tenantId?: string | null;
}): Promise<void> {
  const { userId, outcome, rejectionReason, isProvider, tenantId } = params;
  if (!userId) return;

  const templateKey =
    outcome === "approved"
      ? "identity_verification_approved"
      : "identity_verification_rejected";

  const verificationUrl = isProvider
    ? PROVIDER_VERIFICATION_URL
    : CUSTOMER_VERIFICATION_URL;

  const variables: Record<string, string> = {
    verification_url: verificationUrl,
  };

  if (outcome === "rejected") {
    // Plain reason without trailing punctuation — templates supply the
    // surrounding copy ("Reason: {{rejection_reason}}." etc).
    const reason = (rejectionReason ?? "").trim().replace(/[.\s]+$/, "");
    variables.rejection_reason = reason || DEFAULT_REJECTION_REASON;
  }

  try {
    await sendTemplateNotification(
      templateKey,
      [userId],
      variables,
      ["push", "email"],
      {
        appType: isProvider ? "provider" : "customer",
        tenantId: tenantId ?? undefined,
      },
    );
  } catch (err) {
    console.error(
      `[notifyIdentityVerificationReviewed] failed for user ${userId} (${outcome}):`,
      err,
    );
  }
}

/**
 * Returns true when a terminal identity status changed (avoids duplicate webhook sends).
 */
export function shouldNotifyIdentityVerificationTransition(
  previousStatus: string | null | undefined,
  nextStatus: string,
): nextStatus is IdentityVerificationOutcome {
  if (nextStatus !== "approved" && nextStatus !== "rejected") {
    return false;
  }
  const prev = (previousStatus ?? "").trim().toLowerCase();
  return prev !== nextStatus;
}

export function extractSumsubRejectionReason(payload: {
  reviewResult?: {
    clientComment?: string;
    moderationComment?: string;
    rejectLabels?: string[];
  };
}): string | null {
  const reviewResult = payload.reviewResult;
  if (!reviewResult) return null;

  const parts = [
    reviewResult.clientComment,
    reviewResult.moderationComment,
    ...(reviewResult.rejectLabels ?? []),
  ]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean);

  return parts.length > 0 ? parts.join(". ") : null;
}
