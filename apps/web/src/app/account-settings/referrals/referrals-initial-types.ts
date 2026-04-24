export type ReferralStats = {
  total_referrals: number;
  successful_referrals: number;
  total_earnings: number;
  pending_earnings: number;
};

export type ReferralSettings = {
  referral_amount: number;
  referral_message: string;
  referral_currency: string;
  is_enabled: boolean;
};

export type ReferralsPageInitial = {
  referral_code: string;
  referral_link: string;
  stats: ReferralStats;
  settings: ReferralSettings;
};
