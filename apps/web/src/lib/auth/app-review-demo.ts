import { timingSafeEqual } from "crypto";

/** Fixed App Review demo account (Partner app). */
export const APP_REVIEW_DEMO_UID = "11ccc539-9160-47be-b7b3-5fef986f1033";
export const APP_REVIEW_DEMO_EMAIL = "buntulink@gmail.com";
export const APP_REVIEW_DEMO_PHONE = "+27790624995";

export function getAppReviewDemoOtp(): string {
  return (process.env.APP_REVIEW_DEMO_OTP ?? "246810").trim();
}

export function getAppReviewDemoPhone(): string {
  const fromEnv = (process.env.APP_REVIEW_DEMO_PHONE ?? "").trim();
  return fromEnv || APP_REVIEW_DEMO_PHONE;
}

export function isAppReviewDemoUserId(userId: string | null | undefined): boolean {
  return Boolean(userId && userId === APP_REVIEW_DEMO_UID);
}

function normalizeEmail(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function digitsOnly(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

/** ZA mobile: 27790624995, 790624995, 0790624995, +27 79 062 4995 */
export function normalizeZaMobileDigits(value: string | null | undefined): string {
  let digits = digitsOnly(value);
  if (!digits) return "";
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("27") && digits.length >= 11) return digits.slice(0, 11);
  if (digits.startsWith("0") && digits.length === 10) return `27${digits.slice(1)}`;
  if (digits.length === 9) return `27${digits}`;
  return digits;
}

export function isAppReviewDemoEmail(email: string | null | undefined): boolean {
  return normalizeEmail(email) === normalizeEmail(APP_REVIEW_DEMO_EMAIL);
}

export function isAppReviewDemoPhone(phone: string | null | undefined): boolean {
  const a = normalizeZaMobileDigits(phone);
  const b = normalizeZaMobileDigits(getAppReviewDemoPhone());
  return Boolean(a && b && a === b);
}

export function isAppReviewDemoIdentifier(input: {
  email?: string | null;
  phone?: string | null;
}): boolean {
  return isAppReviewDemoEmail(input.email) || isAppReviewDemoPhone(input.phone);
}

function timingSafeEqualString(received: string, expected: string): boolean {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  const max = Math.max(a.length, b.length, 1);
  const aPad = Buffer.alloc(max);
  const bPad = Buffer.alloc(max);
  a.copy(aPad);
  b.copy(bPad);
  return timingSafeEqual(aPad, bPad) && a.length === b.length;
}

export function isAppReviewDemoOtp(otp: string | null | undefined): boolean {
  return timingSafeEqualString((otp ?? "").trim(), getAppReviewDemoOtp());
}

/** Kill switch only — unset means enabled (identifier + OTP is the real gate). */
export function isAppReviewDemoEndpointEnabled(): boolean {
  const flag = (process.env.APP_REVIEW_DEMO_ENABLED ?? "").trim().toLowerCase();
  if (flag === "false" || flag === "0" || flag === "off") return false;
  return true;
}
