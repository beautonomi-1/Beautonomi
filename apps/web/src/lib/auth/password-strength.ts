import {
  passwordMeetsPolicyRequirements,
  type PublicAuthPolicy,
} from "@/lib/config/auth-policy-public";

export type PasswordStrengthLabelKey = "passwordWeak" | "passwordFair" | "passwordGood" | "passwordStrong";

export type PasswordStrength = {
  /** 0–5: length ≥ 8, length ≥ 12, uppercase, digit, symbol. */
  score: number;
  labelKey: PasswordStrengthLabelKey;
  barClass: string;
  textClass: string;
};

/** Same scoring as the signup forms, so the meter reads the same everywhere. */
export function getPasswordStrength(pw: string): PasswordStrength {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { score, labelKey: "passwordWeak", barClass: "bg-red-500", textClass: "text-red-600" };
  if (score <= 2) return { score, labelKey: "passwordFair", barClass: "bg-amber-500", textClass: "text-amber-600" };
  if (score <= 3) return { score, labelKey: "passwordGood", barClass: "bg-blue-500", textClass: "text-blue-600" };
  return { score, labelKey: "passwordStrong", barClass: "bg-green-500", textClass: "text-green-600" };
}

export type NewPasswordIssue = "minLength" | "policy" | "mismatch";

/** First blocking problem with a new password + confirmation under the platform policy, or null. */
export function getNewPasswordIssue(
  password: string,
  confirm: string,
  policy: Pick<PublicAuthPolicy, "minimum_password_length" | "password_requirements">,
): NewPasswordIssue | null {
  if (password.length < policy.minimum_password_length) return "minLength";
  if (!passwordMeetsPolicyRequirements(password, policy.password_requirements)) return "policy";
  if (password !== confirm) return "mismatch";
  return null;
}
