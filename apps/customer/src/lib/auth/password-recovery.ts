import type { PublicAuthPolicy } from "@/lib/config-bundle";

const LETTERS = /[A-Za-z]/;
const LOWER = /[a-z]/;
const UPPER = /[A-Z]/;
const DIGIT = /[0-9]/;

/** Same rules as web `passwordMeetsPolicyRequirements`. */
export function passwordMeetsPolicyRequirements(
  password: string,
  mode: PublicAuthPolicy["password_requirements"],
): boolean {
  if (mode === "none") return true;
  if (mode === "letters_and_digits") return LETTERS.test(password) && DIGIT.test(password);
  return LOWER.test(password) && UPPER.test(password) && DIGIT.test(password);
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

export type PasswordStrength = {
  /** 0–5: length ≥ 8, length ≥ 12, uppercase, digit, symbol. */
  score: number;
  labelKey: "passwordWeak" | "passwordFair" | "passwordGood" | "passwordStrong";
  color: string;
};

/** Same scoring as the signup screen and web, so the meter reads the same everywhere. */
export function getPasswordStrength(pw: string): PasswordStrength {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { score, labelKey: "passwordWeak", color: "#EF4444" };
  if (score <= 2) return { score, labelKey: "passwordFair", color: "#F59E0B" };
  if (score <= 3) return { score, labelKey: "passwordGood", color: "#3B82F6" };
  return { score, labelKey: "passwordStrong", color: "#22C55E" };
}
