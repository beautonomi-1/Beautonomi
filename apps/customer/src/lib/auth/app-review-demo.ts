import { api } from "@/lib/api-client";
import { supabase } from "@/lib/supabase/client";

export const APP_REVIEW_CUSTOMER_DEMO_UID = "8adda800-6d2e-47c8-bcab-caa2feb4f323";
export const APP_REVIEW_CUSTOMER_DEMO_EMAIL = "nomi@ferdose.com";
export const APP_REVIEW_CUSTOMER_DEMO_PHONE = "+27716429097";

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/** ZA mobile: 27716429097, 716429097, 0716429097, +27 71 642 9097 */
function normalizeZaMobileDigits(value: string): string {
  let digits = digitsOnly(value);
  if (!digits) return "";
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("27") && digits.length >= 11) return digits.slice(0, 11);
  if (digits.startsWith("0") && digits.length === 10) return `27${digits.slice(1)}`;
  if (digits.length === 9) return `27${digits}`;
  return digits;
}

export function isAppReviewDemoUserId(userId: string | null | undefined): boolean {
  return Boolean(userId && userId === APP_REVIEW_CUSTOMER_DEMO_UID);
}

export function isAppReviewDemoEmail(email: string | null | undefined): boolean {
  return normalizeEmail(email ?? "") === normalizeEmail(APP_REVIEW_CUSTOMER_DEMO_EMAIL);
}

export function isAppReviewDemoPhone(phone: string | null | undefined): boolean {
  const a = normalizeZaMobileDigits(phone ?? "");
  const b = normalizeZaMobileDigits(APP_REVIEW_CUSTOMER_DEMO_PHONE);
  return Boolean(a && b && a === b);
}

type DemoSessionResponse = {
  access_token: string;
  refresh_token: string;
};

export async function completeAppReviewDemoSignIn(params: {
  email?: string;
  phone?: string;
  otp: string;
}): Promise<void> {
  const res = await api.post<DemoSessionResponse>("/api/auth/app-review/verify-otp", params);
  if (res.error || !res.data?.access_token || !res.data?.refresh_token) {
    throw new Error(res.error?.message ?? "App review sign-in failed");
  }
  const { error } = await supabase.auth.setSession({
    access_token: res.data.access_token,
    refresh_token: res.data.refresh_token,
  });
  if (error) throw error;
}
