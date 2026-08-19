import { timingSafeEqual } from "crypto";

/** Fixed App Review demo account (Partner app). */
export const APP_REVIEW_DEMO_UID = "11ccc539-9160-47be-b7b3-5fef986f1033";
export const APP_REVIEW_DEMO_EMAIL = "buntulink@gmail.com";
export const APP_REVIEW_DEMO_PHONE = "+27790624995";

/** Fixed App Review demo account (Customer app). */
export const APP_REVIEW_CUSTOMER_DEMO_UID = "8adda800-6d2e-47c8-bcab-caa2feb4f323";
export const APP_REVIEW_CUSTOMER_DEMO_EMAIL = "nomi@ferdose.com";
export const APP_REVIEW_CUSTOMER_DEMO_PHONE = "+27716429097";

export type AppReviewDemoAccount = {
  uid: string;
  email: string;
  phone: string;
};

const APP_REVIEW_DEMO_ACCOUNTS: AppReviewDemoAccount[] = [
  {
    uid: APP_REVIEW_DEMO_UID,
    email: APP_REVIEW_DEMO_EMAIL,
    phone: APP_REVIEW_DEMO_PHONE,
  },
  {
    uid: APP_REVIEW_CUSTOMER_DEMO_UID,
    email: APP_REVIEW_CUSTOMER_DEMO_EMAIL,
    phone: APP_REVIEW_CUSTOMER_DEMO_PHONE,
  },
];

export function getAppReviewDemoOtp(): string {
  return (process.env.APP_REVIEW_DEMO_OTP ?? "246810").trim();
}

/** Provider demo phone only — env override must not affect customer matcher. */
export function getAppReviewDemoPhone(): string {
  const fromEnv = (process.env.APP_REVIEW_DEMO_PHONE ?? "").trim();
  return fromEnv || APP_REVIEW_DEMO_PHONE;
}

function getProviderDemoAccount(): AppReviewDemoAccount {
  return {
    uid: APP_REVIEW_DEMO_UID,
    email: APP_REVIEW_DEMO_EMAIL,
    phone: getAppReviewDemoPhone(),
  };
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

function phonesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeZaMobileDigits(a);
  const nb = normalizeZaMobileDigits(b);
  return Boolean(na && nb && na === nb);
}

export function isAppReviewDemoProviderUserId(userId: string | null | undefined): boolean {
  return Boolean(userId && userId === APP_REVIEW_DEMO_UID);
}

export function isAppReviewDemoUserId(userId: string | null | undefined): boolean {
  return Boolean(
    userId &&
      APP_REVIEW_DEMO_ACCOUNTS.some((account) => account.uid === userId),
  );
}

export function resolveAppReviewDemoAccount(input: {
  email?: string | null;
  phone?: string | null;
  userId?: string | null;
}): AppReviewDemoAccount | null {
  if (input.userId) {
    const byId = APP_REVIEW_DEMO_ACCOUNTS.find((account) => account.uid === input.userId);
    if (byId) {
      return byId.uid === APP_REVIEW_DEMO_UID ? getProviderDemoAccount() : byId;
    }
  }

  const email = normalizeEmail(input.email);
  if (email) {
    if (email === normalizeEmail(APP_REVIEW_DEMO_EMAIL)) return getProviderDemoAccount();
    if (email === normalizeEmail(APP_REVIEW_CUSTOMER_DEMO_EMAIL)) {
      return APP_REVIEW_DEMO_ACCOUNTS.find((account) => account.uid === APP_REVIEW_CUSTOMER_DEMO_UID) ?? null;
    }
  }

  const phone = input.phone?.trim();
  if (phone) {
    if (phonesMatch(phone, getAppReviewDemoPhone())) return getProviderDemoAccount();
    if (phonesMatch(phone, APP_REVIEW_CUSTOMER_DEMO_PHONE)) {
      return APP_REVIEW_DEMO_ACCOUNTS.find((account) => account.uid === APP_REVIEW_CUSTOMER_DEMO_UID) ?? null;
    }
  }

  return null;
}

export function isAppReviewDemoEmail(email: string | null | undefined): boolean {
  return resolveAppReviewDemoAccount({ email }) !== null;
}

export function isAppReviewDemoPhone(phone: string | null | undefined): boolean {
  return resolveAppReviewDemoAccount({ phone }) !== null;
}

export function isAppReviewDemoIdentifier(input: {
  email?: string | null;
  phone?: string | null;
}): boolean {
  return resolveAppReviewDemoAccount(input) !== null;
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
