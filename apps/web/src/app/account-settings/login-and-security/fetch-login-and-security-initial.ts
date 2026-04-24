import "server-only";

import { createNextRequestFromHeaders } from "@/lib/server/create-next-request";
import { GET as getProfile } from "@/app/api/me/profile/route";
import { GET as getAccountSecurityCopy } from "@/app/api/public/account-security-copy/route";

export type AccountSecurityCopyPayload = {
  title: string;
  body: string;
  safety_tips_customer: { label: string; url: string };
  safety_tips_provider: { label: string; url: string };
};

export type LoginAndSecurityInitial = {
  profile: {
    email?: string | null;
    phone?: string | null;
    password_changed_at?: string | null;
  };
  securityCopy: AccountSecurityCopyPayload | null;
};

export async function fetchLoginAndSecurityInitial(): Promise<LoginAndSecurityInitial | null> {
  const reqProfile = await createNextRequestFromHeaders("/api/me/profile");
  const resProfile = await getProfile(reqProfile);
  if (!resProfile.ok) return null;

  const pj = (await resProfile.json().catch(() => ({}))) as {
    data?: { email?: string | null; phone?: string | null; password_changed_at?: string | null };
  };
  const profile = pj.data;
  if (!profile || typeof profile !== "object") return null;

  const reqCopy = await createNextRequestFromHeaders("/api/public/account-security-copy");
  const resCopy = await getAccountSecurityCopy(reqCopy);
  let securityCopy: AccountSecurityCopyPayload | null = null;
  if (resCopy.ok) {
    const cj = (await resCopy.json().catch(() => ({}))) as { data?: AccountSecurityCopyPayload };
    const d = cj.data;
    if (d && typeof d === "object" && "title" in d && typeof (d as { title?: unknown }).title === "string") {
      securityCopy = d as AccountSecurityCopyPayload;
    }
  }

  return {
    profile: {
      email: profile.email ?? null,
      phone: profile.phone ?? null,
      password_changed_at: profile.password_changed_at ?? null,
    },
    securityCopy,
  };
}
