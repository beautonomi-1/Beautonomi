import "server-only";

import { createNextRequestFromHeaders } from "@/lib/server/create-next-request";
import { GET as getMeReferrals } from "@/app/api/me/referrals/route";
import { GET as getPublicReferralSettings } from "@/app/api/public/referrals/settings/route";
import type { ReferralSettings, ReferralsPageInitial } from "./referrals-initial-types";

const DEFAULT_MESSAGE =
  "Join Beautonomi and get rewarded! Use my referral link to get started.";

export async function fetchReferralsInitial(): Promise<ReferralsPageInitial | null> {
  const [meReq, pubReq] = await Promise.all([
    createNextRequestFromHeaders("/api/me/referrals"),
    createNextRequestFromHeaders("/api/public/referrals/settings"),
  ]);

  const [meRes, pubRes] = await Promise.all([
    getMeReferrals(meReq),
    getPublicReferralSettings(pubReq),
  ]);

  const meJson = (await meRes.json().catch(() => ({}))) as {
    data?: {
      referral_code: string;
      referral_link: string;
      stats: ReferralsPageInitial["stats"];
      settings: Partial<ReferralSettings>;
    };
  };
  if (!meRes.ok || !meJson.data?.referral_code) return null;

  const me = meJson.data;
  let publicSettings: ReferralSettings | null = null;
  if (pubRes.ok) {
    const pubJson = (await pubRes.json().catch(() => ({}))) as { data?: ReferralSettings };
    if (pubJson.data && typeof pubJson.data.referral_amount === "number") {
      publicSettings = pubJson.data;
    }
  }

  const base = me.settings as ReferralSettings | undefined;
  const settings: ReferralSettings = {
    referral_amount: publicSettings?.referral_amount ?? base?.referral_amount ?? 50,
    referral_message: publicSettings?.referral_message ?? base?.referral_message ?? DEFAULT_MESSAGE,
    referral_currency: publicSettings?.referral_currency ?? base?.referral_currency ?? "ZAR",
    is_enabled: publicSettings?.is_enabled ?? base?.is_enabled ?? true,
  };

  return {
    referral_code: me.referral_code,
    referral_link: me.referral_link,
    stats: me.stats,
    settings,
  };
}
