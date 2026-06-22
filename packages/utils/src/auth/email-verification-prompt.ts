import { isMailableEmail } from "./mailable-email";

/** First mailable address among candidates (auth email, profile row, etc.). */
export function resolveMailableAccountEmail(
  ...candidates: Array<string | null | undefined>
): string | null {
  for (const candidate of candidates) {
    if (isMailableEmail(candidate)) {
      return candidate!.trim();
    }
  }
  return null;
}

export type ProfileEmailVerificationState = {
  mailableEmail: string | null;
  hasMailableEmail: boolean;
  emailVerified: boolean;
  /** No real email to verify, or email is already confirmed. */
  verificationSatisfied: boolean;
  /** Profile gates / checklist should require email verification. */
  verificationRequired: boolean;
};

export function resolveProfileEmailVerificationState(args: {
  profileEmail?: string | null;
  authEmail?: string | null;
  emailVerifiedFlag?: boolean | null;
  emailConfirmedAt?: string | null;
}): ProfileEmailVerificationState {
  const mailableEmail = resolveMailableAccountEmail(args.authEmail, args.profileEmail);
  const hasMailableEmail = Boolean(mailableEmail);
  const emailVerified = Boolean(args.emailVerifiedFlag || args.emailConfirmedAt);
  const verificationSatisfied = !hasMailableEmail || emailVerified;

  return {
    mailableEmail,
    hasMailableEmail,
    emailVerified,
    verificationSatisfied,
    verificationRequired: hasMailableEmail,
  };
}

const DEFAULT_BANNER_MAX_ACCOUNT_AGE_DAYS = 7;

/**
 * Whether to show the global "verify your email" banner.
 * Phone-only / placeholder-email accounts never qualify.
 */
export function shouldShowEmailVerificationBanner(args: {
  profileEmail?: string | null;
  authEmail?: string | null;
  emailVerifiedFlag?: boolean | null;
  emailConfirmedAt?: string | null;
  accountCreatedAt?: string | null;
  maxAccountAgeDays?: number;
}): boolean {
  const state = resolveProfileEmailVerificationState(args);
  if (state.verificationSatisfied) return false;

  if (!args.accountCreatedAt) return false;

  const ageDays =
    (Date.now() - new Date(args.accountCreatedAt).getTime()) / (1000 * 60 * 60 * 24);
  return ageDays <= (args.maxAccountAgeDays ?? DEFAULT_BANNER_MAX_ACCOUNT_AGE_DAYS);
}
